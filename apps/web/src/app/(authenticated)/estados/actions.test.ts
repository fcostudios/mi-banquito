import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  auditLogEntry,
  contributionCycle,
  member,
  organization,
  periodClose,
  reconciliationCycle,
  statementArchive,
  userAccount,
  userOrgMembership,
} from "@mi-banquito/db/schema";
import type { MonthlyMemberStatementArtifactInput, MonthlyMemberStatementArtifactResult } from "@mi-banquito/domain";
import { MonthlyMemberDocument } from "@/lib/monthly-member-artifact";

if (!process.env.DATABASE_URL) {
  try { loadEnvFile("/Users/fcolomas/Projects/mi-banquito/apps/web/.env.local"); } catch { /* beforeAll reports missing configuration */ }
}

const authState = vi.hoisted(() => ({ session: null as null | { user: Record<string, unknown> } }));
const nextState = vi.hoisted(() => ({ revalidated: [] as string[], redirected: [] as string[] }));

vi.mock("@auth0/nextjs-auth0/server", () => ({
  Auth0Client: class {
    getSession() { return Promise.resolve(authState.session); }
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: (path: string) => { nextState.revalidated.push(path); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect(path: string) { nextState.redirected.push(path); throw new Error(`NEXT_REDIRECT:${path}`); },
}));

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const ACTOR = randomUUID();
const MEMBER_A = randomUUID();
const MEMBER_A2 = randomUUID();
const ACTIVE_MEMBERS = [MEMBER_A, MEMBER_A2, ...Array.from({ length: 8 }, () => randomUUID())];
const MEMBER_B = randomUUID();
const USER_ID = randomUUID();
const MEMBERSHIP_ID = randomUUID();
const CYCLE_A = randomUUID();
const CYCLE_B = randomUUID();
const RECON_A = randomUUID();
const RECON_B = randomUUID();
const CLOSE_A = randomUUID();
const CLOSE_B = randomUUID();
const NOW = new Date("2026-07-31T12:00:00.000Z");

let db: typeof import("@mi-banquito/db")["db"];
let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
let executeGenerateMemberStatementsAction: typeof import("./generate-statements")["executeGenerateMemberStatementsAction"];
let artifactDirectory: string;

function formData(overrides: Record<string, string> = {}) {
  const data = new FormData();
  data.set("periodCloseId", CLOSE_A);
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

function authSession(roles: string[]) {
  authState.session = { user: { sub: "auth0|statement-action", org_id: ORG_A, roles } };
}

describe("US-048 statement server action", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for statement action integration tests");
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    ({ executeGenerateMemberStatementsAction } = await import("./generate-statements"));
    await db.insert(organization).values([
      orgRow(ORG_A, "Actions A"),
      orgRow(ORG_B, "Actions B"),
    ]);
    await db.insert(member).values([
      memberRow(ACTOR, ORG_A, "Tesorera", "baja"),
      ...ACTIVE_MEMBERS.map((id, index) => memberRow(id, ORG_A, index === 0 ? "Ana Mora" : `Socia ${index + 1}`, "activo")),
      memberRow(MEMBER_B, ORG_B, "Foreign Member", "activo"),
    ]);
    await db.insert(userAccount).values({
      id: USER_ID, authSubject: "auth0|statement-action", email: "statements@example.com",
      displayName: "Statement actor", status: "active", createdAt: NOW,
    });
    await db.insert(userOrgMembership).values({
      id: MEMBERSHIP_ID, userId: USER_ID, orgId: ORG_A, role: "TESORERA", status: "active", memberId: ACTOR, grantedAt: NOW,
    });
    await db.insert(contributionCycle).values([
      cycleRow(CYCLE_A, ORG_A), cycleRow(CYCLE_B, ORG_B),
    ]);
    await db.insert(reconciliationCycle).values([
      reconciliationRow(RECON_A, ORG_A, CYCLE_A), reconciliationRow(RECON_B, ORG_B, CYCLE_B),
    ]);
    await db.insert(periodClose).values([
      closeRow(CLOSE_A, ORG_A, CYCLE_A, RECON_A), closeRow(CLOSE_B, ORG_B, CYCLE_B, RECON_B),
    ]);
  });

  beforeEach(async () => {
    nextState.revalidated = [];
    nextState.redirected = [];
    artifactDirectory = await mkdtemp(join(tmpdir(), "mi-banquito-action-statements-"));
    authSession(["TESORERA"]);
    await withTenantTransaction(ORG_A, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_A));
      await tx.delete(statementArchive).where(eq(statementArchive.orgId, ORG_A));
    });
  });

  afterEach(async () => {
    await rm(artifactDirectory, { recursive: true, force: true });
  });

  afterAll(async () => {
    if (!db || !withTenantTransaction) return;
    await withTenantTransaction(ORG_A, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_A));
      await tx.delete(statementArchive).where(eq(statementArchive.orgId, ORG_A));
      await tx.delete(periodClose).where(eq(periodClose.orgId, ORG_A));
      await tx.delete(reconciliationCycle).where(eq(reconciliationCycle.orgId, ORG_A));
      await tx.delete(contributionCycle).where(eq(contributionCycle.orgId, ORG_A));
      await tx.delete(userOrgMembership).where(eq(userOrgMembership.orgId, ORG_A));
      await tx.delete(member).where(eq(member.orgId, ORG_A));
    });
    await withTenantTransaction(ORG_B, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(periodClose).where(eq(periodClose.orgId, ORG_B));
      await tx.delete(reconciliationCycle).where(eq(reconciliationCycle.orgId, ORG_B));
      await tx.delete(contributionCycle).where(eq(contributionCycle.orgId, ORG_B));
      await tx.delete(member).where(eq(member.orgId, ORG_B));
    });
    await db.delete(userAccount).where(eq(userAccount.id, USER_ID));
    await db.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
  });

  it("authenticates before parsing unauthenticated and wrong-role submissions", async () => {
    authState.session = null;
    await expect(runAction(new FormData())).rejects.toThrow("NEXT_REDIRECT:/auth/login");

    authSession(["APORTANTE"]);
    await expect(runAction(new FormData())).rejects.toThrow("NEXT_REDIRECT:/acceso-denegado");
  });

  it.each([
    ["invalid UUID", (data: FormData) => data.set("periodCloseId", "not-a-uuid")],
    ["unknown field", (data: FormData) => data.set("orgId", ORG_B)],
    ["duplicate scalar", (data: FormData) => data.append("periodCloseId", CLOSE_A)],
    ["File scalar", (data: FormData) => data.set("periodCloseId", new File([CLOSE_A], "period.txt"))],
  ])("strictly rejects %s", async (_case, mutate) => {
    const data = formData();
    mutate(data);
    await expect(runAction(data)).rejects.toThrow();
    expect(await archives()).toEqual([]);
  });

  it("rejects a period close from another tenant", async () => {
    await expect(runAction(formData({ periodCloseId: CLOSE_B }))).rejects.toThrow("period_close_not_found");
    expect(await archives()).toEqual([]);
  });

  it.each([
    ["backslash authority", `/\\evil.example/x`],
    ["different member", `/socias/${MEMBER_A2}?estado=generado`],
    ["different state", `/socias/${MEMBER_A}?estado=otra`],
    ["different local route", "/estados"],
  ])("does not redirect or revalidate a non-exact %s return target", async (_case, returnTo) => {
    await runAction(formData({ memberId: MEMBER_A, returnTo }));

    expect(nextState.redirected).toEqual([]);
    expect(nextState.revalidated).toEqual(["/estados"]);
  });

  it("generates one audited PDF archive per active member in a batch", async () => {
    await runAction(formData());

    const rows = await archives();
    expect(rows).toHaveLength(10);
    expect(rows.map((row) => row.memberId).sort()).toEqual([...ACTIVE_MEMBERS].sort());
    expect(rows.every((row) => row.kind === "monthly_member" && row.byteSize > 0 && row.pdfUri.startsWith(artifactDirectory))).toBe(true);
    for (const row of rows) {
      const bytes = await readFile(row.pdfUri);
      expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(bytes.byteLength).toBe(row.byteSize);
    }
    const audits = await generatedAudits();
    expect(audits).toHaveLength(10);
    expect(audits.map((row) => row.subjectId).sort()).toEqual(rows.map((row) => row.id).sort());
  });

  it("generates one member statement and redirects to the validated detail return path", async () => {
    await expect(runAction(formData({
      memberId: MEMBER_A,
      returnTo: `/socias/${MEMBER_A}?estado=generado`,
    }))).rejects.toThrow(`NEXT_REDIRECT:/socias/${MEMBER_A}?estado=generado`);

    const rows = await archives();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ memberId: MEMBER_A, periodCloseId: CLOSE_A, createdByKind: "system" });
    expect(await generatedAudits()).toHaveLength(1);
  });

  it("reuses the archive and audit on an idempotent replay", async () => {
    const data = () => formData({ memberId: MEMBER_A });
    await runAction(data());
    await runAction(data());

    expect(await archives()).toHaveLength(1);
    expect(await generatedAudits()).toHaveLength(1);
  });
});

function runAction(data: FormData) {
  return executeGenerateMemberStatementsAction(data, writeLocalArtifact, async (artifact) => rm(artifact.pdfUri));
}

async function writeLocalArtifact(
  input: MonthlyMemberStatementArtifactInput,
): Promise<MonthlyMemberStatementArtifactResult> {
  const document = createElement(MonthlyMemberDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0];
  const bytes = await renderToBuffer(document);
  const pdfUri = join(artifactDirectory, `${input.canonicalPayloadHash}.pdf`);
  await writeFile(pdfUri, bytes);
  return { pdfUri, byteSize: bytes.byteLength };
}

async function archives() {
  return withTenantTransaction(ORG_A, (tx) => tx.select().from(statementArchive)
    .where(and(eq(statementArchive.orgId, ORG_A), eq(statementArchive.periodCloseId, CLOSE_A))));
}

async function generatedAudits() {
  return withTenantTransaction(ORG_A, (tx) => tx.select().from(auditLogEntry)
    .where(and(eq(auditLogEntry.orgId, ORG_A), eq(auditLogEntry.actionKind, "statement.generated"))));
}

function orgRow(id: string, displayName: string) {
  return { id, displayName, countryCode: "EC", currencyCode: "USD", timezone: "America/Guayaquil", defaultLanguage: "es-EC", status: "active" as const, createdAt: NOW, createdBy: ACTOR, createdByKind: "system" };
}

function memberRow(id: string, orgId: string, displayName: string, status: "activo" | "baja") {
  return { id, orgId, displayName, joinedOn: "2026-01-01", role: "aportante" as const, status, initialSavingsBalance: "100.0000", createdAt: NOW, createdBy: ACTOR, createdByKind: "system" };
}

function cycleRow(id: string, orgId: string) {
  return { id, orgId, cycleLabel: "2026-07", kind: "monthly", opensOn: "2026-07-01", closesOn: "2026-07-31", expectedAmountPerMember: "20.0000", currencyCode: "USD", status: "closed" as const, createdAt: NOW, createdBy: ACTOR, createdByKind: "system" as const };
}

function reconciliationRow(id: string, orgId: string, cycleId: string) {
  return { id, orgId, cycleId, declaredBankBalance: "0.0000", computedPoolBalance: "0.0000", discrepancyAmount: "0.0000", toleranceAmount: "0.0000", resolutionKind: "auto_within_tolerance" as const, closedAt: NOW, createdAt: NOW, createdBy: ACTOR, createdByKind: "system" };
}

function closeRow(id: string, orgId: string, cycleId: string, reconciliationCycleId: string) {
  return { id, orgId, cycleId, reconciliationCycleId, closedAt: NOW, closedBy: ACTOR, closedByKind: "member", isYearEnd: false, createdAt: NOW };
}
