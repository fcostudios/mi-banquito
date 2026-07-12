import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
let buildStagedTenantExportPlan: typeof import("./admin-export")["buildStagedTenantExportPlan"];
let createTenantExportArchive: typeof import("./admin-export")["createTenantExportArchive"];
let stageTenantExportFiles: typeof import("./admin-export")["stageTenantExportFiles"];

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
    buildStagedTenantExportPlan = exportModule.buildStagedTenantExportPlan;
    createTenantExportArchive = exportModule.createTenantExportArchive;
    stageTenantExportFiles = exportModule.stageTenantExportFiles;

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

  it("rejects pending statement artifacts through the paged tenant staging path", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.update(statementArtifactEvent).set({ status: "pending" }).where(inArray(statementArtifactEvent.orgId, [ORG_A]));
    });
    const directory = await mkdtemp(join(tmpdir(), "mi-banquito-pending-export-test-"));
    await expect(stageTenantExportFiles({
      orgId: ORG_A,
      directory,
      stagePdf: async () => ({ sha256: "a".repeat(64), sizeBytes: PDF_BYTES.byteLength }),
    })).rejects.toThrow("statement_artifact_not_ready");
    await rm(directory, { recursive: true, force: true });
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.update(statementArtifactEvent).set({ status: "ready" }).where(inArray(statementArtifactEvent.orgId, [ORG_A]));
    });
  });

  it("creates the exact canonical files, real PDFs, deterministic hashes, and no foreign tenant values", async () => {
    const pdfName = `statements/monthly_member-2026-07-${ARCHIVE_A}.pdf`;
    const directory = await mkdtemp(join(tmpdir(), "mi-banquito-canonical-export-test-"));
    try {
      const staged = await stageTenantExportFiles({
        orgId: ORG_A,
        directory,
        stagePdf: async (_archive, path) => {
          await writeFile(path, PDF_BYTES, { flag: "wx" });
          return {
            sha256: createHash("sha256").update(PDF_BYTES).digest("hex"),
            sizeBytes: PDF_BYTES.byteLength,
          };
        },
      });
      const plan = buildStagedTenantExportPlan({
        orgId: ORG_A,
        generatedAt: new Date("2026-07-12T13:00:00.000Z"),
        ...staged,
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
      expect(plan.pdfs.map((pdf) => pdf.name)).toEqual([pdfName]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("pages a large tenant export within the configured bound and preserves every row and hash", async () => {
    const syntheticIds = Array.from({ length: 113 }, () => randomUUID());
    await db.insert(member).values(syntheticIds.map((id, index) => ({
      id,
      orgId: ORG_A,
      displayName: index === 0 ? "+FORMULA" : `Synthetic ${index}`,
      joinedOn: "2026-07-01",
      role: "aportante" as const,
      status: "activo" as const,
      initialSavingsBalance: "1.0000",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      createdBy: ACTOR,
      createdByKind: "system",
    })));
    const directory = await mkdtemp(join(tmpdir(), "mi-banquito-domain-export-test-"));
    const observedPages: Array<{ entity: string; size: number }> = [];

    try {
      const staged = await stageTenantExportFiles({
        orgId: ORG_A,
        directory,
        pageSize: 17,
        onPage: (page) => observedPages.push(page),
        stagePdf: async (_archive, path) => {
          await writeFile(path, PDF_BYTES, { flag: "wx" });
          return {
            sha256: createHash("sha256").update(PDF_BYTES).digest("hex"),
            sizeBytes: PDF_BYTES.byteLength,
          };
        },
      });
      const members = staged.csvFiles.find((file) => file.name === "members.csv");
      expect(members).toBeDefined();
      const bytes = await readFile(members!.path);
      const lines = bytes.toString("utf8").trimEnd().split("\r\n");

      expect(Math.max(...observedPages.map((page) => page.size))).toBeLessThanOrEqual(17);
      expect(observedPages.filter((page) => page.entity === "members").map((page) => page.size))
        .toEqual([17, 17, 17, 17, 17, 17, 12]);
      expect(members!.rowCount).toBe(114);
      expect(lines).toHaveLength(115);
      expect(members!.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(members!.sizeBytes).toBe(bytes.byteLength);
      expect(bytes.toString("utf8")).toContain("'+FORMULA");
      expect(bytes.toString("utf8")).not.toContain("FOREIGN_TENANT_SENTINEL");
    } finally {
      await db.delete(member).where(inArray(member.id, syntheticIds));
      await rm(directory, { recursive: true, force: true });
    }
  });
});
