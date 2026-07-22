import "@testing-library/jest-dom/vitest";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { render, screen, within } from "@testing-library/react";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL) {
  try { loadEnvFile("../../../../../../.env.local"); } catch { /* reported in beforeAll */ }
}

const authSession = vi.hoisted(() => ({
  userId: "auth0|liquidity-page-real",
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
          email: "liquidity-page@example.test",
          email_verified: true,
        },
      };
    }
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

describe("SCR-cash-flow-projection with PostgreSQL", () => {
  const originalEnv = { ...process.env };
  const orgId = randomUUID();
  const actorId = randomUUID();
  const accountId = randomUUID();
  const cycleId = randomUUID();
  const collectionId = randomUUID();
  let userAccountId: string;
  let db: typeof import("@mi-banquito/db")["db"];
  let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for liquidity screen integration tests");
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.AUTH0_CLIENT_ID = "liquidity-screen";
    process.env.AUTH0_CLIENT_SECRET = "liquidity-screen-secret";
    process.env.AUTH0_DOMAIN = "auth.example.test";
    process.env.AUTH0_SECRET = "liquidity-screen-secret-000000000";
    process.env.CRON_SECRET = "liquidity-screen-cron";
    process.env.IMPERSONATION_COOKIE_SECRET = "liquidity-screen-cookie-000000000";
    authSession.orgId = orgId;
    authSession.actorId = actorId;
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    const schema = await import("@mi-banquito/db/schema");
    await db.insert(schema.organization).values({
      id: orgId, displayName: "Liquidity screen", countryCode: "EC", currencyCode: "USD",
      timezone: "America/Guayaquil", defaultLanguage: "es-EC", status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"), createdBy: actorId, createdByKind: "system",
    });
    await db.insert(schema.member).values({
      id: actorId, orgId, displayName: "Tesorera liquidez", joinedOn: "2025-01-01",
      role: "tesorera", status: "activo", initialSavingsBalance: "0.0000",
      createdAt: new Date("2026-01-01T00:00:00.000Z"), createdBy: actorId, createdByKind: "member",
    });
    const [identity] = await db.insert(schema.userAccount).values({
      authSubject: authSession.userId, email: "liquidity-page@example.test", displayName: "Tesorera liquidez",
      status: "active", createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: null,
    }).returning();
    if (!identity) throw new Error("liquidity_screen_identity_not_created");
    userAccountId = identity.id;
    await db.insert(schema.userOrgMembership).values({
      userId: identity.id, orgId, role: "TESORERA", status: "active", memberId: actorId,
      grantedAt: new Date("2026-01-01T00:00:00.000Z"), revokedAt: null,
    });
    await withTenantTransaction(orgId, async (tx) => {
      await tx.insert(schema.groupConfig).values({
        orgId, version: 1, validFrom: new Date("2026-01-01T00:00:00.000Z"), validTo: null,
        contributionCycleKind: "monthly", contributionAmount: "20.0000", currencyCode: "USD",
        loanRateModel: "declining_balance", loanRateValue: "5.0000", loanRatePeriodUnit: "monthly",
        loanGracePeriods: 0, loanToSavingsCapRatio: "3.00", interestResolution: "daily",
        repaymentSplitRule: "interest_first", paysSavingsInterest: false, savingsInterestRate: null,
        yearEndShareOutFormula: "time_weighted", safetyMarginAmount: "0.0000",
        reconciliationToleranceAmount: "0.0000", lateThresholdDays: 1, moraThresholdDays: 5,
        fiscalYearStartMonth: 1, fiscalYearStartDay: 1, config: {},
        createdAt: new Date("2026-01-01T00:00:00.000Z"), createdBy: actorId, createdByKind: "member",
      });
      await tx.insert(schema.account).values({
        id: accountId, orgId, name: "Banco liquidez", type: "group_bank", isGroupFund: true,
        status: "active", clientRequestId: randomUUID(), createdAt: new Date("2026-01-01T00:00:00.000Z"),
        createdBy: actorId,
      });
      await tx.insert(schema.contributionCycle).values({
        id: cycleId, orgId, cycleLabel: "2026-07", kind: "monthly", opensOn: "2026-07-01",
        closesOn: "2026-07-31", expectedAmountPerMember: "900.0000", currencyCode: "USD", status: "open",
        createdAt: new Date("2026-07-01T00:00:00.000Z"), createdBy: actorId, createdByKind: "member",
      });
      await tx.insert(schema.contribution).values({
        orgId, cycleId, memberId: actorId, amount: "900.0000", currencyCode: "USD", datedOn: "2026-07-01",
        recordedAt: new Date("2026-07-01T00:00:00.000Z"), accountId, reconciliationStatus: "regularized",
        createdAt: new Date("2026-07-01T00:00:00.000Z"), createdBy: actorId, createdByKind: "member",
      });
      await tx.insert(schema.extraordinaryCollection).values({
        id: collectionId, orgId, kind: "solidarity", purpose: "Ayuda", beneficiaryMemberId: actorId,
        status: "collecting", openedOn: "2026-07-01", createdAt: new Date("2026-07-01T00:00:00.000Z"),
        createdBy: actorId,
      });
      await tx.insert(schema.extraordinaryCollectionLine).values({
        orgId, collectionId, memberId: actorId, amount: "30.0000", accountId,
        reconciliationStatus: "regularized", datedOn: "2026-07-02",
        createdAt: new Date("2026-07-02T00:00:00.000Z"), createdBy: actorId,
      });
      await tx.insert(schema.baseFundQuotaPayment).values({
        orgId, memberId: actorId, fiscalYear: 2026, amount: "160.0000", currencyCode: "USD",
        paidOn: "2026-07-01", createdAt: new Date("2026-07-01T00:00:00.000Z"),
        createdBy: actorId, createdByKind: "member",
      });
    });
  });

  afterAll(async () => {
    if (db) {
      const schema = await import("@mi-banquito/db/schema");
      await withTenantTransaction(orgId, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.delete(schema.baseFundQuotaPayment).where(eq(schema.baseFundQuotaPayment.orgId, orgId));
        await tx.delete(schema.extraordinaryCollectionLine).where(eq(schema.extraordinaryCollectionLine.orgId, orgId));
        await tx.delete(schema.extraordinaryCollection).where(eq(schema.extraordinaryCollection.orgId, orgId));
        await tx.delete(schema.contribution).where(eq(schema.contribution.orgId, orgId));
        await tx.delete(schema.contributionCycle).where(eq(schema.contributionCycle.orgId, orgId));
        await tx.delete(schema.account).where(eq(schema.account.orgId, orgId));
        await tx.delete(schema.groupConfig).where(eq(schema.groupConfig.orgId, orgId));
        await tx.delete(schema.userOrgMembership).where(eq(schema.userOrgMembership.orgId, orgId));
        await tx.delete(schema.member).where(eq(schema.member.orgId, orgId));
      });
      await db.delete(schema.userAccount).where(eq(schema.userAccount.id, userAccountId));
      await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    }
    process.env = originalEnv;
  });

  it("renders exact real physical, earmarked, regularized, and available balances", async () => {
    const Page = (await import("./page")).default;
    const { container } = render(await Page());

    expect(container.querySelector("[data-scaffold]")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Liquidez proyectada" })).toBeInTheDocument();
    expect(screen.getByTestId("physical_cash_balance")).toHaveTextContent("$930,00");
    expect(screen.getByTestId("collection_cash_balance")).toHaveTextContent("$30,00");
    expect(screen.getByTestId("pool_balance")).toHaveTextContent("$900,00");
    expect(screen.getByTestId("available_capital_value")).toHaveTextContent("$740,00");
    expect(screen.getByTestId("base_fund_pool")).toHaveTextContent("$160,00");
    const sandbox = screen.getByRole("region", { name: "Considerar un préstamo" });
    expect(within(sandbox).getByText("5,00%")).toBeInTheDocument();
    expect(within(sandbox).getByText("10 periodos")).toBeInTheDocument();
  });
});
