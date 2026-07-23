import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  CompensationCeilingExceededError,
  compensationBreakdown,
  createTreasurerCompensationService,
  fiscalYearForCompensationPeriod,
} from "./treasurer-compensation";
import {
  account,
  alert,
  auditLogEntry,
  entityVersion,
  expense,
  extraordinaryCollection,
  extraordinaryCollectionLine,
  groupConfig,
  member,
  organization,
  treasurerCompensationDisbursement,
  withdrawal,
} from "@mi-banquito/db/schema";
import { createCompensationService } from "./compensation";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile("../../apps/web/.env.local");
  } catch {
    // The integration suite reports the missing real-PostgreSQL configuration.
  }
}

const money4 = (units: bigint): string =>
  `${units / 10_000n}.${String(units % 10_000n).padStart(4, "0")}`;

describe("compensationBreakdown", () => {
  it("uses the larger yearly recognition and carries unpaid prior years", () => {
    expect(compensationBreakdown({
      years: [
        { fiscalYear: 2025, accrued: "20.0000", recognition: "0.0000" },
        { fiscalYear: 2026, accrued: "20.0000", recognition: "35.0000" },
      ],
      cronPaid: "20.0000",
      manualPaid: "5.0000",
    })).toEqual({
      cumulativeEntitlement: "55.0000",
      cumulativePaid: "25.0000",
      payableNow: "30.0000",
    });
  });

  it("keeps payable within entitlement, decreases with payments, and reaches zero after exact payout", () => {
    fc.assert(fc.property(
      fc.array(fc.tuple(
        fc.bigInt({ min: 0n, max: 1_000_000_000_000n }),
        fc.bigInt({ min: 0n, max: 1_000_000_000_000n }),
      ), { minLength: 1, maxLength: 20 }),
      fc.bigInt({ min: 0n, max: 1_000_000_000_000n }),
      fc.bigInt({ min: 0n, max: 1_000_000_000_000n }),
      (yearAmounts, cronUnits, additionalPaidUnits) => {
        const years = yearAmounts.map(([accrued, recognition], index) => ({
          fiscalYear: 2000 + index,
          accrued: money4(accrued),
          recognition: money4(recognition),
        }));
        const initial = compensationBreakdown({ years, cronPaid: money4(cronUnits), manualPaid: "0.0000" });
        const initialEntitlement = BigInt(initial.cumulativeEntitlement.replace(".", ""));
        const initialPayable = BigInt(initial.payableNow.replace(".", ""));
        expect(initialPayable).toBeGreaterThanOrEqual(0n);
        expect(initialPayable).toBeLessThanOrEqual(initialEntitlement);

        const withMorePaid = compensationBreakdown({
          years,
          cronPaid: money4(cronUnits),
          manualPaid: money4(additionalPaidUnits),
        });
        expect(BigInt(withMorePaid.payableNow.replace(".", ""))).toBeLessThanOrEqual(initialPayable);

        const afterExactPayout = compensationBreakdown({
          years,
          cronPaid: money4(cronUnits),
          manualPaid: initial.payableNow,
        });
        expect(afterExactPayout.payableNow).toBe("0.0000");
      },
    ), { seed: 98, numRuns: 500 });
  });

  it("recognizes max(accrued, recognition), never their sum", () => {
    fc.assert(fc.property(
      fc.bigInt({ min: 0n, max: 999_999_999_999_999_999n }),
      fc.bigInt({ min: 0n, max: 999_999_999_999_999_999n }),
      (accrued, recognition) => {
        const result = compensationBreakdown({
          years: [{ fiscalYear: 2026, accrued: money4(accrued), recognition: money4(recognition) }],
          cronPaid: "0.0000",
          manualPaid: "0.0000",
        });
        expect(result.cumulativeEntitlement).toBe(money4(accrued > recognition ? accrued : recognition));
      },
    ), { seed: 9801, numRuns: 500 });
  });

  it("attributes monthly and yearly periods from exact producer due dates at a non-January/day boundary", () => {
    const boundary = { startMonth: 7, startDay: 15 };
    const fiscalYear = (periodLabel: string, nextDueOn: string, period: "monthly" | "yearly") =>
      fiscalYearForCompensationPeriod({ periodLabel, kindAtDisbursement: { nextDueOn, period } }, boundary);
    expect(fiscalYear("2026-06", "2026-06-30", "monthly")).toBe(2025);
    expect(fiscalYear("2026-07", "2026-07-14", "monthly")).toBe(2025);
    expect(fiscalYear("2026-07", "2026-07-15", "monthly")).toBe(2026);
    expect(fiscalYear("2026-08", "2026-08-01", "monthly")).toBe(2026);
    expect(fiscalYear("2026", "2026-06-30", "yearly")).toBe(2025);
    expect(fiscalYear("2026", "2026-07-15", "yearly")).toBe(2026);
    expect(() => fiscalYear("2026-06", "2026-07-15", "monthly"))
      .toThrow("compensation_period_metadata_mismatch");
    expect(() => fiscalYearForCompensationPeriod({
      periodLabel: "2026-07", kindAtDisbursement: {},
    }, boundary)).toThrow("compensation_period_attribution_ambiguous");
    expect(fiscalYearForCompensationPeriod({
      periodLabel: "2026-07", kindAtDisbursement: {},
    }, { startMonth: 1, startDay: 1 })).toBe(2026);
  });
});

describe("treasurer compensation service with PostgreSQL", () => {
  const orgA = randomUUID();
  const orgB = randomUUID();
  const actorId = randomUUID();
  const now = new Date("2026-07-21T21:00:00.000Z");
  const auditTrigger = `reject_compensation_audit_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const auditFunction = `${auditTrigger}_fn`;
  let db: typeof import("@mi-banquito/db")["db"];
  let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
  let treasurerA: string;
  let treasurerB: string;
  let accountA: string;
  let accountB: string;

  const seedConfig = async (
    orgId: string,
    boundary = { month: 1, day: 1 },
    config: Record<string, unknown> = {},
  ) => {
    await db.insert(groupConfig).values({
      orgId,
      version: 1,
      validFrom: new Date("2025-01-01T00:00:00.000Z"),
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
      yearEndShareOutFormula: "time_weighted",
      safetyMarginAmount: "0.0000",
      reconciliationToleranceAmount: "0.0000",
      lateThresholdDays: 1,
      moraThresholdDays: 5,
      fiscalYearStartMonth: boundary.month,
      fiscalYearStartDay: boundary.day,
      config,
      createdAt: now,
      createdBy: actorId,
      createdByKind: "member",
    });
  };

  const seedMember = async (
    orgId: string,
    role: "tesorera" | "aportante" = "tesorera",
    status: "activo" | "en_pausa" | "baja" = "activo",
  ) => {
    const [row] = await db.insert(member).values({
      orgId,
      displayName: role === "tesorera" ? "Tesorera" : "Aportante",
      joinedOn: "2025-01-01",
      role,
      status,
      initialSavingsBalance: "0.0000",
      createdAt: now,
      createdBy: actorId,
      createdByKind: "member",
    }).returning();
    if (!row) throw new Error("test_member_not_created");
    return row.id;
  };

  const seedAccount = async (orgId: string) => {
    const [row] = await db.insert(account).values({
      orgId,
      name: "Banco grupo",
      type: "group_bank",
      isGroupFund: true,
      status: "active",
      clientRequestId: randomUUID(),
      createdAt: now,
      createdBy: actorId,
    }).returning();
    if (!row) throw new Error("test_account_not_created");
    return row.id;
  };

  const seedAccrual = async (input: {
    orgId: string;
    memberId: string;
    periodLabel: string;
    amount: string;
    paid?: boolean;
    nextDueOn?: string;
    period?: "monthly" | "yearly";
  }) => {
    let withdrawalId: string | null = null;
    if (input.paid) {
      const [paid] = await db.insert(withdrawal).values({
        orgId: input.orgId,
        memberId: input.memberId,
        amount: input.amount,
        currencyCode: "USD",
        datedOn: "2026-06-30",
        recordedAt: now,
        kind: "treasurer_compensation_disbursement",
        createdAt: now,
        createdBy: actorId,
        createdByKind: "system",
      }).returning();
      if (!paid) throw new Error("test_withdrawal_not_created");
      withdrawalId = paid.id;
    }
    await db.insert(treasurerCompensationDisbursement).values({
      orgId: input.orgId,
      memberId: input.memberId,
      periodLabel: input.periodLabel,
      amount: input.amount,
      currencyCode: "USD",
      kindAtDisbursement: {
        kind: "fixed_periodic",
        nextDueOn: input.nextDueOn ?? (input.periodLabel.length === 4 ? `${input.periodLabel}-01-01` : `${input.periodLabel}-01`),
        period: input.period ?? (input.periodLabel.length === 4 ? "yearly" : "monthly"),
      },
      withdrawalId,
      disbursedOn: "2026-06-30",
      createdAt: now,
    });
    return withdrawalId;
  };

  const seedCollection = async (input: {
    orgId: string;
    memberId: string;
    accountId: string;
    kind: "treasurer_recognition" | "solidarity";
    status: "open" | "closed" | "cancelled";
    amount: string;
    year?: number;
  }) => {
    const [saved] = await db.insert(extraordinaryCollection).values({
      orgId: input.orgId,
      kind: input.kind,
      purpose: `Collection ${input.kind} ${input.status}`,
      beneficiaryMemberId: input.memberId,
      status: "collecting",
      openedOn: "2026-05-01",
      recognitionFiscalYear: input.kind === "treasurer_recognition" ? (input.year ?? 2026) : null,
      createdAt: now,
      createdBy: actorId,
    }).returning();
    if (!saved) throw new Error("test_collection_not_created");
    await db.insert(extraordinaryCollectionLine).values({
      orgId: input.orgId,
      collectionId: saved.id,
      memberId: input.memberId,
      amount: input.amount,
      accountId: input.accountId,
      reconciliationStatus: "regularized",
      datedOn: "2026-05-02",
      createdAt: now,
      createdBy: actorId,
    });
    if (input.status === "cancelled") {
      await db.update(extraordinaryCollection).set({
        status: "cancelled",
        surplusAmount: input.amount,
        disposition: "retained",
        dispositionMotive: "Assembly cancellation vote",
      }).where(eq(extraordinaryCollection.id, saved.id));
    } else if (input.status === "closed" && input.kind === "treasurer_recognition") {
      await db.update(extraordinaryCollection).set({ status: "paid_out" })
        .where(eq(extraordinaryCollection.id, saved.id));
      await db.update(extraordinaryCollection).set({
        status: "closed",
        surplusAmount: input.amount,
        disposition: "retained",
        dispositionMotive: "Assembly recognition vote",
      }).where(eq(extraordinaryCollection.id, saved.id));
    } else if (input.status === "closed") {
      const [payout] = await db.insert(expense).values({
        orgId: input.orgId, purpose: "pago solidario", amount: input.amount, currencyCode: "USD",
        beneficiaryMemberId: input.memberId, incurredOn: "2026-05-03", status: "paid", recordedAt: now,
        accountId: input.accountId, category: "solidarity_payout", clientRequestId: randomUUID(),
        createdAt: now, createdBy: actorId, createdByKind: "member",
      }).returning();
      if (!payout) throw new Error("test_payout_not_created");
      await db.update(extraordinaryCollection).set({ status: "paid_out", paidOutExpenseId: payout.id })
        .where(eq(extraordinaryCollection.id, saved.id));
      await db.update(extraordinaryCollection).set({ status: "closed", surplusAmount: "0.0000" })
        .where(eq(extraordinaryCollection.id, saved.id));
    }
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for treasurer compensation integration tests");
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    for (const [id, displayName] of [[orgA, "Compensation A"], [orgB, "Compensation B"]] as const) {
      await db.insert(organization).values({
        id,
        displayName,
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        createdAt: now,
        createdBy: actorId,
        createdByKind: "system",
      });
    }
  });

  beforeEach(async () => {
    await seedConfig(orgA);
    await seedConfig(orgB);
    treasurerA = await seedMember(orgA);
    treasurerB = await seedMember(orgB);
    accountA = await seedAccount(orgA);
    accountB = await seedAccount(orgB);
  });

  afterEach(async () => {
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${auditTrigger} ON audit_log_entry`));
    await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${auditFunction}()`));
    for (const orgId of [orgA, orgB]) {
      await withTenantTransaction(orgId, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, orgId));
        await tx.delete(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, orgId));
        await tx.delete(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, orgId));
        await tx.delete(expense).where(eq(expense.orgId, orgId));
        await tx.delete(treasurerCompensationDisbursement).where(eq(treasurerCompensationDisbursement.orgId, orgId));
        await tx.delete(withdrawal).where(eq(withdrawal.orgId, orgId));
        await tx.delete(account).where(eq(account.orgId, orgId));
        await tx.delete(member).where(eq(member.orgId, orgId));
        await tx.delete(entityVersion).where(eq(entityVersion.orgId, orgId));
        await tx.delete(groupConfig).where(eq(groupConfig.orgId, orgId));
      });
    }
  });

  afterAll(async () => {
    if (db) await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
  });

  it("enforces the cumulative AC-9 ceiling, tenant fence, max rule, reversal netting, and replay", async () => {
    await seedAccrual({ orgId: orgA, memberId: treasurerA, periodLabel: "2025", amount: "20.0000" });
    await seedAccrual({ orgId: orgA, memberId: treasurerA, periodLabel: "2026-06", amount: "20.0000", paid: true });
    await seedCollection({ orgId: orgA, memberId: treasurerA, accountId: accountA, kind: "treasurer_recognition", status: "closed", amount: "35.0000" });
    await seedCollection({ orgId: orgA, memberId: treasurerA, accountId: accountA, kind: "solidarity", status: "closed", amount: "500.0000" });
    await seedCollection({ orgId: orgA, memberId: treasurerA, accountId: accountA, kind: "treasurer_recognition", status: "open", amount: "500.0000" });
    await seedCollection({ orgId: orgA, memberId: treasurerA, accountId: accountA, kind: "treasurer_recognition", status: "cancelled", amount: "500.0000" });
    await seedCollection({ orgId: orgB, memberId: treasurerB, accountId: accountB, kind: "treasurer_recognition", status: "closed", amount: "999.0000" });

    const [manualOriginal] = await db.insert(expense).values({
      orgId: orgA, purpose: "pago a tesorera", amount: "5.0000", currencyCode: "USD",
      beneficiaryMemberId: treasurerA, incurredOn: "2026-01-10", status: "paid", recordedAt: now,
      accountId: accountA, category: "treasurer_comp_payout", clientRequestId: randomUUID(),
      createdAt: now, createdBy: actorId, createdByKind: "member",
    }).returning();
    if (!manualOriginal) throw new Error("test_expense_not_created");
    await db.insert(expense).values({
      orgId: orgA, purpose: "pago a tesorera", amount: "5.0000", currencyCode: "USD",
      beneficiaryMemberId: treasurerA, incurredOn: "2026-01-11", status: "paid", recordedAt: now,
      accountId: accountA, category: "treasurer_comp_payout", clientRequestId: randomUUID(),
      reversesId: manualOriginal.id, reverseReason: "Correction of prior payout",
      createdAt: now, createdBy: actorId, createdByKind: "member",
    });
    await db.insert(expense).values({
      orgId: orgA, purpose: "pago a tesorera", amount: "300.0000", currencyCode: "USD",
      beneficiaryMemberId: treasurerA, incurredOn: "2026-01-14", status: "planned", recordedAt: now,
      accountId: accountA, category: "treasurer_comp_payout", clientRequestId: randomUUID(),
      createdAt: now, createdBy: actorId, createdByKind: "member",
    });
    const [plannedOriginal] = await db.insert(expense).values({
      orgId: orgA, purpose: "pago a tesorera", amount: "400.0000", currencyCode: "USD",
      beneficiaryMemberId: treasurerA, incurredOn: "2026-01-12", status: "planned", recordedAt: now,
      accountId: accountA, category: "treasurer_comp_payout", clientRequestId: randomUUID(),
      createdAt: now, createdBy: actorId, createdByKind: "member",
    }).returning();
    if (!plannedOriginal) throw new Error("test_planned_expense_not_created");
    await db.insert(expense).values({
      orgId: orgA, purpose: "pago a tesorera", amount: "400.0000", currencyCode: "USD",
      beneficiaryMemberId: treasurerA, incurredOn: "2026-01-13", status: "planned", recordedAt: now,
      accountId: accountA, category: "treasurer_comp_payout", clientRequestId: randomUUID(),
      reversesId: plannedOriginal.id, reverseReason: "Planned entry correction",
      createdAt: now, createdBy: actorId, createdByKind: "member",
    });

    const service = createTreasurerCompensationService({ now: () => now });
    await expect(service.getBreakdown({ orgId: orgA, fiscalYear: 2026 })).resolves.toEqual({
      cumulativeEntitlement: "55.0000",
      cumulativePaid: "20.0000",
      payableNow: "35.0000",
    });
    await expect(service.recordPayout({
      orgId: orgA, actorId: treasurerA, fiscalYear: 2026, accountId: accountA,
      amount: "55.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    })).rejects.toEqual(new CompensationCeilingExceededError({
      cumulativeEntitlement: "55.0000", cumulativePaid: "20.0000", payableNow: "35.0000",
    }));

    const clientRequestId = randomUUID();
    const command = {
      orgId: orgA, actorId: treasurerA, fiscalYear: 2026, accountId: accountA,
      amount: "35.0000", datedOn: "2026-07-21", notes: "  Pago reconocido  ", clientRequestId,
    };
    const [first, replay] = await Promise.all([service.recordPayout(command), service.recordPayout(command)]);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      orgId: orgA, category: "treasurer_comp_payout", purpose: "pago a tesorera",
      beneficiaryMemberId: treasurerA, accountId: accountA, amount: "35.0000",
      notes: "Pago reconocido", clientRequestId,
    });
    expect(await db.select().from(expense).where(and(
      eq(expense.orgId, orgA), eq(expense.clientRequestId, clientRequestId),
    ))).toHaveLength(1);
    expect(await db.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, orgA), eq(auditLogEntry.subjectId, first.id),
    ))).toHaveLength(1);
    await expect(service.recordPayout({ ...command, amount: "34.0000" }))
      .rejects.toThrow("compensation_idempotency_conflict");
    await expect(service.recordPayout({ ...command, fiscalYear: 2025 }))
      .rejects.toThrow("compensation_idempotency_conflict");
  });

  it("nets a cron Withdrawal reversal without removing its accrued entitlement", async () => {
    const originalId = await seedAccrual({
      orgId: orgA, memberId: treasurerA, periodLabel: "2026", amount: "10.0000", paid: true,
    });
    if (!originalId) throw new Error("test_paid_accrual_required");
    await db.insert(withdrawal).values({
      orgId: orgA, memberId: treasurerA, amount: "10.0000", currencyCode: "USD",
      datedOn: "2026-07-01", recordedAt: now, kind: "treasurer_compensation_disbursement",
      reversesId: originalId, reverseReason: "Cron payout correction", createdAt: now,
      createdBy: actorId, createdByKind: "member",
    });
    await expect(createTreasurerCompensationService().getBreakdown({ orgId: orgA, fiscalYear: 2026 }))
      .resolves.toEqual({
        cumulativeEntitlement: "10.0000",
        cumulativePaid: "0.0000",
        payableNow: "10.0000",
      });
  });

  it("fails closed on malformed manual payout reversals instead of reducing paid", async () => {
    const otherMember = await seedMember(orgA, "aportante");
    const service = createTreasurerCompensationService();
    const cases = [
      { name: "partial", values: { amount: "4.0000" } },
      { name: "oversized", values: { amount: "11.0000" } },
      { name: "wrong currency", values: { currencyCode: "EUR" } },
      { name: "wrong member", values: { beneficiaryMemberId: otherMember } },
      { name: "wrong category", values: { category: "operating" as const } },
      { name: "date before original", values: { incurredOn: "2026-01-09" } },
    ];
    for (const testCase of cases) {
      await withTenantTransaction(orgA, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.delete(expense).where(eq(expense.orgId, orgA));
      });
      const [original] = await db.insert(expense).values({
        orgId: orgA, purpose: "pago a tesorera", amount: "10.0000", currencyCode: "USD",
        beneficiaryMemberId: treasurerA, incurredOn: "2026-01-10", status: "paid", recordedAt: now,
        accountId: accountA, category: "treasurer_comp_payout", clientRequestId: randomUUID(),
        createdAt: now, createdBy: treasurerA, createdByKind: "member",
      }).returning();
      if (!original) throw new Error("test_manual_original_required");
      await withTenantTransaction(orgA, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.insert(expense).values({
          orgId: orgA, purpose: "reversal: pago a tesorera", amount: "10.0000", currencyCode: "USD",
          beneficiaryMemberId: treasurerA, incurredOn: "2026-01-11", status: "paid", recordedAt: now,
          accountId: accountA, category: "treasurer_comp_payout", clientRequestId: randomUUID(),
          reversesId: original.id, reverseReason: "Correction with sufficient reason",
          createdAt: now, createdBy: treasurerA, createdByKind: "member",
          ...testCase.values,
        });
      });
      await expect(service.getBreakdown({ orgId: orgA, fiscalYear: 2026 }), testCase.name)
        .rejects.toMatchObject({ code: "compensation_paid_projection_integrity" });
    }

    await withTenantTransaction(orgA, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(expense).where(eq(expense.orgId, orgA));
      await tx.insert(expense).values({
        orgId: orgA, purpose: "reversal: pago a tesorera", amount: "10.0000", currencyCode: "USD",
        beneficiaryMemberId: treasurerA, incurredOn: "2026-01-11", status: "paid", recordedAt: now,
        accountId: accountA, category: "treasurer_comp_payout", clientRequestId: randomUUID(),
        reversesId: randomUUID(), reverseReason: "Orphan correction reference",
        createdAt: now, createdBy: treasurerA, createdByKind: "member",
      });
    });
    await expect(service.getBreakdown({ orgId: orgA, fiscalYear: 2026 }), "orphan")
      .rejects.toMatchObject({ code: "compensation_paid_projection_integrity" });

    await withTenantTransaction(orgA, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(expense).where(eq(expense.orgId, orgA));
    });
    const [duplicateOriginal] = await db.insert(expense).values({
      orgId: orgA, purpose: "pago a tesorera", amount: "10.0000", currencyCode: "USD",
      beneficiaryMemberId: treasurerA, incurredOn: "2026-01-10", status: "paid", recordedAt: now,
      accountId: accountA, category: "treasurer_comp_payout", clientRequestId: randomUUID(),
      createdAt: now, createdBy: treasurerA, createdByKind: "member",
    }).returning();
    if (!duplicateOriginal) throw new Error("test_manual_original_required");
    const duplicateExpenseValues = () => ({
        orgId: orgA, purpose: "reversal: pago a tesorera", amount: "10.0000", currencyCode: "USD",
        beneficiaryMemberId: treasurerA, incurredOn: "2026-01-11", status: "paid" as const, recordedAt: now,
        accountId: accountA, category: "treasurer_comp_payout" as const, clientRequestId: randomUUID(),
        reversesId: duplicateOriginal.id, reverseReason: "Duplicate correction reference",
        createdAt: now, createdBy: treasurerA, createdByKind: "member",
      });
    await db.insert(expense).values(duplicateExpenseValues());
    await expect(db.insert(expense).values(duplicateExpenseValues()), "duplicate")
      .rejects.toMatchObject({ code: "23505" });
    expect(await db.select().from(expense).where(and(
      eq(expense.orgId, orgA), eq(expense.reversesId, duplicateOriginal.id),
    ))).toHaveLength(1);
  });

  it("fails closed on malformed cron Withdrawal reversals instead of reducing paid", async () => {
    const otherMember = await seedMember(orgA, "aportante");
    const service = createTreasurerCompensationService();
    const cases = [
      { name: "partial", values: { amount: "4.0000" } },
      { name: "oversized", values: { amount: "11.0000" } },
      { name: "wrong currency", values: { currencyCode: "EUR" } },
      { name: "wrong member", values: { memberId: otherMember } },
      { name: "wrong kind", values: { kind: "other" as const } },
      { name: "date before original", values: { datedOn: "2026-06-29" } },
    ];
    for (const testCase of cases) {
      await withTenantTransaction(orgA, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.delete(treasurerCompensationDisbursement)
          .where(eq(treasurerCompensationDisbursement.orgId, orgA));
        await tx.delete(withdrawal).where(eq(withdrawal.orgId, orgA));
      });
      const originalId = await seedAccrual({
        orgId: orgA, memberId: treasurerA, periodLabel: "2026", amount: "10.0000", paid: true,
      });
      if (!originalId) throw new Error("test_cron_original_required");
      await withTenantTransaction(orgA, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.insert(withdrawal).values({
          orgId: orgA, memberId: treasurerA, amount: "10.0000", currencyCode: "USD",
          datedOn: "2026-07-01", recordedAt: now, kind: "treasurer_compensation_disbursement",
          reversesId: originalId, reverseReason: "Correction with sufficient reason",
          createdAt: now, createdBy: treasurerA, createdByKind: "member",
          ...testCase.values,
        });
      });
      await expect(service.getBreakdown({ orgId: orgA, fiscalYear: 2026 }), testCase.name)
        .rejects.toMatchObject({ code: "compensation_paid_projection_integrity" });
    }

    await withTenantTransaction(orgA, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(treasurerCompensationDisbursement)
        .where(eq(treasurerCompensationDisbursement.orgId, orgA));
      await tx.delete(withdrawal).where(eq(withdrawal.orgId, orgA));
      await tx.insert(withdrawal).values({
        orgId: orgA, memberId: treasurerA, amount: "10.0000", currencyCode: "USD",
        datedOn: "2026-07-01", recordedAt: now, kind: "treasurer_compensation_disbursement",
        reversesId: randomUUID(), reverseReason: "Orphan cron correction",
        createdAt: now, createdBy: treasurerA, createdByKind: "member",
      });
    });
    await expect(service.getBreakdown({ orgId: orgA, fiscalYear: 2026 }), "orphan")
      .rejects.toMatchObject({ code: "compensation_paid_projection_integrity" });

    await withTenantTransaction(orgA, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(withdrawal).where(eq(withdrawal.orgId, orgA));
    });
    const originalId = await seedAccrual({
      orgId: orgA, memberId: treasurerA, periodLabel: "2026", amount: "10.0000", paid: true,
    });
    if (!originalId) throw new Error("test_cron_original_required");
    const duplicateWithdrawalValues = () => ({
        orgId: orgA, memberId: treasurerA, amount: "10.0000", currencyCode: "USD",
        datedOn: "2026-07-01", recordedAt: now, kind: "treasurer_compensation_disbursement" as const,
        reversesId: originalId, reverseReason: "Duplicate cron correction",
        createdAt: now, createdBy: treasurerA, createdByKind: "member" as const,
      });
    await db.insert(withdrawal).values(duplicateWithdrawalValues());
    await expect(db.insert(withdrawal).values(duplicateWithdrawalValues()), "duplicate")
      .rejects.toMatchObject({ code: "23505" });
    expect(await db.select().from(withdrawal).where(and(
      eq(withdrawal.orgId, orgA), eq(withdrawal.reversesId, originalId),
    ))).toHaveLength(1);
  });

  it("binds manual payouts to the exact active same-org treasurer actor", async () => {
    await seedAccrual({ orgId: orgA, memberId: treasurerA, periodLabel: "2026", amount: "10.0000" });
    const contributor = await seedMember(orgA, "aportante");
    const inactiveTreasurer = await seedMember(orgA, "tesorera", "en_pausa");
    const service = createTreasurerCompensationService({ now: () => now });
    const input = {
      orgId: orgA, fiscalYear: 2026, accountId: accountA,
      amount: "1.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    };
    for (const rejectedActor of [randomUUID(), treasurerB, contributor, inactiveTreasurer]) {
      await expect(service.recordPayout({ ...input, actorId: rejectedActor, clientRequestId: randomUUID() }))
        .rejects.toThrow("compensation_actor_not_active_treasurer");
    }
    await expect(service.recordPayout({ ...input, actorId: treasurerA }))
      .resolves.toMatchObject({
        createdBy: treasurerA,
        beneficiaryMemberId: treasurerA,
      });
  });

  it("replays the original payout after actor, account, and config lifecycle changes", async () => {
    await seedAccrual({ orgId: orgA, memberId: treasurerA, periodLabel: "2026", amount: "10.0000" });
    const service = createTreasurerCompensationService({ now: () => now });
    const command = {
      orgId: orgA,
      actorId: treasurerA,
      fiscalYear: 2026,
      accountId: accountA,
      amount: "1.0000",
      datedOn: "2026-07-21",
      notes: "Lifecycle-stable replay",
      clientRequestId: randomUUID(),
    };
    const original = await service.recordPayout(command);

    await withTenantTransaction(orgA, async (tx) => {
      await tx.update(member).set({ status: "baja" }).where(eq(member.id, treasurerA));
      await tx.update(account).set({ status: "archived" }).where(eq(account.id, accountA));
      await tx.update(groupConfig).set({ currencyCode: "EUR" }).where(and(
        eq(groupConfig.orgId, orgA),
        isNull(groupConfig.validTo),
      ));
    });

    await expect(service.recordPayout(command)).resolves.toEqual(original);
    await expect(service.recordPayout({ ...command, notes: "Changed retry" }))
      .rejects.toThrow("compensation_idempotency_conflict");
  });

  it("makes replay depend on the full persisted row and audit fingerprint", async () => {
    await seedAccrual({ orgId: orgA, memberId: treasurerA, periodLabel: "2026", amount: "10.0000" });
    const otherMember = await seedMember(orgA, "aportante");
    const service = createTreasurerCompensationService({ now: () => now });
    const command = (clientRequestId: string) => ({
      orgId: orgA, actorId: treasurerA, fiscalYear: 2026, accountId: accountA,
      amount: "1.0000", datedOn: "2026-07-21", notes: "Exact payout", clientRequestId,
    });

    const rowClientId = randomUUID();
    const row = await service.recordPayout(command(rowClientId));
    await withTenantTransaction(orgA, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.update(expense).set({
        currencyCode: "EUR",
        beneficiaryMemberId: otherMember,
      }).where(eq(expense.id, row.id));
    });
    await expect(service.recordPayout(command(rowClientId)))
      .rejects.toThrow("compensation_idempotency_conflict");

    const auditClientId = randomUUID();
    const auditRow = await service.recordPayout(command(auditClientId));
    const [auditRowEntry] = await db.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, orgA), eq(auditLogEntry.subjectId, auditRow.id),
      eq(auditLogEntry.actionKind, "treasurer_compensation.paid"),
    ));
    if (!auditRowEntry) throw new Error("test_payout_audit_required");
    await withTenantTransaction(orgA, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.update(auditLogEntry).set({
        payloadSnapshot: { ...(auditRowEntry.payloadSnapshot as Record<string, unknown>), category: "operating" },
      }).where(eq(auditLogEntry.id, auditRowEntry.id));
    });
    await expect(service.recordPayout(command(auditClientId)))
      .rejects.toThrow("compensation_idempotency_conflict");

    const collisionClientId = randomUUID();
    await db.insert(expense).values({
      orgId: orgA, purpose: "operating", amount: "1.0000", currencyCode: "USD",
      beneficiaryMemberId: null, incurredOn: "2026-07-21", status: "paid", recordedAt: now,
      accountId: accountA, category: "operating", clientRequestId: collisionClientId,
      createdAt: now, createdBy: treasurerA, createdByKind: "member",
    });
    await expect(service.recordPayout(command(collisionClientId)))
      .rejects.toThrow("compensation_idempotency_conflict");
  });

  it("allows exactly one winner when active treasurers are inserted concurrently", async () => {
    const raceOrgId = randomUUID();
    await db.insert(organization).values({
      id: raceOrgId,
      displayName: "Active treasurer race",
      countryCode: "EC",
      currencyCode: "USD",
      timezone: "America/Guayaquil",
      defaultLanguage: "es-EC",
      status: "active",
      createdAt: now,
      createdBy: actorId,
      createdByKind: "system",
    });
    try {
      const attempts = await Promise.allSettled([
        seedMember(raceOrgId, "tesorera"),
        seedMember(raceOrgId, "tesorera"),
      ]);
      expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
      expect(await db.select().from(member).where(and(
        eq(member.orgId, raceOrgId),
        eq(member.role, "tesorera"),
        eq(member.status, "activo"),
      ))).toHaveLength(1);
    } finally {
      await db.delete(member).where(eq(member.orgId, raceOrgId));
      await db.delete(organization).where(eq(organization.id, raceOrgId));
    }
  });

  it("uses exact due-on metadata for real-PostgreSQL fiscal attribution around July 15", async () => {
    await withTenantTransaction(orgA, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(groupConfig).where(eq(groupConfig.orgId, orgA));
    });
    await seedConfig(orgA, { month: 7, day: 15 });
    const cases = [
      { label: "2026-06", due: "2026-06-30", period: "monthly" as const, expected: 2025 },
      { label: "2026-07", due: "2026-07-14", period: "monthly" as const, expected: 2025 },
      { label: "2026-07", due: "2026-07-15", period: "monthly" as const, expected: 2026 },
      { label: "2026-08", due: "2026-08-01", period: "monthly" as const, expected: 2026 },
      { label: "2026", due: "2026-06-30", period: "yearly" as const, expected: 2025 },
      { label: "2026", due: "2026-07-15", period: "yearly" as const, expected: 2026 },
    ];
    const service = createTreasurerCompensationService();
    for (const testCase of cases) {
      await withTenantTransaction(orgA, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.delete(treasurerCompensationDisbursement)
          .where(eq(treasurerCompensationDisbursement.orgId, orgA));
      });
      await seedAccrual({
        orgId: orgA, memberId: treasurerA, periodLabel: testCase.label,
        amount: "1.0000", nextDueOn: testCase.due, period: testCase.period,
      });
      const prior = await service.getBreakdown({ orgId: orgA, fiscalYear: 2025 });
      const current = await service.getBreakdown({ orgId: orgA, fiscalYear: 2026 });
      expect(prior.cumulativeEntitlement, `${testCase.period} ${testCase.due}`).toBe(
        testCase.expected === 2025 ? "1.0000" : "0.0000",
      );
      expect(current.cumulativeEntitlement, `${testCase.period} ${testCase.due}`).toBe("1.0000");
    }
  });

  it("serializes the US-050 cron before a concurrent manual payout on the shared entitlement", async () => {
    await withTenantTransaction(orgA, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(groupConfig).where(eq(groupConfig.orgId, orgA));
    });
    await seedConfig(orgA, { month: 1, day: 1 }, {
      treasurerCompensation: {
        kind: "fixed_periodic", amount: "10.0000", currency: "USD",
        period: "monthly", nextDueOn: "2026-07-01",
      },
    });
    await seedCollection({
      orgId: orgA, memberId: treasurerA, accountId: accountA,
      kind: "treasurer_recognition", status: "closed", amount: "10.0000", year: 2026,
    });

    let releaseCron!: () => void;
    const cronMayContinue = new Promise<void>((resolve) => { releaseCron = resolve; });
    let reportCronLocked!: () => void;
    const cronLocked = new Promise<void>((resolve) => { reportCronLocked = resolve; });
    let reportManualAtLock!: () => void;
    const manualAtLock = new Promise<void>((resolve) => { reportManualAtLock = resolve; });
    const cron = createCompensationService({
      now: () => now,
      afterMoneyLock: async (lockedOrgId) => {
        if (lockedOrgId !== orgA) return;
        reportCronLocked();
        await cronMayContinue;
      },
    });
    const manual = createTreasurerCompensationService({
      now: () => now,
      beforeMoneyLock: (lockedOrgId) => {
        if (lockedOrgId === orgA) reportManualAtLock();
      },
    });
    const cronResult = cron.awardDueTreasurerCompensation("2026-07-21");
    await cronLocked;
    const manualResult = manual.recordPayout({
      orgId: orgA, actorId: treasurerA, fiscalYear: 2026, accountId: accountA,
      amount: "10.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const manualRejection = expect(manualResult).rejects.toEqual(new CompensationCeilingExceededError({
      cumulativeEntitlement: "10.0000", cumulativePaid: "10.0000", payableNow: "0.0000",
    }));
    await manualAtLock;
    releaseCron();
    await expect(cronResult).resolves.toMatchObject({
      disbursementsAwarded: 1,
      disbursementsAccruedWithoutCash: 0,
      configsAdvanced: 1,
      failures: [],
    });
    await expect(cron.awardDueTreasurerCompensation("2026-07-21")).resolves.toMatchObject({
      dueConfigs: 0,
      disbursementsAwarded: 0,
      disbursementsAccruedWithoutCash: 0,
      configsAdvanced: 0,
      failures: [],
    });
    const disbursements = await db.select().from(treasurerCompensationDisbursement).where(
      eq(treasurerCompensationDisbursement.orgId, orgA),
    );
    expect(disbursements).toHaveLength(1);
    const disbursement = disbursements[0]!;
    await manualRejection;
    const withdrawals = await db.select().from(withdrawal).where(and(
      eq(withdrawal.orgId, orgA), eq(withdrawal.kind, "treasurer_compensation_disbursement"),
    ));
    expect(withdrawals).toHaveLength(1);
    const cashWithdrawal = withdrawals[0]!;
    expect(cashWithdrawal).toMatchObject({
      memberId: treasurerA,
      amount: "10.0000",
      currencyCode: "USD",
      datedOn: "2026-07-21",
      createdBy: "00000000-0000-0000-0000-000000000000",
      createdByKind: "system",
    });
    expect(disbursement).toMatchObject({
      memberId: treasurerA,
      periodLabel: "2026-07",
      amount: "10.0000",
      currencyCode: "USD",
      withdrawalId: cashWithdrawal.id,
    });
    expect(await db.select().from(alert).where(and(
      eq(alert.orgId, orgA),
      eq(alert.alertKind, "treasurer_compensation_disbursed"),
    ))).toEqual([expect.objectContaining({
      severity: "low",
      audience: "treasurer",
      subjectKind: "treasurer_compensation_disbursement",
      subjectId: disbursement.id,
      payload: {
        disbursementId: disbursement.id,
        withdrawalId: cashWithdrawal.id,
        memberId: treasurerA,
        periodLabel: "2026-07",
        amount: "10.0000",
        currencyCode: "USD",
        message: "Compensación de tesorera de 2026-07 acreditada — USD 10.0000",
      },
    })]);
    expect(await db.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, orgA),
      eq(auditLogEntry.actionKind, "treasurer_compensation.disbursed"),
    ))).toEqual([expect.objectContaining({
      actorKind: "system",
      actorId: "00000000-0000-0000-0000-000000000000",
      subjectKind: "treasurer_compensation_disbursement",
      subjectId: disbursement.id,
      reason: null,
      payloadSnapshot: {
        disbursementId: disbursement.id,
        withdrawalId: cashWithdrawal.id,
        memberId: treasurerA,
        periodLabel: "2026-07",
        amount: "10.0000",
        currencyCode: "USD",
        dueOn: "2026-07-01",
        nextDueOn: "2026-08-01",
      },
    })]);
    const configs = await db.select().from(groupConfig).where(eq(groupConfig.orgId, orgA));
    expect(configs).toHaveLength(2);
    const advancedConfig = configs.find((config) => config.validTo === null);
    expect(advancedConfig).toMatchObject({
      version: 2,
      validFrom: now,
      validTo: null,
    });
    expect((advancedConfig?.config as { treasurerCompensation?: { nextDueOn?: string } })
      .treasurerCompensation?.nextDueOn).toBe("2026-08-01");
    expect(await db.select().from(entityVersion).where(and(
      eq(entityVersion.orgId, orgA),
      eq(entityVersion.entityKind, "GroupConfig"),
    ))).toEqual([expect.objectContaining({
      entityId: advancedConfig?.id,
      version: 2,
      validFrom: now,
      validTo: null,
      changeKind: "update",
      changeReason: "treasurer_compensation_next_due_on_advanced",
      createdBy: "00000000-0000-0000-0000-000000000000",
      createdByKind: "system",
      payloadSnapshot: expect.objectContaining({
        id: advancedConfig?.id,
        version: 2,
        validTo: null,
        config: expect.objectContaining({
          treasurerCompensation: expect.objectContaining({ nextDueOn: "2026-08-01" }),
        }),
      }),
    })]);
    expect(await db.select().from(expense).where(and(
      eq(expense.orgId, orgA), eq(expense.category, "treasurer_comp_payout"), eq(expense.status, "paid"),
    ))).toEqual([]);
  });

  it("prevents the US-050 cron from paying again when the concurrent manual payout wins the lock", async () => {
    await withTenantTransaction(orgA, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(groupConfig).where(eq(groupConfig.orgId, orgA));
    });
    await seedConfig(orgA, { month: 1, day: 1 }, {
      treasurerCompensation: {
        kind: "fixed_periodic", amount: "10.0000", currency: "USD",
        period: "monthly", nextDueOn: "2026-07-01",
      },
    });
    await seedCollection({
      orgId: orgA, memberId: treasurerA, accountId: accountA,
      kind: "treasurer_recognition", status: "closed", amount: "10.0000", year: 2026,
    });

    let releaseManual!: () => void;
    const manualMayContinue = new Promise<void>((resolve) => { releaseManual = resolve; });
    let reportManualLocked!: () => void;
    const manualLocked = new Promise<void>((resolve) => { reportManualLocked = resolve; });
    let reportCronAtLock!: () => void;
    const cronAtLock = new Promise<void>((resolve) => { reportCronAtLock = resolve; });
    const manual = createTreasurerCompensationService({
      now: () => now,
      afterMoneyLock: async (lockedOrgId) => {
        if (lockedOrgId !== orgA) return;
        reportManualLocked();
        await manualMayContinue;
      },
    });
    const cron = createCompensationService({
      now: () => now,
      beforeMoneyLock: (lockedOrgId) => {
        if (lockedOrgId === orgA) reportCronAtLock();
      },
    });
    const clientRequestId = randomUUID();
    const manualResult = manual.recordPayout({
      orgId: orgA, actorId: treasurerA, fiscalYear: 2026, accountId: accountA,
      amount: "10.0000", datedOn: "2026-07-21", clientRequestId,
    });
    await manualLocked;
    const cronResult = cron.awardDueTreasurerCompensation("2026-07-21");
    await cronAtLock;
    releaseManual();
    await expect(manualResult).resolves.toMatchObject({ clientRequestId, amount: "10.0000" });
    await expect(cronResult).resolves.toMatchObject({
      disbursementsAwarded: 0,
      disbursementsAccruedWithoutCash: 1,
      configsAdvanced: 1,
      failures: [],
    });
    expect(await db.select().from(withdrawal).where(and(
      eq(withdrawal.orgId, orgA), eq(withdrawal.kind, "treasurer_compensation_disbursement"),
    ))).toEqual([]);
    expect(await db.select().from(expense).where(and(
      eq(expense.orgId, orgA), eq(expense.category, "treasurer_comp_payout"), eq(expense.status, "paid"),
    ))).toHaveLength(1);
    expect(await db.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, orgA),
      eq(auditLogEntry.actionKind, "treasurer_compensation.cash_suppressed"),
    ))).toEqual([expect.objectContaining({
      reason: "shared_entitlement_already_paid",
      payloadSnapshot: expect.objectContaining({
        scheduledAmount: "10.0000",
        cashPaid: "0.0000",
        breakdown: {
          cumulativeEntitlement: "10.0000",
          cumulativePaid: "10.0000",
          payableNow: "0.0000",
        },
      }),
    })]);
    const suppressedAlerts = await db.select().from(alert).where(and(
      eq(alert.orgId, orgA), eq(alert.alertKind, "treasurer_compensation_cash_suppressed"),
    ));
    expect(suppressedAlerts).toEqual([expect.objectContaining({
      payload: expect.objectContaining({
        cashPaid: "0.0000",
        message: expect.stringContaining("no se acreditó otro pago"),
      }),
    })]);
    expect(suppressedAlerts[0]?.payload).not.toEqual(expect.objectContaining({
      message: expect.stringContaining("acreditada — USD"),
    }));
  });

  it("rejects foreign accounts and rolls the payout back when its audit cannot be written", async () => {
    await seedAccrual({ orgId: orgA, memberId: treasurerA, periodLabel: "2026", amount: "10.0000" });
    const service = createTreasurerCompensationService({ now: () => now });
    await expect(service.recordPayout({
      orgId: orgA, actorId: treasurerA, fiscalYear: 2026, accountId: accountB,
      amount: "1.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    })).rejects.toThrow("compensation_account_unavailable");

    await db.execute(sql.raw(`
      CREATE FUNCTION ${auditFunction}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action_kind = 'treasurer_compensation.paid' THEN RAISE EXCEPTION 'forced compensation audit failure'; END IF;
        RETURN NEW;
      END $$
    `));
    await db.execute(sql.raw(`
      CREATE TRIGGER ${auditTrigger} BEFORE INSERT ON audit_log_entry
      FOR EACH ROW EXECUTE FUNCTION ${auditFunction}()
    `));
    const clientRequestId = randomUUID();
    await expect(service.recordPayout({
      orgId: orgA, actorId: treasurerA, fiscalYear: 2026, accountId: accountA,
      amount: "10.0000", datedOn: "2026-07-21", clientRequestId,
    })).rejects.toThrow("forced compensation audit failure");
    expect(await db.select().from(expense).where(and(
      eq(expense.orgId, orgA), eq(expense.clientRequestId, clientRequestId),
    ))).toEqual([]);
  });
});
