import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";

import * as Sentry from "@sentry/nextjs";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  buildStagedTenantExportPlan,
  createTenantExportArchive,
  stageTenantExportFiles,
  type ArchiveFactory,
} from "@mi-banquito/domain";
import { withTenantTransaction } from "@mi-banquito/db/tenant";
import { alert, auditLogEntry } from "@mi-banquito/db/schema";

import { deletePrivateBlob, readPrivateBlob, uploadPrivateBlob } from "@/lib/vercel-blob-adapter";

type PrivateBlobRead = Awaited<ReturnType<typeof readPrivateBlob>>;

export type AdminExportBlobAdapter = {
  read(pathname: string): Promise<PrivateBlobRead>;
  upload(pathname: string, body: Readable, contentType: string): Promise<{ url: string; pathname: string }>;
  delete(uri: string): Promise<void>;
};

const defaultBlobAdapter: AdminExportBlobAdapter = {
  read: readPrivateBlob,
  upload: uploadPrivateBlob,
  delete: deletePrivateBlob,
};

const tenantExportRequestSchema = z.object({
  version: z.literal(1),
  orgId: z.string().uuid(),
  exportId: z.string().uuid(),
  actorId: z.string().uuid(),
  operatorUserId: z.string().min(1),
  expiresAt: z.number().int().positive(),
}).strict();

type TenantExportRequest = z.infer<typeof tenantExportRequestSchema>;

export function parseTenantExportPageOrgId(value: string): string | null {
  return z.string().uuid().safeParse(value).success ? value : null;
}

function exportSigningSecret(explicit?: string) {
  const secret = explicit ?? process.env.ADMIN_EXPORT_SIGNING_SECRET ?? process.env.AUTH0_SECRET;
  if (!secret || secret.length < 32) throw new Error("tenant_export_signing_secret_missing");
  return secret;
}

function requestSignature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createTenantExportRequest(
  input: Omit<TenantExportRequest, "version" | "expiresAt">,
  options: { secret?: string; now?: Date; ttlSeconds?: number } = {},
) {
  const ttlSeconds = options.ttlSeconds ?? 300;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) {
    throw new Error("tenant_export_request_ttl_invalid");
  }
  const request = tenantExportRequestSchema.parse({
    ...input,
    version: 1,
    expiresAt: Math.floor((options.now ?? new Date()).getTime() / 1_000) + ttlSeconds,
  });
  const payload = Buffer.from(JSON.stringify(request), "utf8").toString("base64url");
  return `${payload}.${requestSignature(payload, exportSigningSecret(options.secret))}`;
}

export function verifyTenantExportRequest(
  token: string,
  options: { secret?: string; now?: Date } = {},
): TenantExportRequest {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) throw new Error("invalid_parts");
    const [payload, signature] = parts as [string, string];
    const expected = Buffer.from(requestSignature(payload, exportSigningSecret(options.secret)), "utf8");
    const actual = Buffer.from(signature, "utf8");
    if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
      throw new Error("invalid_signature");
    }
    const request = tenantExportRequestSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (request.expiresAt <= Math.floor((options.now ?? new Date()).getTime() / 1_000)) {
      throw new Error("tenant_export_request_expired");
    }
    return request;
  } catch (error) {
    if (error instanceof Error && error.message === "tenant_export_request_expired") throw error;
    throw new Error("tenant_export_request_invalid");
  }
}

class DigestCounter extends Transform {
  readonly hash = createHash("sha256");
  sizeBytes = 0;

  _transform(chunk: Buffer | string, encoding: BufferEncoding, callback: TransformCallback) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
    this.hash.update(bytes);
    this.sizeBytes += bytes.byteLength;
    callback(null, bytes);
  }

  digest() {
    return this.hash.digest("hex");
  }
}

function folderForStatementKind(kind: string): "monthly-close" | "monthly-member" | "year-end" {
  if (kind === "monthly_close") return "monthly-close";
  if (kind === "monthly_member") return "monthly-member";
  return "year-end";
}

type DataExportPayload = {
  zipPath: string;
  zipUri: string;
  zipSha256: string;
  sizeBytes: number;
  manifestCounts: Record<string, number>;
  fileCount: number;
  operatorUserId: string;
};

function parseExportPayload(value: unknown): DataExportPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<DataExportPayload>;
  if (
    typeof payload.zipPath !== "string" ||
    typeof payload.zipUri !== "string" ||
    typeof payload.zipSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(payload.zipSha256) ||
    typeof payload.sizeBytes !== "number" ||
    !Number.isSafeInteger(payload.sizeBytes) ||
    typeof payload.fileCount !== "number" ||
    typeof payload.operatorUserId !== "string" ||
    !payload.manifestCounts ||
    typeof payload.manifestCounts !== "object"
  ) return null;
  return payload as DataExportPayload;
}

type UploadedBlob = { url: string; pathname: string };

type ExportErrorContext = {
  exportId: string;
  orgId: string;
  phase: "preparation" | "response";
  cleanupKind: "temporary_directory" | "uploaded_blob";
};

type ExportErrorReporter = (error: Error, context: ExportErrorContext) => void | Promise<void>;

function defaultExportErrorReporter(error: Error, context: ExportErrorContext) {
  Sentry.captureException(error, {
    tags: {
      feature: "tenant_export",
      phase: context.phase,
      cleanup_kind: context.cleanupKind,
    },
    extra: context,
  });
}

function warnReportingFailure(error: unknown) {
  process.emitWarning(`tenant_export_error_reporting_failed:${asError(error).message}`);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function finalizedFileStream<T>(input: {
  path: string;
  result: T;
  cleanup: () => Promise<void>;
}) {
  const source = createReadStream(input.path);
  const iterator = source[Symbol.asyncIterator]();
  let finished = false;
  let resolveCompletion!: (value: T) => void;
  const completion = new Promise<T>((resolve) => { resolveCompletion = resolve; });

  async function finish() {
    if (finished) return;
    finished = true;
    source.destroy();
    await input.cleanup();
    resolveCompletion(input.result);
  }

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          await finish();
          return;
        }
        controller.enqueue(Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value));
      } catch (error) {
        await finish();
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
      await finish();
    },
  });

  return { stream, completion };
}

export async function prepareTenantExport(input: {
  orgId: string;
  actorId: string;
  operatorUserId: string;
  now?: Date;
  exportId?: string;
  blob?: AdminExportBlobAdapter;
  archiveFactory?: ArchiveFactory;
  cleanup?: (directory: string) => Promise<void>;
  reportError?: ExportErrorReporter;
}) {
  const now = input.now ?? new Date();
  const exportId = input.exportId ?? randomUUID();
  const blob = input.blob ?? defaultBlobAdapter;
  const cleanup = input.cleanup ?? ((directory: string) => rm(directory, { recursive: true, force: true }));
  const reportError = input.reportError ?? defaultExportErrorReporter;
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "mi-banquito-export-"));
  const localZipPath = join(temporaryDirectory, "tenant-export.zip");
  let uploaded: UploadedBlob | undefined;
  let successAuditCommitted = false;

  async function report(error: Error, context: ExportErrorContext) {
    try {
      await reportError(error, context);
    } catch (reportingError) {
      try {
        Sentry.captureException(asError(reportingError), {
          tags: { feature: "tenant_export", failure: "error_reporter" },
          extra: context,
        });
      } catch (sentryError) {
        warnReportingFailure(sentryError);
      }
    }
  }

  async function recordCleanupFailure(error: Error, context: ExportErrorContext) {
    const timestamp = new Date();
    try {
      await withTenantTransaction(input.orgId, async (tx) => {
        await tx.insert(alert).values({
          orgId: input.orgId,
          alertKind: "tenant_export_cleanup_failed",
          severity: "medium",
          audience: "platform_operator",
          subjectKind: "tenant_export",
          subjectId: exportId,
          payload: {
            exportId,
            phase: context.phase,
            cleanupKind: context.cleanupKind,
            error: error.message,
          },
          dedupWindowEnd: new Date(timestamp.getTime() + 24 * 60 * 60 * 1_000),
          dismissedAt: null,
          dismissedBy: null,
          snoozedUntil: null,
          createdAt: timestamp,
        });
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "system",
          actorId: "00000000-0000-4000-8000-000000000000",
          actionKind: "data.export.cleanup_failed",
          subjectKind: "tenant_export",
          subjectId: exportId,
          payloadSnapshot: {
            exportId,
            phase: context.phase,
            cleanupKind: context.cleanupKind,
            error: error.message,
          },
          reason: null,
          at: timestamp,
          createdAt: timestamp,
        });
      });
    } catch (durabilityError) {
      await report(asError(durabilityError), context);
    }
  }

  async function observeCleanupFailure(error: unknown, context: ExportErrorContext) {
    const failure = asError(error);
    await report(failure, context);
    await recordCleanupFailure(failure, context);
  }

  async function cleanupTemporaryDirectory(phase: ExportErrorContext["phase"]) {
    try {
      await cleanup(temporaryDirectory);
    } catch (error) {
      await observeCleanupFailure(error, {
        exportId,
        orgId: input.orgId,
        phase,
        cleanupKind: "temporary_directory",
      });
    }
  }

  try {
    const staged = await stageTenantExportFiles({
      orgId: input.orgId,
      directory: temporaryDirectory,
      stagePdf: async (archive, localPath) => {
        const folder = folderForStatementKind(archive.kind);
        const pathname = `${folder}/${input.orgId}/${archive.canonicalPayloadHash}.pdf`;
        const result = await blob.read(pathname);
        if (!result || result.statusCode !== 200) throw new Error(`statement_artifact_missing:${archive.id}`);
        const digest = new DigestCounter();
        await pipeline(Readable.fromWeb(result.stream as never), digest, createWriteStream(localPath, { flags: "wx" }));
        return { sizeBytes: digest.sizeBytes, sha256: digest.digest() };
      },
    });
    const plan = buildStagedTenantExportPlan({ orgId: input.orgId, generatedAt: now, ...staged });
    const archive = createTenantExportArchive(plan, input.archiveFactory);
    const zipDigest = new DigestCounter();
    await Promise.all([
      pipeline(archive.stream, zipDigest, createWriteStream(localZipPath, { flags: "wx" })),
      archive.completion,
    ]);
    const zipSha256 = zipDigest.digest();
    const sizeBytes = zipDigest.sizeBytes;
    const zipPath = `tenant-exports/${input.orgId}/${exportId}.zip`;
    uploaded = await blob.upload(zipPath, createReadStream(localZipPath), "application/zip");
    if (uploaded.pathname !== zipPath) throw new Error("tenant_export_blob_path_mismatch");
    const payload: DataExportPayload = {
      zipPath,
      zipUri: uploaded.url,
      zipSha256,
      sizeBytes,
      manifestCounts: plan.manifest.entityRowCounts,
      fileCount: Object.keys(plan.manifest.files).length,
      operatorUserId: input.operatorUserId,
    };
    await withTenantTransaction(input.orgId, async (tx) => {
      await tx.insert(auditLogEntry).values({
        id: exportId,
        orgId: input.orgId,
        actorKind: "platform_operator",
        actorId: input.actorId,
        actionKind: "data.exported",
        subjectKind: "organization",
        subjectId: input.orgId,
        payloadSnapshot: payload,
        reason: null,
        at: now,
        createdAt: now,
      });
    });
    successAuditCommitted = true;
    const result = { exportId, manifest: plan.manifest, ...payload };
    const response = finalizedFileStream({
      path: localZipPath,
      result,
      cleanup: () => cleanupTemporaryDirectory("response"),
    });
    return { exportId, manifest: plan.manifest, sizeBytes, stream: response.stream, completion: response.completion };
  } catch (error) {
    if (uploaded && !successAuditCommitted) {
      try {
        await blob.delete(uploaded.url);
      } catch (cleanupError) {
        await observeCleanupFailure(cleanupError, {
          exportId,
          orgId: input.orgId,
          phase: "preparation",
          cleanupKind: "uploaded_blob",
        });
      }
    }
    await cleanupTemporaryDirectory("preparation");
    throw error;
  }
}

export type TenantExportHistoryRow = {
  id: string;
  generatedAt: Date;
  operatorId: string;
  payload: DataExportPayload;
};

export async function loadTenantExportHistory(orgId: string): Promise<TenantExportHistoryRow[]> {
  return withTenantTransaction(orgId, async (tx) => {
    const rows = await tx.select({
      id: auditLogEntry.id,
      generatedAt: auditLogEntry.at,
      operatorId: auditLogEntry.actorId,
      payload: auditLogEntry.payloadSnapshot,
    }).from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, orgId),
      eq(auditLogEntry.actionKind, "data.exported"),
      eq(auditLogEntry.actorKind, "platform_operator"),
    )).orderBy(desc(auditLogEntry.at), desc(auditLogEntry.id));
    return rows.flatMap((row) => {
      const payload = parseExportPayload(row.payload);
      return payload ? [{ id: row.id, generatedAt: row.generatedAt, operatorId: row.operatorId, payload }] : [];
    });
  });
}

export async function loadTenantExportDownload(input: { orgId: string; exportId: string; blob?: AdminExportBlobAdapter }) {
  const [history] = (await loadTenantExportHistory(input.orgId)).filter((row) => row.id === input.exportId);
  if (!history || !history.payload.zipPath.startsWith(`tenant-exports/${input.orgId}/`)) return null;
  const result = await (input.blob ?? defaultBlobAdapter).read(history.payload.zipPath);
  if (!result || result.statusCode !== 200) throw new Error("tenant_export_blob_missing");
  return { history, blob: result };
}
