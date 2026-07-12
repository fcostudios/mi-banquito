import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";

import { and, desc, eq } from "drizzle-orm";
import {
  buildTenantExportPlan,
  createTenantExportArchive,
  loadTenantExportData,
  type ArchiveFactory,
  type TenantExportPdf,
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

function safeStatementName(input: { id: string; kind: string; periodLabel: string }) {
  const period = input.periodLabel.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `statements/${input.kind}-${period}-${input.id}.pdf`;
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

export async function generateTenantExport(input: {
  orgId: string;
  actorId: string;
  operatorUserId: string;
  now?: Date;
  exportId?: string;
  blob?: AdminExportBlobAdapter;
  archiveFactory?: ArchiveFactory;
}) {
  const now = input.now ?? new Date();
  const exportId = input.exportId ?? randomUUID();
  const blob = input.blob ?? defaultBlobAdapter;
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "mi-banquito-export-"));

  try {
    const data = await loadTenantExportData(input.orgId);
    const pdfs: TenantExportPdf[] = [];
    for (const archive of data.statementArchives) {
      const folder = folderForStatementKind(archive.kind);
      const pathname = `${folder}/${input.orgId}/${archive.canonicalPayloadHash}.pdf`;
      const result = await blob.read(pathname);
      if (!result || result.statusCode !== 200) throw new Error(`statement_artifact_missing:${archive.id}`);
      const localPath = join(temporaryDirectory, `${archive.id}.pdf`);
      const digest = new DigestCounter();
      await pipeline(Readable.fromWeb(result.stream as never), digest, createWriteStream(localPath, { flags: "wx" }));
      const sizeBytes = digest.sizeBytes;
      const pdfSha256 = digest.digest();
      if (sizeBytes !== archive.byteSize) throw new Error(`statement_artifact_size_mismatch:${archive.id}`);
      pdfs.push({
        name: safeStatementName(archive),
        archiveId: archive.id,
        sha256: pdfSha256,
        sizeBytes,
        source: () => createReadStream(localPath),
      });
    }

    const plan = buildTenantExportPlan({ orgId: input.orgId, generatedAt: now, data, pdfs });
    const { stream, completion } = createTenantExportArchive(plan, input.archiveFactory);
    const zipDigest = new DigestCounter();
    stream.on("error", (error) => zipDigest.destroy(error));
    stream.pipe(zipDigest);
    const zipPath = `tenant-exports/${input.orgId}/${exportId}.zip`;
    const uploadPromise = blob.upload(zipPath, zipDigest, "application/zip");
    let uploaded;
    try {
      [uploaded] = await Promise.all([uploadPromise, completion]);
    } catch (error) {
      stream.destroy(error instanceof Error ? error : new Error("tenant_export_stream_failed"));
      throw error;
    }
    if (uploaded.pathname !== zipPath) throw new Error("tenant_export_blob_path_mismatch");
    const zipSha256 = zipDigest.digest();
    const sizeBytes = zipDigest.sizeBytes;
    const payload: DataExportPayload = {
      zipPath,
      zipUri: uploaded.url,
      zipSha256,
      sizeBytes,
      manifestCounts: plan.manifest.entityRowCounts,
      fileCount: Object.keys(plan.manifest.files).length,
      operatorUserId: input.operatorUserId,
    };

    try {
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
    } catch (error) {
      await blob.delete(uploaded.url).catch(() => undefined);
      throw error;
    }

    return { exportId, manifest: plan.manifest, ...payload };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
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
