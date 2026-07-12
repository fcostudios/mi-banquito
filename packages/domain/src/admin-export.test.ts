import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { loadEnvFile } from "node:process";

import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Open } from "unzipper";

import {
  auditLogEntry,
  member,
  organization,
  statementArchive,
  statementArtifactEvent,
} from "@mi-banquito/db/schema";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile("../../apps/web/.env.local");
  } catch {
    // The integration setup below reports a missing database explicitly.
  }
}

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const ACTOR = randomUUID();
const MEMBER_A = randomUUID();
const MEMBER_B = randomUUID();
const ARCHIVE_A = randomUUID();
const HASH_A = "a".repeat(64);
const PDF_BYTES = Buffer.from("%PDF-1.4\norg-a-statement\n%%EOF\n", "utf8");

let db: typeof import("@mi-banquito/db")["db"];
let loadTenantExportData: typeof import("./admin-export")["loadTenantExportData"];
let buildTenantExportPlan: typeof import("./admin-export")["buildTenantExportPlan"];
let createTenantExportArchive: typeof import("./admin-export")["createTenantExportArchive"];

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe("US-021 tenant export", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for admin export integration tests");
    ({ db } = await import("@mi-banquito/db"));
    const exportModule = await import("./admin-export");
    loadTenantExportData = exportModule.loadTenantExportData;
    buildTenantExportPlan = exportModule.buildTenantExportPlan;
    createTenantExportArchive = exportModule.createTenantExportArchive;

    await db.insert(organization).values([
      {
        id: ORG_A,
        displayName: "Export org A",
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
        displayName: "Export org B",
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
    await db.insert(member).values([
      {
        id: MEMBER_A,
        orgId: ORG_A,
        displayName: "=HYPERLINK(\"https://invalid.example\")",
        joinedOn: "2026-07-01",
        role: "aportante",
        status: "activo",
        initialSavingsBalance: "10.0000",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        createdBy: ACTOR,
        createdByKind: "system",
      },
      {
        id: MEMBER_B,
        orgId: ORG_B,
        displayName: "FOREIGN_TENANT_SENTINEL",
        joinedOn: "2026-07-01",
        role: "aportante",
        status: "activo",
        initialSavingsBalance: "99.0000",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        createdBy: ACTOR,
        createdByKind: "system",
      },
    ]);
    await db.insert(statementArchive).values({
      id: ARCHIVE_A,
      orgId: ORG_A,
      kind: "monthly_member",
      memberId: MEMBER_A,
      periodLabel: "2026-07",
      pdfUri: `/statement-archive/public/${HASH_A}.pdf`,
      canonicalPayloadHash: HASH_A,
      canonicalPayload: { memberId: MEMBER_A },
      generatedAt: new Date("2026-07-12T12:00:00.000Z"),
      byteSize: PDF_BYTES.byteLength,
      createdAt: new Date("2026-07-12T12:00:00.000Z"),
      createdByKind: "system",
    });
    await db.insert(statementArtifactEvent).values({
      orgId: ORG_A,
      statementArchiveId: ARCHIVE_A,
      status: "ready",
      attemptNumber: 1,
      byteSize: PDF_BYTES.byteLength,
      attemptedAt: new Date("2026-07-12T12:00:00.000Z"),
      createdAt: new Date("2026-07-12T12:00:00.000Z"),
    });
    await db.insert(auditLogEntry).values([
      {
        orgId: ORG_A,
        actorKind: "member",
        actorId: MEMBER_A,
        actionKind: "member.created",
        subjectKind: "member",
        subjectId: MEMBER_A,
        payloadSnapshot: { displayName: "org-a-member" },
        at: new Date("2026-07-01T00:00:00.000Z"),
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
      {
        orgId: ORG_B,
        actorKind: "member",
        actorId: MEMBER_B,
        actionKind: "member.created",
        subjectKind: "member",
        subjectId: MEMBER_B,
        payloadSnapshot: { displayName: "FOREIGN_TENANT_SENTINEL" },
        at: new Date("2026-07-01T00:00:00.000Z"),
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(statementArtifactEvent).where(inArray(statementArtifactEvent.orgId, [ORG_A, ORG_B]));
      await tx.delete(statementArchive).where(inArray(statementArchive.orgId, [ORG_A, ORG_B]));
      await tx.delete(auditLogEntry).where(inArray(auditLogEntry.orgId, [ORG_A, ORG_B]));
      await tx.delete(member).where(inArray(member.orgId, [ORG_A, ORG_B]));
      await tx.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
    });
  });

  it("loads every entity through one tenant snapshot and rejects pending statement artifacts", async () => {
    const data = await loadTenantExportData(ORG_A);
    expect(data.members.map((row) => row.id)).toEqual([MEMBER_A]);
    expect(data.auditLog.map((row) => row.orgId)).toEqual([ORG_A]);
    expect(data.statementArchives.map((row) => row.id)).toEqual([ARCHIVE_A]);
    expect(JSON.stringify(data)).not.toContain("FOREIGN_TENANT_SENTINEL");

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.update(statementArtifactEvent).set({ status: "pending" }).where(inArray(statementArtifactEvent.orgId, [ORG_A]));
    });
    await expect(loadTenantExportData(ORG_A)).rejects.toThrow("statement_artifact_not_ready");
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.update(statementArtifactEvent).set({ status: "ready" }).where(inArray(statementArtifactEvent.orgId, [ORG_A]));
    });
  });

  it("creates the exact canonical files, real PDFs, deterministic hashes, and no foreign tenant values", async () => {
    const data = await loadTenantExportData(ORG_A);
    const pdfName = `statements/monthly_member-2026-07-${ARCHIVE_A}.pdf`;
    const plan = buildTenantExportPlan({
      orgId: ORG_A,
      generatedAt: new Date("2026-07-12T13:00:00.000Z"),
      data,
      pdfs: [{
        name: pdfName,
        archiveId: ARCHIVE_A,
        sha256: createHash("sha256").update(PDF_BYTES).digest("hex"),
        sizeBytes: PDF_BYTES.byteLength,
        source: () => Readable.from(PDF_BYTES),
      }],
    });
    const { stream, completion } = createTenantExportArchive(plan);
    const zipBytes = await collect(stream);
    await completion;
    const zip = await Open.buffer(zipBytes);
    const names = zip.files.map((file) => file.path).sort();

    expect(names).toEqual([
      "README.txt",
      "audit_log.csv",
      "base_fund_quota_configs.csv",
      "base_fund_quota_payments.csv",
      "base_fund_quotas.csv",
      "contributions.csv",
      "expenses.csv",
      "fees.csv",
      "interest_accruals.csv",
      "loans.csv",
      "manifest.json",
      "members.csv",
      "referrals.csv",
      "repayments.csv",
      pdfName,
      "statements.csv",
      "withdrawals.csv",
    ].sort());

    const manifestEntry = zip.files.find((file) => file.path === "manifest.json");
    expect(manifestEntry).toBeDefined();
    const manifest = JSON.parse((await manifestEntry!.buffer()).toString("utf8"));
    expect(manifest).toEqual(expect.objectContaining({
      orgId: ORG_A,
      generatedAt: "2026-07-12T13:00:00.000Z",
      entityRowCounts: expect.objectContaining({ members: 1, statements: 1, audit_log: 1 }),
    }));
    expect(Object.keys(manifest.files).sort()).toEqual(names.filter((name) => name.endsWith(".csv") || name.endsWith(".pdf")).sort());

    for (const file of zip.files.filter((entry) => entry.path.endsWith(".csv") || entry.path.endsWith(".pdf"))) {
      const bytes = await file.buffer();
      expect(manifest.files[file.path].sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(manifest.files[file.path].sizeBytes).toBe(bytes.byteLength);
      expect(bytes.toString("utf8")).not.toContain("FOREIGN_TENANT_SENTINEL");
    }
    const membersCsv = (await zip.files.find((file) => file.path === "members.csv")!.buffer()).toString("utf8");
    expect(membersCsv).toContain("'=HYPERLINK");
    expect((await zip.files.find((file) => file.path === "README.txt")!.buffer()).toString("utf8"))
      .toMatch(/ESPAÑOL[\s\S]*ENGLISH/);
  });

  it("honors downstream backpressure instead of consuming a large source eagerly", async () => {
    const chunk = Buffer.alloc(64 * 1024, 7);
    const totalChunks = 256;
    let emittedChunks = 0;
    const source = new Readable({
      read() {
        if (emittedChunks >= totalChunks) return this.push(null);
        emittedChunks += 1;
        this.push(chunk);
      },
    });
    const plan = buildTenantExportPlan({
      orgId: ORG_A,
      generatedAt: new Date("2026-07-12T13:00:00.000Z"),
      data: await loadTenantExportData(ORG_A),
      pdfs: [{
        name: `statements/large-${ARCHIVE_A}.pdf`,
        archiveId: ARCHIVE_A,
        sha256: createHash("sha256").update(Buffer.alloc(chunk.byteLength * totalChunks, 7)).digest("hex"),
        sizeBytes: chunk.byteLength * totalChunks,
        source: () => source,
      }],
    });
    const { stream } = createTenantExportArchive(plan);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(emittedChunks).toBeLessThan(totalChunks);
    stream.destroy();
  });
});
