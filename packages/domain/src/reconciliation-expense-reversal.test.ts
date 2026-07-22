import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createExtraordinaryCollectionService } from "./extraordinary-collections";
import { createReconciliationService } from "./reconciliation";
import {
  account,
  auditLogEntry,
  contributionCycle,
  expense,
  extraordinaryCollection,
  extraordinaryCollectionLine,
  groupConfig,
  member,
  organization,
  periodClose,
  reconciliationCycle,
  statementArchive,
  statementArtifactEvent,
} from "@mi-banquito/db/schema";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile("../../apps/web/.env.local");
  } catch {
    // The integration suite reports the missing real-PostgreSQL configuration.
  }
}

describe("expense reversals in reconciliation with PostgreSQL", () => {
  const orgA = randomUUID();
  const orgB = randomUUID();
  const actorId = randomUUID();
  const operationTime = new Date("2026-07-21T16:00:00.000Z");
  let db: typeof import("@mi-banquito/db")["db"];
  let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for reconciliation integration tests");
    }
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    for (const [id, displayName] of [[orgA, "Reconciliation A"], [orgB, "Reconciliation B"]] as const) {
      await db.insert(organization).values({
        id,
        displayName,
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        createdAt: operationTime,
        createdBy: actorId,
        createdByKind: "system",
      });
    }
  });

  afterAll(async () => {
    for (const orgId of [orgA, orgB]) {
      await withTenantTransaction(orgId, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.delete(statementArtifactEvent).where(eq(statementArtifactEvent.orgId, orgId));
        await tx.delete(statementArchive).where(eq(statementArchive.orgId, orgId));
        await tx.delete(periodClose).where(eq(periodClose.orgId, orgId));
        await tx.delete(reconciliationCycle).where(eq(reconciliationCycle.orgId, orgId));
        await tx.delete(contributionCycle).where(eq(contributionCycle.orgId, orgId));
        await tx.delete(groupConfig).where(eq(groupConfig.orgId, orgId));
        await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, orgId));
        await tx.delete(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, orgId));
        await tx.delete(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, orgId));
        await tx.delete(expense).where(eq(expense.orgId, orgId));
        await tx.delete(account).where(eq(account.orgId, orgId));
        await tx.delete(member).where(eq(member.orgId, orgId));
      });
    }
    await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
  });

  it("nets a governed payout reversal exactly while isolating unrelated and foreign reversal pairs", async () => {
    const seedMember = async (orgId: string, displayName: string) => {
      const [row] = await db.insert(member).values({
        orgId,
        displayName,
        joinedOn: "2025-01-01",
        role: "aportante",
        status: "activo",
        initialSavingsBalance: "0.0000",
        createdAt: operationTime,
        createdBy: actorId,
        createdByKind: "system",
      }).returning();
      if (!row) throw new Error("test_member_not_created");
      return row;
    };
    const seedAccount = async (orgId: string, name: string) => {
      const [row] = await db.insert(account).values({
        orgId,
        name,
        type: "group_bank",
        isGroupFund: true,
        status: "active",
        createdAt: operationTime,
        createdBy: actorId,
        clientRequestId: randomUUID(),
      }).returning();
      if (!row) throw new Error("test_account_not_created");
      return row;
    };
    const beneficiaryA = await seedMember(orgA, "Ana Beneficiaria");
    const contributorA = await seedMember(orgA, "Bea Aportante");
    const beneficiaryB = await seedMember(orgB, "Otra Beneficiaria");
    const accountA = await seedAccount(orgA, "Banco A");
    const accountB = await seedAccount(orgB, "Banco B");

    const collections = createExtraordinaryCollectionService({ now: () => operationTime });
    const opened = await collections.open({
      orgId: orgA,
      actorId,
      kind: "solidarity",
      purpose: "Calamidad doméstica",
      beneficiaryMemberId: beneficiaryA.id,
      targetAmount: "25.1234",
      recognitionFiscalYear: null,
      openedOn: "2026-07-21",
      clientRequestId: randomUUID(),
    });
    await collections.addLine({
      orgId: orgA,
      actorId,
      collectionId: opened.id,
      memberId: contributorA.id,
      accountId: accountA.id,
      amount: "25.1234",
      datedOn: "2026-07-21",
      clientRequestId: randomUUID(),
    });
    const paid = await collections.payout({
      orgId: orgA,
      actorId,
      collectionId: opened.id,
      sourceAccountId: accountA.id,
      payoutAmount: "25.1234",
      disposition: null,
      dispositionMotive: null,
      returnAccountId: null,
      datedOn: "2026-07-22",
      clientRequestId: randomUUID(),
    });

    const seedReversalPair = async (orgId: string, beneficiaryMemberId: string, accountId: string, amount: string) => {
      const [original] = await db.insert(expense).values({
        orgId,
        purpose: "unrelated expense",
        amount,
        currencyCode: "USD",
        beneficiaryMemberId,
        incurredOn: "2026-07-23",
        status: "paid",
        recordedAt: operationTime,
        reversesId: null,
        accountId,
        category: "bank_fee",
        clientRequestId: randomUUID(),
        createdAt: operationTime,
        createdBy: actorId,
        createdByKind: "member",
      }).returning();
      if (!original) throw new Error("test_expense_not_created");
      await db.insert(expense).values({
        ...original,
        id: undefined,
        purpose: "reversal: unrelated expense",
        reversesId: original.id,
        reverseReason: "Unrelated correction",
        clientRequestId: randomUUID(),
      });
    };
    await seedReversalPair(orgA, beneficiaryA.id, accountA.id, "9.8765");
    await seedReversalPair(orgB, beneficiaryB.id, accountB.id, "999.9999");

    const [cycle] = await db.insert(contributionCycle).values({
      orgId: orgA,
      cycleLabel: "2026-07",
      kind: "monthly",
      opensOn: "2026-07-01",
      closesOn: "2026-07-31",
      expectedAmountPerMember: "0.0000",
      currencyCode: "USD",
      status: "open",
      createdAt: operationTime,
      createdBy: actorId,
      createdByKind: "system",
    }).returning();
    if (!cycle) throw new Error("test_cycle_not_created");
    await db.insert(groupConfig).values({
      orgId: orgA,
      version: 1,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: null,
      contributionCycleKind: "monthly",
      contributionAmount: "0.0000",
      currencyCode: "USD",
      loanRateModel: "declining_balance",
      loanRateValue: "1.0000",
      loanRatePeriodUnit: "monthly",
      loanGracePeriods: 0,
      loanToSavingsCapRatio: "3.00",
      interestResolution: "daily",
      repaymentSplitRule: "interest_first",
      paysSavingsInterest: false,
      savingsInterestRate: null,
      yearEndShareOutFormula: "proportional_time_weighted",
      safetyMarginAmount: "0.0000",
      reconciliationToleranceAmount: "0.0000",
      lateThresholdDays: 1,
      moraThresholdDays: 5,
      fiscalYearStartMonth: 1,
      fiscalYearStartDay: 1,
      config: {},
      createdAt: operationTime,
      createdBy: actorId,
      createdByKind: "member",
    });

    const reconciliation = createReconciliationService({ now: () => new Date("2026-08-02T12:00:00.000Z") });
    const before = await reconciliation.executeReconciliation({
      orgId: orgA,
      actorId,
      cycleId: cycle.id,
      declaredBankBalance: "-25.1234",
    });
    expect(before.computedPoolBalance).toBe("-25.1234");

    const reversed = await collections.reversePayout({
      orgId: orgA,
      actorId,
      collectionId: opened.id,
      reason: "Beneficiary payment was cancelled",
      datedOn: "2026-07-24",
      clientRequestId: randomUUID(),
    });
    expect(reversed).toMatchObject({ reversesId: paid.paidOutExpenseId, amount: "25.1234" });

    const after = await reconciliation.executeReconciliation({
      orgId: orgA,
      actorId,
      cycleId: cycle.id,
      declaredBankBalance: "0.0000",
    });
    expect(after.computedPoolBalance).toBe("0.0000");
    const closed = await reconciliation.closePeriod({
      orgId: orgA,
      actorId,
      reconciliationCycleId: after.id,
    });
    const [archive] = await db.select().from(statementArchive).where(eq(statementArchive.id, closed.monthlyCloseStatementId!));
    const payload = archive?.canonicalPayload as {
      movementSummary: { netFundBalance: string; bankFees: string };
      ledgerEntries: Array<{ kind: string; amount: string; note: string }>;
    };
    expect(payload.movementSummary).toMatchObject({ netFundBalance: "0.0000", bankFees: "0.0000" });
    expect(payload.ledgerEntries.filter((row) => row.note.includes("pago solidario"))).toEqual([
      expect.objectContaining({ kind: "expense", amount: "25.1234", note: "pago solidario" }),
      expect.objectContaining({ kind: "expense", amount: "-25.1234", note: "reversal: pago solidario" }),
    ]);
  });
});
