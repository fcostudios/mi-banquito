import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  account,
  auditLogEntry,
  contribution,
  contributionCycle,
  groupConfig,
  member,
  organization,
  paymentAllocation,
  paymentReceipt,
} from "@mi-banquito/db/schema";

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const ACTOR_ID = randomUUID();
const NOW = new Date("2026-07-18T14:52:00.000Z");

let db: typeof import("@mi-banquito/db")["db"];
let createMovementService: typeof import("./movements")["createMovementService"];
let createPaymentService: typeof import("./payments")["createPaymentService"];

describe("payment service with PostgreSQL", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for payment service integration tests");
    }
    ({ db } = await import("@mi-banquito/db"));
    ({ createMovementService } = await import("./movements"));
    ({ createPaymentService } = await import("./payments"));

    for (const [id, displayName] of [[ORG_A, "Payment test A"], [ORG_B, "Payment test B"]] as const) {
      await db.insert(organization).values({
        id,
        displayName,
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        createdAt: NOW,
        createdBy: ACTOR_ID,
        createdByKind: "system",
      });
    }
  });

  afterAll(async () => {
    for (const orgId of [ORG_A, ORG_B]) {
      await db.transaction(async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, orgId));
        await tx.delete(paymentAllocation).where(eq(paymentAllocation.orgId, orgId));
        await tx.delete(contribution).where(eq(contribution.orgId, orgId));
        await tx.delete(paymentReceipt).where(eq(paymentReceipt.orgId, orgId));
        await tx.delete(account).where(eq(account.orgId, orgId));
        await tx.delete(contributionCycle).where(eq(contributionCycle.orgId, orgId));
        await tx.delete(groupConfig).where(eq(groupConfig.orgId, orgId));
        await tx.delete(member).where(eq(member.orgId, orgId));
      });
    }
    await db.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
  });

  it("creates the current cycle and exposes a regular aporte in the selected fund account", async () => {
    const memberId = randomUUID();
    const accountId = randomUUID();
    await db.insert(groupConfig).values({
      orgId: ORG_A,
      version: 1,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: null,
      contributionCycleKind: "monthly",
      contributionAmount: "20.0000",
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
      reconciliationToleranceAmount: "0.0100",
      lateThresholdDays: 1,
      moraThresholdDays: 5,
      fiscalYearStartMonth: 1,
      fiscalYearStartDay: 1,
      config: {},
      createdAt: NOW,
      createdBy: ACTOR_ID,
      createdByKind: "member",
    });
    await db.insert(member).values({
      id: memberId,
      orgId: ORG_A,
      displayName: "No-cycle member",
      joinedOn: "2026-01-01",
      role: "aportante",
      status: "activo",
      initialSavingsBalance: "0.0000",
      createdAt: NOW,
      createdBy: ACTOR_ID,
      createdByKind: "system",
    });
    await db.insert(account).values({
      id: accountId,
      orgId: ORG_A,
      name: "Fund account",
      type: "group_bank",
      isGroupFund: true,
      clientRequestId: randomUUID(),
      status: "active",
      createdAt: NOW,
      createdBy: ACTOR_ID,
    });

    const input = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      clientRequestId: randomUUID(),
      memberId,
      accountId,
      amount: "20.0000",
      datedOn: "2026-07-18",
      paymentSource: "cash_in_meeting",
      slipPhotoId: "",
      notes: "Regression: current cycle was not seeded",
      targetLoanId: "",
      targetCycleId: "",
      extraDecision: "",
      overrideReason: "",
    } as const;

    const preview = await createPaymentService().previewMemberPayment(input);
    expect(preview).toMatchObject({
      requiresExtraDecision: false,
      unappliedAmount: "0.0000",
      allocations: [{ kind: "contribution_current", amount: "20.0000" }],
    });
    expect(await db.select({ id: contributionCycle.id }).from(contributionCycle)
      .where(eq(contributionCycle.orgId, ORG_A))).toEqual([]);

    const result = await createPaymentService().recordMemberPayment(input);

    expect(result).toMatchObject({
      requiresExtraDecision: false,
      unappliedAmount: "0.0000",
      allocations: [{ kind: "contribution_current", amount: "20.0000" }],
    });
    expect(await db.select({ cycleLabel: contributionCycle.cycleLabel }).from(contributionCycle)
      .where(eq(contributionCycle.orgId, ORG_A))).toEqual([{ cycleLabel: "2026-07" }]);
    expect(await db.select({ receiptId: paymentReceipt.id }).from(paymentReceipt)
      .where(eq(paymentReceipt.orgId, ORG_A))).toHaveLength(1);
    expect(await db.select({ amount: contribution.amount }).from(contribution)
      .where(eq(contribution.orgId, ORG_A))).toEqual([{ amount: "20.0000" }]);
    expect((await createMovementService().listActiveGroupAccountBalances(ORG_A))
      .map((row) => [row.id, row.balance])).toEqual([[accountId, "20.0000"]]);
    expect(await createMovementService().listActiveGroupAccountBalances(ORG_B)).toEqual([]);
  });
});
