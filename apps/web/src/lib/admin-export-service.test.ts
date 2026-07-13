import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { loadEnvFile } from "node:process";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { alert, auditLogEntry, organization, statementArchive } from "@mi-banquito/db/schema";
import type { AdminExportBlobAdapter } from "./admin-export-service";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile(".env.local");
  } catch {
    // The integration setup below reports a missing database explicitly.
  }
}

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const ACTOR = randomUUID();
const SUCCESS_EXPORT_ID = randomUUID();
const FAILED_EXPORT_ID = randomUUID();
const MISSING_PDF_EXPORT_ID = randomUUID();
const MISSING_PDF_ARCHIVE_ID = randomUUID();
let db: typeof import("@mi-banquito/db")["db"];
let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
let prepareTenantExport: typeof import("./admin-export-service")["prepareTenantExport"];
let loadTenantExportDownload: typeof import("./admin-export-service")["loadTenantExportDownload"];
let loadTenantExportHistory: typeof import("./admin-export-service")["loadTenantExportHistory"];

function blobRead(bytes: Buffer) {
  return {
    statusCode: 200 as const,
    stream: Readable.toWeb(Readable.from(bytes)),
    blob: {
      url: "https://private.invalid/export.zip",
      downloadUrl: "https://private.invalid/export.zip?download=1",
      pathname: `tenant-exports/${ORG_A}/${SUCCESS_EXPORT_ID}.zip`,
      contentType: "application/zip",
      contentDisposition: "attachment",
      etag: "test-etag",
      size: bytes.byteLength,
      uploadedAt: new Date("2026-07-12T15:00:00.000Z"),
      cacheControl: "private",
    },
  };
}

describe("US-021 export orchestration", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for export orchestration tests");
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    ({ prepareTenantExport, loadTenantExportDownload, loadTenantExportHistory } = await import("./admin-export-service"));
    await db.insert(organization).values([
      {
        id: ORG_A,
        displayName: "Orchestration A",
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        createdBy: ACTOR,
        createdByKind: "system",
      },
      {
        id: ORG_B,
        displayName: "Orchestration B",
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        createdBy: ACTOR,
        createdByKind: "system",
      },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(statementArchive).where(inArray(statementArchive.orgId, [ORG_A, ORG_B]));
      await tx.delete(auditLogEntry).where(inArray(auditLogEntry.orgId, [ORG_A, ORG_B]));
      await tx.delete(alert).where(inArray(alert.orgId, [ORG_A, ORG_B]));
      await tx.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
    });
  });

  it("finalizes Blob and records exactly one success audit before exposing the response stream", async () => {
    let uploadedBytes = Buffer.alloc(0);
    const adapter: AdminExportBlobAdapter = {
      read: async () => blobRead(uploadedBytes) as never,
      upload: async (pathname, body) => {
        const chunks: Buffer[] = [];
        for await (const chunk of body) chunks.push(Buffer.from(chunk));
        uploadedBytes = Buffer.concat(chunks);
        return { url: `https://private.invalid/${pathname}`, pathname };
      },
      delete: async () => undefined,
    };

    const prepared = await prepareTenantExport({
      orgId: ORG_A,
      actorId: ACTOR,
      operatorUserId: "auth0|operator-a",
      now: new Date("2026-07-12T15:00:00.000Z"),
      exportId: SUCCESS_EXPORT_ID,
      blob: adapter,
    });
    const committedBeforeResponseRead = await withTenantTransaction(ORG_A, (tx) => tx.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, ORG_A),
      eq(auditLogEntry.actionKind, "data.exported"),
      eq(auditLogEntry.id, SUCCESS_EXPORT_ID),
    )));
    expect(committedBeforeResponseRead).toHaveLength(1);
    const responseBytes = Buffer.concat(await Array.fromAsync(Readable.fromWeb(prepared.stream as never), (chunk) => Buffer.from(chunk)));
    const result = await prepared.completion;

    expect(responseBytes).toEqual(uploadedBytes);
    expect(uploadedBytes.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(result.zipSha256).toBe(createHash("sha256").update(uploadedBytes).digest("hex"));
    expect(result.sizeBytes).toBe(uploadedBytes.byteLength);
    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, ORG_A),
      eq(auditLogEntry.actionKind, "data.exported"),
      eq(auditLogEntry.id, SUCCESS_EXPORT_ID),
    )));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.payloadSnapshot).toEqual(expect.objectContaining({
      zipSha256: result.zipSha256,
      sizeBytes: uploadedBytes.byteLength,
      manifestCounts: result.manifest.entityRowCounts,
    }));

    const history = await loadTenantExportHistory(ORG_A);
    expect(history.map((row) => row.id)).toContain(SUCCESS_EXPORT_ID);
    expect(await loadTenantExportDownload({ orgId: ORG_B, exportId: SUCCESS_EXPORT_ID, blob: adapter })).toBeNull();
    const download = await loadTenantExportDownload({ orgId: ORG_A, exportId: SUCCESS_EXPORT_ID, blob: adapter });
    expect(download?.history.payload.zipSha256).toBe(result.zipSha256);
  });

  it("writes no success audit when the Blob client fails after receiving stream data", async () => {
    const adapter: AdminExportBlobAdapter = {
      read: async () => null,
      upload: async (_pathname, body) => {
        for await (const _chunk of body) break;
        throw new Error("blob_upload_failed");
      },
      delete: async () => undefined,
    };

    await expect(prepareTenantExport({
      orgId: ORG_A,
      actorId: ACTOR,
      operatorUserId: "auth0|operator-a",
      now: new Date("2026-07-12T16:00:00.000Z"),
      exportId: FAILED_EXPORT_ID,
      blob: adapter,
    })).rejects.toThrow("blob_upload_failed");

    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: auditLogEntry.id }).from(auditLogEntry).where(eq(auditLogEntry.id, FAILED_EXPORT_ID)));
    expect(audits).toEqual([]);
  });

  it("keeps the finalized Blob and success audit when the client disconnects", async () => {
    const exportId = randomUUID();
    let uploadFinished = false;
    let uploadedBytes = Buffer.alloc(0);
    const adapter: AdminExportBlobAdapter = {
      read: async () => blobRead(uploadedBytes) as never,
      upload: async (pathname, body) => {
        const chunks: Buffer[] = [];
        for await (const _chunk of body) {
          chunks.push(Buffer.from(_chunk));
        }
        uploadedBytes = Buffer.concat(chunks);
        uploadFinished = true;
        return { url: `https://private.invalid/${pathname}`, pathname };
      },
      delete: async () => undefined,
    };
    const prepared = await prepareTenantExport({
      orgId: ORG_A,
      actorId: ACTOR,
      operatorUserId: "auth0|operator-a",
      now: new Date("2026-07-12T16:30:00.000Z"),
      exportId,
      blob: adapter,
    });
    const reader = prepared.stream.getReader();
    expect((await reader.read()).done).toBe(false);
    await reader.cancel("client_disconnected");

    await expect(prepared.completion).resolves.toEqual(expect.objectContaining({ exportId }));
    expect(uploadFinished).toBe(true);
    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: auditLogEntry.id }).from(auditLogEntry).where(eq(auditLogEntry.id, exportId)));
    expect(audits).toEqual([{ id: exportId }]);
    expect((await loadTenantExportDownload({ orgId: ORG_A, exportId, blob: adapter }))?.history.id).toBe(exportId);
  });

  it("keeps a committed success and reports cleanup failure to Sentry plus durable operator records", async () => {
    const exportId = randomUUID();
    const reported: Array<{ error: Error; context: Record<string, unknown> }> = [];
    const adapter: AdminExportBlobAdapter = {
      read: async () => null,
      upload: async (pathname, body) => {
        for await (const _chunk of body) {
          // Consume with the real Node stream contract.
        }
        return { url: `https://private.invalid/${pathname}`, pathname };
      },
      delete: async () => undefined,
    };
    const prepared = await prepareTenantExport({
      orgId: ORG_A,
      actorId: ACTOR,
      operatorUserId: "auth0|operator-a",
      now: new Date("2026-07-12T16:45:00.000Z"),
      exportId,
      blob: adapter,
      cleanup: async () => { throw new Error("cleanup_failed"); },
      reportError: async (error, context) => { reported.push({ error, context }); },
    });
    await Array.fromAsync(Readable.fromWeb(prepared.stream as never));

    await expect(prepared.completion).resolves.toEqual(expect.objectContaining({ exportId }));
    expect(reported).toEqual([{
      error: expect.objectContaining({ message: "cleanup_failed" }),
      context: expect.objectContaining({ exportId, orgId: ORG_A, phase: "response" }),
    }]);
    const durable = await withTenantTransaction(ORG_A, async (tx) => ({
      cleanupAudits: await tx.select({ actionKind: auditLogEntry.actionKind }).from(auditLogEntry).where(and(
        eq(auditLogEntry.orgId, ORG_A),
        eq(auditLogEntry.subjectId, exportId),
      )),
      successAudits: await tx.select({ id: auditLogEntry.id }).from(auditLogEntry).where(eq(auditLogEntry.id, exportId)),
      alerts: await tx.select({ alertKind: alert.alertKind, audience: alert.audience }).from(alert).where(and(
        eq(alert.orgId, ORG_A),
        eq(alert.subjectId, exportId),
      )),
    }));
    expect(durable.successAudits).toEqual([{ id: exportId }]);
    expect(durable.cleanupAudits).toEqual([{ actionKind: "data.export.cleanup_failed" }]);
    expect(durable.alerts).toEqual([{ alertKind: "tenant_export_cleanup_failed", audience: "platform_operator" }]);
  });

  it("fails explicitly and writes no audit when a required private statement PDF is missing", async () => {
    await withTenantTransaction(ORG_A, async (tx) => {
      await tx.insert(statementArchive).values({
        id: MISSING_PDF_ARCHIVE_ID,
        orgId: ORG_A,
        kind: "year_end_snapshot",
        memberId: null,
        periodLabel: "2026",
        pdfUri: `/statement-archive/public/${"b".repeat(64)}.pdf`,
        canonicalPayloadHash: "b".repeat(64),
        canonicalPayload: { orgId: ORG_A },
        generatedAt: new Date("2026-07-12T17:00:00.000Z"),
        byteSize: 128,
        createdAt: new Date("2026-07-12T17:00:00.000Z"),
        createdByKind: "system",
      });
    });
    let uploadCalled = false;
    const adapter: AdminExportBlobAdapter = {
      read: async () => null,
      upload: async (pathname) => {
        uploadCalled = true;
        return { url: `https://private.invalid/${pathname}`, pathname };
      },
      delete: async () => undefined,
    };

    await expect(prepareTenantExport({
      orgId: ORG_A,
      actorId: ACTOR,
      operatorUserId: "auth0|operator-a",
      now: new Date("2026-07-12T17:00:00.000Z"),
      exportId: MISSING_PDF_EXPORT_ID,
      blob: adapter,
    })).rejects.toThrow(`statement_artifact_missing:${MISSING_PDF_ARCHIVE_ID}`);
    expect(uploadCalled).toBe(false);
    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: auditLogEntry.id }).from(auditLogEntry).where(eq(auditLogEntry.id, MISSING_PDF_EXPORT_ID)));
    expect(audits).toEqual([]);
  });
});
