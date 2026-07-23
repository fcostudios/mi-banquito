import "@testing-library/jest-dom/vitest";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { render, screen } from "@testing-library/react";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildA5ShareOutCommitmentAlert } from "@mi-banquito/domain";

if (!process.env.DATABASE_URL) {
  try { loadEnvFile("../../../../../../.env.local"); } catch { /* reported in beforeAll */ }
}

const authSession = vi.hoisted(() => ({
  userId: "auth0|reparto-page-real",
  actorId: "",
  orgId: "",
}));

vi.mock("@auth0/nextjs-auth0/server", () => ({
  Auth0Client: class {
    async getSession() {
      return {
        user: {
          sub: authSession.userId,
          org_id: authSession.orgId,
          roles: ["TESORERA"],
          email: "reparto-page@example.test",
          email_verified: true,
        },
      };
    }
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

describe("SCR-year-end-share-out with PostgreSQL", () => {
  const originalEnv = { ...process.env };
  const orgId = randomUUID();
  const otherOrgId = randomUUID();
  const actorId = randomUUID();
  const shareOutId = randomUUID();
  const lineId = randomUUID();
  let userAccountId: string;
  let db: typeof import("@mi-banquito/db")["db"];
  let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
  let schema: typeof import("@mi-banquito/db/schema");

  async function seedA5(input: {
    orgId?: string;
    year?: number;
    commitment?: string;
    projectedAvailable?: string;
  } = {}) {
    const alertInput = buildA5ShareOutCommitmentAlert({
      orgId: input.orgId ?? orgId,
      year: input.year ?? 2026,
      commitment: input.commitment ?? "120.0000",
      projectedAvailable: input.projectedAvailable ?? "100.0000",
      now: new Date("2026-07-02T10:00:00.000Z"),
    });
    const [row] = await withTenantTransaction(alertInput.orgId, (tx) => tx.insert(schema.alert).values(alertInput).returning());
    if (!row) throw new Error("reparto_alert_not_created");
    return { row, alertInput };
  }

  async function renderPage(searchParams: { error?: string; reversed?: string } = {}) {
    const Page = (await import("./page")).default;
    return render(await Page({ searchParams: Promise.resolve(searchParams) }));
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for reparto screen integration tests");
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.AUTH0_CLIENT_ID = "reparto-screen";
    process.env.AUTH0_CLIENT_SECRET = "reparto-screen-secret";
    process.env.AUTH0_DOMAIN = "auth.example.test";
    process.env.AUTH0_SECRET = "reparto-screen-secret-00000000000";
    process.env.CRON_SECRET = "reparto-screen-cron";
    process.env.IMPERSONATION_COOKIE_SECRET = "reparto-screen-cookie-00000000000";
    authSession.orgId = orgId;
    authSession.actorId = actorId;
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    schema = await import("@mi-banquito/db/schema");
    await db.insert(schema.organization).values([
      {
        id: orgId, displayName: "Reparto screen", countryCode: "EC", currencyCode: "USD",
        timezone: "America/Guayaquil", defaultLanguage: "es-EC", status: "active",
        createdAt: new Date("2026-01-01T00:00:00.000Z"), createdBy: actorId, createdByKind: "system",
      },
      {
        id: otherOrgId, displayName: "Other reparto screen", countryCode: "EC", currencyCode: "USD",
        timezone: "America/Guayaquil", defaultLanguage: "es-EC", status: "active",
        createdAt: new Date("2026-01-01T00:00:00.000Z"), createdBy: actorId, createdByKind: "system",
      },
    ]);
    await db.insert(schema.member).values({
      id: actorId, orgId, displayName: "Ana Mora", joinedOn: "2025-01-01", role: "tesorera",
      status: "activo", initialSavingsBalance: "0.0000", createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: actorId, createdByKind: "member",
    });
    const [identity] = await db.insert(schema.userAccount).values({
      authSubject: authSession.userId, email: "reparto-page@example.test", displayName: "Ana Mora",
      status: "active", createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: null,
    }).returning();
    if (!identity) throw new Error("reparto_screen_identity_not_created");
    userAccountId = identity.id;
    await db.insert(schema.userOrgMembership).values({
      userId: identity.id, orgId, role: "TESORERA", status: "active", memberId: actorId,
      grantedAt: new Date("2026-01-01T00:00:00.000Z"), revokedAt: null,
    });
    await withTenantTransaction(orgId, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.insert(schema.yearEndShareOut).values({
        id: shareOutId, orgId, year: 2026, periodCloseId: randomUUID(), formulaAtRun: "two_pool_v1",
        totalPoolAtRun: "100.0000", totalCommitment: "100.0000", totalApproved: null,
        surplusOrShortfallAtApproval: null, governanceDecisionId: null, distributableSurplus: "100.0000",
        cxcAnterior: "0.0000", repartoTotal: "100.0000", loanPoolAmount: "30.0000",
        savingsPoolAmount: "70.0000", alicuotaPrestamos: "0.3000000000",
        alicuotaAhorros: "0.7000000000", ajusteAmount: "0.0000", status: "draft",
        approvedAt: null, approvedBy: null, approvedByKind: null,
        createdAt: new Date("2026-07-02T09:00:00.000Z"), createdBy: actorId, createdByKind: "member",
      });
      await tx.insert(schema.yearEndShareOutLine).values({
        id: lineId, orgId, yearEndShareOutId: shareOutId, memberId: actorId,
        accumulatedSavingsAtRun: "100.0000", loanActivityBasis: "300.0000", loanBonusC: "9.0000",
        savingsInterest: "17.5000", draftShareAmount: "26.5000", overrideShareAmount: null,
        overrideReason: null, finalShareAmount: "26.5000", disposition: "payout",
        dispositionMotive: null, withdrawalId: null, retainedContributionId: null, memberStatementId: null,
        createdAt: new Date("2026-07-02T09:00:00.000Z"),
      });
    });
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T11:00:00.000Z"));
    for (const tenantId of [orgId, otherOrgId]) {
      await withTenantTransaction(tenantId, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.delete(schema.alertAction).where(eq(schema.alertAction.orgId, tenantId));
        await tx.delete(schema.alert).where(eq(schema.alert.orgId, tenantId));
      });
    }
    await withTenantTransaction(orgId, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.update(schema.yearEndShareOut).set({ status: "draft", approvedAt: null }).where(eq(schema.yearEndShareOut.id, shareOutId));
      await tx.update(schema.yearEndShareOutLine).set({ withdrawalId: null }).where(eq(schema.yearEndShareOutLine.id, lineId));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    if (db) {
      for (const tenantId of [orgId, otherOrgId]) {
        await withTenantTransaction(tenantId, async (tx) => {
          await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
          await tx.delete(schema.alertAction).where(eq(schema.alertAction.orgId, tenantId));
          await tx.delete(schema.alert).where(eq(schema.alert.orgId, tenantId));
          await tx.delete(schema.userOrgMembership).where(eq(schema.userOrgMembership.orgId, tenantId));
          await tx.delete(schema.yearEndShareOutLine).where(eq(schema.yearEndShareOutLine.orgId, tenantId));
          await tx.delete(schema.yearEndShareOut).where(eq(schema.yearEndShareOut.orgId, tenantId));
          await tx.delete(schema.member).where(eq(schema.member.orgId, tenantId));
        });
      }
      await db.delete(schema.userAccount).where(eq(schema.userAccount.id, userAccountId));
      await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
      await db.delete(schema.organization).where(eq(schema.organization.id, otherOrgId));
    }
    process.env = originalEnv;
    vi.useRealTimers();
  });

  it("loads the real draft and preserves exact TOON cards, icon, and action identifiers", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Reparto fin de año" })).toBeInTheDocument();
    expect(screen.getByText("Ana Mora")).toBeInTheDocument();
    expect(screen.getByText("Paso 1 — Las dos bolsas del reparto")).toBeInTheDocument();
    expect(screen.getByText("30,00%")).toBeInTheDocument();
    expect(screen.getByText("70,00%")).toBeInTheDocument();
    expect(screen.queryByTestId("step1_a5_gate")).not.toBeInTheDocument();
    expect(screen.getByTestId("btn_approve")).toHaveTextContent("Aprobar reparto");
    const summary = screen.getByTestId("step3_summary");
    expect(summary).toHaveClass("border-success");
    expect(summary.querySelector("svg.lucide-circle-check")).toBeInTheDocument();
  });

  it("shows only the displayed-year active A5 with exact deficit figures and producer copy", async () => {
    const current = await seedA5();
    await seedA5({ year: 2027, commitment: "900.0000", projectedAvailable: "100.0000" });
    await seedA5({ orgId: otherOrgId, commitment: "800.0000", projectedAvailable: "100.0000" });

    await renderPage();

    expect(screen.getByTestId("step1_a5_gate")).toHaveTextContent(String(current.alertInput.payload.body));
    expect(screen.getByTestId("step1_a5_gate")).toHaveTextContent("$120,00");
    expect(screen.getByTestId("step1_a5_gate")).toHaveTextContent("$100,00");
    expect(screen.getByTestId("step1_a5_gate")).toHaveTextContent("$20,00");
    expect(screen.getByTestId("step1_a5_gate")).not.toHaveTextContent("$900,00");
    expect(screen.getByTestId("step1_a5_gate")).not.toHaveTextContent("$800,00");
  });

  it("hides other-year and other-tenant A5 alerts", async () => {
    await seedA5({ year: 2027 });
    await seedA5({ orgId: otherOrgId });

    await renderPage();

    expect(screen.queryByTestId("step1_a5_gate")).not.toBeInTheDocument();
  });

  it("does not treat a stale non-shortfall A5 row as active", async () => {
    await seedA5({ commitment: "80.0000", projectedAvailable: "100.0000" });

    await renderPage();

    expect(screen.queryByTestId("step1_a5_gate")).not.toBeInTheDocument();
  });

  it("hides resolved and actively snoozed current-year A5 alerts", async () => {
    const dismissed = await seedA5();
    const snoozedId = randomUUID();
    await withTenantTransaction(orgId, async (tx) => {
      await tx.insert(schema.alert).values({
        ...dismissed.alertInput,
        id: snoozedId,
        subjectId: randomUUID(),
        dedupWindowEnd: new Date("2026-07-10T10:00:00.000Z"),
      });
      await tx.insert(schema.alertAction).values([
        {
          orgId, alertId: dismissed.row.id, actionKind: "dismiss", snoozedUntil: null,
          actorId, actorKind: "member", reason: "resuelto", createdAt: new Date("2026-07-02T10:30:00.000Z"),
        },
        {
          orgId, alertId: snoozedId, actionKind: "snooze", snoozedUntil: new Date("2026-07-09T10:30:00.000Z"),
          actorId, actorKind: "member", reason: null, createdAt: new Date("2026-07-02T10:31:00.000Z"),
        },
      ]);
    });

    await renderPage();

    expect(screen.queryByTestId("step1_a5_gate")).not.toBeInTheDocument();
  });

  it("renders the strict blocked balance state through the real screen load", async () => {
    await renderPage({ error: "regularized-balance" });

    expect(screen.getByTestId("regularized_balance_gate")).toHaveTextContent(
      "El reparto aprobado supera el fondo regularizado disponible. Ajusta la decisión de la Asamblea antes de continuar.",
    );
  });

  it("preserves the exact reversal action label and identifier", async () => {
    await withTenantTransaction(orgId, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.update(schema.yearEndShareOut).set({
        status: "distributed",
        approvedAt: new Date("2026-07-01T12:00:00.000Z"),
      }).where(eq(schema.yearEndShareOut.id, shareOutId));
      await tx.update(schema.yearEndShareOutLine).set({ withdrawalId: randomUUID() }).where(eq(schema.yearEndShareOutLine.id, lineId));
    });

    await renderPage();

    expect(screen.getByTestId("btn_reverse")).toHaveTextContent("Revertir reparto");
  });
});
