import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { PassThrough, Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  buildStagedTenantExportPlan,
  createTenantExportArchive,
  stageTenantExportFiles,
  type ArchiveFactory,
} from "@mi-banquito/domain";
import { withTenantTransaction } from "@mi-banquito/db/tenant";
import { auditLogEntry } from "@mi-banquito/db/schema";

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

export function streamArchiveToClient<T>(input: {
  source: Readable;
  archiveCompletion: Promise<void>;
  upload: (body: Readable) => Promise<UploadedBlob>;
  finalize: (uploaded: UploadedBlob, digest: { sha256: string; sizeBytes: number }) => Promise<T>;
  onFailure?: (uploaded: UploadedBlob | undefined) => Promise<void>;
}) {
  const uploadBody = new PassThrough({ highWaterMark: 64 * 1024 });
  const iterator = input.source[Symbol.asyncIterator]();
  const hash = createHash("sha256");
  let sizeBytes = 0;
  let settled = false;
  let uploaded: UploadedBlob | undefined;
  let resolveCompletion!: (value: T) => void;
  let rejectCompletion!: (reason: Error) => void;
  const completion = new Promise<T>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  const uploadPromise = input.upload(uploadBody).then((result) => {
    uploaded = result;
    return result;
  });
  void uploadPromise.catch((error) => {
    const failure = error instanceof Error ? error : new Error(String(error));
    input.source.destroy(failure);
    uploadBody.destroy(failure);
  });

  async function fail(reason: unknown) {
    if (settled) return;
    settled = true;
    const error = reason instanceof Error ? reason : new Error(String(reason));
    input.source.destroy(error);
    uploadBody.destroy(error);
    const completedUpload = await uploadPromise.catch(() => uploaded);
    await input.onFailure?.(completedUpload).catch(() => undefined);
    rejectCompletion(error);
  }

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (settled) return;
      try {
        const next = await iterator.next();
        if (!next.done) {
          const bytes = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value);
          if (!uploadBody.write(bytes)) await once(uploadBody, "drain");
          hash.update(bytes);
          sizeBytes += bytes.byteLength;
          controller.enqueue(bytes);
          return;
        }
        uploadBody.end();
        const [result] = await Promise.all([uploadPromise, input.archiveCompletion]);
        const finalized = await input.finalize(result, { sha256: hash.digest("hex"), sizeBytes });
        settled = true;
        resolveCompletion(finalized);
        controller.close();
      } catch (error) {
        await fail(error);
        controller.error(error);
      }
    },
    async cancel() {
      await fail(new Error("tenant_export_client_disconnected"));
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
}) {
  const now = input.now ?? new Date();
  const exportId = input.exportId ?? randomUUID();
  const blob = input.blob ?? defaultBlobAdapter;
  const cleanup = input.cleanup ?? ((directory: string) => rm(directory, { recursive: true, force: true }));
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "mi-banquito-export-"));

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
    const zipPath = `tenant-exports/${input.orgId}/${exportId}.zip`;
    const streamed = streamArchiveToClient({
      source: archive.stream,
      archiveCompletion: archive.completion,
      upload: (body) => blob.upload(zipPath, body, "application/zip"),
      onFailure: async (uploaded) => {
        if (uploaded) await blob.delete(uploaded.url);
      },
      finalize: async (uploaded, digest) => {
        if (uploaded.pathname !== zipPath) throw new Error("tenant_export_blob_path_mismatch");
        const payload: DataExportPayload = {
          zipPath,
          zipUri: uploaded.url,
          zipSha256: digest.sha256,
          sizeBytes: digest.sizeBytes,
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
        return { exportId, manifest: plan.manifest, ...payload };
      },
    });
    const completion = streamed.completion.finally(async () => {
      await cleanup(temporaryDirectory).catch(() => undefined);
    });
    return { exportId, manifest: plan.manifest, stream: streamed.stream, completion };
  } catch (error) {
    await cleanup(temporaryDirectory).catch(() => undefined);
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
