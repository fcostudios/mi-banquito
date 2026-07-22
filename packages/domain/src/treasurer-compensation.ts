import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  account,
  auditLogEntry,
  expense,
  extraordinaryCollection,
  extraordinaryCollectionLine,
  groupConfig,
  member,
  treasurerCompensationDisbursement,
  withdrawal,
} from "@mi-banquito/db/schema";
import {
  lockTenantMoneyWrites,
  withTenantTransaction,
  withWritableTenantTransaction,
} from "@mi-banquito/db/tenant";
import { formatMoney4Units, parseMoney4Units, parsePositiveMoney4 } from "./money4";

export type CompensationBreakdown = {
  cumulativeEntitlement: string;
  cumulativePaid: string;
  payableNow: string;
};

export type CompensationYear = {
  fiscalYear: number;
  accrued: string;
  recognition: string;
};

export class CompensationCeilingExceededError extends Error {
  readonly code = "compensation_ceiling_exceeded";

  constructor(readonly figures: CompensationBreakdown) {
    super("compensation_ceiling_exceeded");
    this.name = "CompensationCeilingExceededError";
  }
}

export class CompensationProjectionIntegrityError extends Error {
  readonly code = "compensation_paid_projection_integrity";

  constructor() {
    super("compensation_paid_projection_integrity");
    this.name = "CompensationProjectionIntegrityError";
  }
}

export interface TreasurerCompensationService {
  getBreakdown(input: { orgId: string; fiscalYear: number }): Promise<CompensationBreakdown>;
  recordPayout(input: {
    orgId: string;
    actorId: string;
    fiscalYear: number;
    accountId: string;
    amount: string;
    datedOn: string;
    notes?: string | null;
    clientRequestId: string;
  }): Promise<typeof expense.$inferSelect>;
}

export function compensationBreakdown(input: {
  years: CompensationYear[];
  cronPaid: string;
  manualPaid: string;
}): CompensationBreakdown {
  const cumulativeEntitlementUnits = input.years.reduce((sum, year) => {
    const accrued = parseMoney4Units(year.accrued);
    const recognition = parseMoney4Units(year.recognition);
    if (accrued < BigInt(0) || recognition < BigInt(0)) throw new Error("compensation_amount_non_negative_required");
    return sum + (accrued > recognition ? accrued : recognition);
  }, BigInt(0));
  const cumulativePaidUnits = parseMoney4Units(input.cronPaid) + parseMoney4Units(input.manualPaid);
  if (cumulativePaidUnits < BigInt(0)) throw new Error("compensation_paid_non_negative_required");
  const payableUnits = cumulativeEntitlementUnits > cumulativePaidUnits
    ? cumulativeEntitlementUnits - cumulativePaidUnits
    : BigInt(0);

  return {
    cumulativeEntitlement: formatMoney4Units(cumulativeEntitlementUnits),
    cumulativePaid: formatMoney4Units(cumulativePaidUnits),
    payableNow: formatMoney4Units(payableUnits),
  };
}

type CompensationTransaction = Parameters<Parameters<typeof withTenantTransaction>[1]>[0];
export type FiscalBoundary = { startMonth: number; startDay: number };

function assertFiscalYear(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1900 || value > 9999) {
    throw new Error("compensation_fiscal_year_invalid");
  }
  return value;
}

function assertDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("compensation_date_invalid");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("compensation_date_invalid");
  }
  return value;
}

function fiscalYearForDateOnly(value: string, boundary: FiscalBoundary): number {
  assertDateOnly(value);
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return month > boundary.startMonth || (month === boundary.startMonth && day >= boundary.startDay)
    ? year
    : year - 1;
}

/** Uses producer-preserved due-on metadata; legacy labels are accepted only where
 * the configured boundary makes every possible date represented by the label land
 * in the same fiscal year. Ambiguous legacy data fails closed. */
export function fiscalYearForCompensationPeriod(
  input: { periodLabel: string; kindAtDisbursement: unknown },
  boundary: FiscalBoundary,
): number {
  const yearly = /^(\d{4})$/.exec(input.periodLabel);
  const monthly = /^(\d{4})-(\d{2})$/.exec(input.periodLabel);
  if (!yearly && !monthly) throw new Error("compensation_period_label_invalid");
  const metadata = typeof input.kindAtDisbursement === "object"
    && input.kindAtDisbursement !== null
    && !Array.isArray(input.kindAtDisbursement)
    ? input.kindAtDisbursement as Record<string, unknown>
    : {};
  const dueOn = typeof metadata.nextDueOn === "string"
    ? metadata.nextDueOn
    : typeof metadata.next_due_on === "string" ? metadata.next_due_on : null;
  const period = metadata.period;
  if (dueOn !== null) {
    assertDateOnly(dueOn);
    const inferredPeriod = monthly ? "monthly" : "yearly";
    if ((period !== undefined && period !== inferredPeriod)
      || (monthly && dueOn.slice(0, 7) !== input.periodLabel)
      || (yearly && dueOn.slice(0, 4) !== input.periodLabel)) {
      throw new Error("compensation_period_metadata_mismatch");
    }
    return fiscalYearForDateOnly(dueOn, boundary);
  }

  if (yearly) {
    if (boundary.startMonth !== 1 || boundary.startDay !== 1) {
      throw new Error("compensation_period_attribution_ambiguous");
    }
    return assertFiscalYear(Number(yearly[1]));
  }
  if (!monthly) throw new Error("compensation_period_label_invalid");
  const year = assertFiscalYear(Number(monthly[1]));
  const month = Number(monthly[2]);
  if (month < 1 || month > 12) throw new Error("compensation_period_label_invalid");
  if (month === boundary.startMonth && boundary.startDay !== 1) {
    throw new Error("compensation_period_attribution_ambiguous");
  }
  return month >= boundary.startMonth ? year : year - 1;
}

function normalizedNotes(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function addToYear(target: Map<number, bigint>, fiscalYear: number, units: bigint): void {
  target.set(fiscalYear, (target.get(fiscalYear) ?? BigInt(0)) + units);
}

function projectionIntegrityFailure(): never {
  throw new CompensationProjectionIntegrityError();
}

async function loadCurrentBoundary(
  tx: CompensationTransaction,
  orgId: string,
): Promise<{ boundary: FiscalBoundary; currencyCode: string }> {
  const [config] = await tx.select().from(groupConfig).where(and(
    eq(groupConfig.orgId, orgId),
    isNull(groupConfig.validTo),
  )).orderBy(desc(groupConfig.version)).limit(1);
  if (!config) throw new Error("compensation_group_config_required");
  return {
    boundary: {
      startMonth: config.fiscalYearStartMonth,
      startDay: config.fiscalYearStartDay,
    },
    currencyCode: config.currencyCode,
  };
}

export async function computeTreasurerCompensationBreakdownInTransaction(
  tx: CompensationTransaction,
  input: { orgId: string; fiscalYear: number },
  resolvedConfig?: { boundary: FiscalBoundary; currencyCode: string },
): Promise<{ breakdown: CompensationBreakdown; currencyCode: string }> {
  const selectedFiscalYear = assertFiscalYear(input.fiscalYear);
  const { boundary, currencyCode } = resolvedConfig ?? await loadCurrentBoundary(tx, input.orgId);

  const accrualByYear = new Map<number, bigint>();
  const recognitionByYear = new Map<number, bigint>();
  const accrualRows = await tx.select().from(treasurerCompensationDisbursement).where(
    eq(treasurerCompensationDisbursement.orgId, input.orgId),
  );
  const withdrawalPeriodById = new Map<string, number>();
  for (const row of accrualRows) {
    const fiscalYear = fiscalYearForCompensationPeriod({
      periodLabel: row.periodLabel,
      kindAtDisbursement: row.kindAtDisbursement,
    }, boundary);
    if (fiscalYear <= selectedFiscalYear) {
      addToYear(accrualByYear, fiscalYear, parseMoney4Units(String(row.amount)));
    }
    if (row.withdrawalId) {
      if (withdrawalPeriodById.has(row.withdrawalId)) projectionIntegrityFailure();
      withdrawalPeriodById.set(row.withdrawalId, fiscalYear);
    }
  }

  const collectionRows = await tx.select().from(extraordinaryCollection).where(and(
    eq(extraordinaryCollection.orgId, input.orgId),
    eq(extraordinaryCollection.kind, "treasurer_recognition"),
    eq(extraordinaryCollection.status, "closed"),
  ));
  if (collectionRows.length > 0) {
    const collectionIds = new Set(collectionRows.map((row) => row.id));
    const lineRows = await tx.select().from(extraordinaryCollectionLine).where(and(
      eq(extraordinaryCollectionLine.orgId, input.orgId),
      inArray(extraordinaryCollectionLine.collectionId, [...collectionIds]),
      eq(extraordinaryCollectionLine.reconciliationStatus, "regularized"),
    ));
    const amountByCollection = new Map<string, bigint>();
    for (const line of lineRows) {
      const signed = line.reversesId === null
        ? parseMoney4Units(String(line.amount))
        : -parseMoney4Units(String(line.amount));
      amountByCollection.set(line.collectionId, (amountByCollection.get(line.collectionId) ?? BigInt(0)) + signed);
    }
    for (const collection of collectionRows) {
      const fiscalYear = collection.recognitionFiscalYear;
      if (fiscalYear === null) throw new Error("compensation_recognition_year_required");
      if (fiscalYear <= selectedFiscalYear) {
        addToYear(recognitionByYear, fiscalYear, amountByCollection.get(collection.id) ?? BigInt(0));
      }
    }
  }

  let cronPaidUnits = BigInt(0);
  const withdrawalRows = await tx.select().from(withdrawal).where(eq(withdrawal.orgId, input.orgId));
  const withdrawalById = new Map(withdrawalRows.map((row) => [row.id, row]));
  for (const accrual of accrualRows) {
    if (!accrual.withdrawalId) continue;
    const paid = withdrawalById.get(accrual.withdrawalId);
    if (
      !paid
      || paid.reversesId !== null
      || paid.kind !== "treasurer_compensation_disbursement"
      || paid.memberId !== accrual.memberId
      || paid.currencyCode !== accrual.currencyCode
      || parseMoney4Units(String(paid.amount)) > parseMoney4Units(String(accrual.amount))
    ) projectionIntegrityFailure();
  }
  const withdrawalReversalCount = new Map<string, number>();
  for (const row of withdrawalRows) {
    if (row.reversesId === null) continue;
    const original = withdrawalById.get(row.reversesId);
    const touchesCompensation = row.kind === "treasurer_compensation_disbursement"
      || original?.kind === "treasurer_compensation_disbursement";
    if (!touchesCompensation) continue;
    if (
      !original
      || original.reversesId !== null
      || original.kind !== "treasurer_compensation_disbursement"
      || row.kind !== original.kind
      || String(row.amount) !== String(original.amount)
      || row.currencyCode !== original.currencyCode
      || row.memberId !== original.memberId
      || String(row.datedOn) < String(original.datedOn)
      || !row.reverseReason?.trim()
    ) projectionIntegrityFailure();
    const count = (withdrawalReversalCount.get(original.id) ?? 0) + 1;
    if (count > 1) projectionIntegrityFailure();
    withdrawalReversalCount.set(original.id, count);
  }
  for (const row of withdrawalRows) {
    const originalId = row.reversesId ?? row.id;
    const original = withdrawalById.get(originalId);
    if (original?.kind !== "treasurer_compensation_disbursement") continue;
    const fiscalYear = withdrawalPeriodById.get(originalId);
    if (fiscalYear === undefined) projectionIntegrityFailure();
    if (fiscalYear <= selectedFiscalYear) {
      const amount = parseMoney4Units(String(row.amount));
      cronPaidUnits += row.reversesId === null ? amount : -amount;
    }
  }

  let manualPaidUnits = BigInt(0);
  const expenseRows = await tx.select().from(expense).where(eq(expense.orgId, input.orgId));
  const expenseById = new Map(expenseRows.map((row) => [row.id, row]));
  const expenseReversalCount = new Map<string, number>();
  for (const row of expenseRows) {
    if (row.reversesId === null) continue;
    const original = expenseById.get(row.reversesId);
    const touchesCompensation = row.category === "treasurer_comp_payout"
      || original?.category === "treasurer_comp_payout";
    if (!touchesCompensation) continue;
    if (row.status === "planned" && original?.status === "planned") continue;
    if (
      !original
      || original.reversesId !== null
      || original.category !== "treasurer_comp_payout"
      || original.status !== "paid"
      || row.category !== original.category
      || row.status !== "paid"
      || String(row.amount) !== String(original.amount)
      || row.currencyCode !== original.currencyCode
      || row.beneficiaryMemberId !== original.beneficiaryMemberId
      || row.accountId !== original.accountId
      || String(row.incurredOn) < String(original.incurredOn)
      || !row.reverseReason?.trim()
    ) projectionIntegrityFailure();
    const count = (expenseReversalCount.get(original.id) ?? 0) + 1;
    if (count > 1) projectionIntegrityFailure();
    expenseReversalCount.set(original.id, count);
  }
  const manualRows = expenseRows.filter((row) =>
    row.category === "treasurer_comp_payout" && row.status === "paid");
  for (const row of manualRows) {
    if (row.reversesId !== null && !expenseById.has(row.reversesId)) projectionIntegrityFailure();
    if (fiscalYearForDateOnly(String(row.incurredOn), boundary) <= selectedFiscalYear) {
      const amount = parseMoney4Units(String(row.amount));
      manualPaidUnits += row.reversesId === null ? amount : -amount;
    }
  }
  if (cronPaidUnits < BigInt(0) || manualPaidUnits < BigInt(0)) {
    throw new Error("compensation_paid_projection_invalid");
  }

  const years = [...new Set([...accrualByYear.keys(), ...recognitionByYear.keys()])]
    .filter((year) => year <= selectedFiscalYear)
    .sort((left, right) => left - right)
    .map((fiscalYear) => ({
      fiscalYear,
      accrued: formatMoney4Units(accrualByYear.get(fiscalYear) ?? BigInt(0)),
      recognition: formatMoney4Units(recognitionByYear.get(fiscalYear) ?? BigInt(0)),
    }));
  return {
    breakdown: compensationBreakdown({
      years,
      cronPaid: formatMoney4Units(cronPaidUnits),
      manualPaid: formatMoney4Units(manualPaidUnits),
    }),
    currencyCode,
  };
}

export function createTreasurerCompensationService(
  options: {
    now?: () => Date;
    beforeMoneyLock?: (orgId: string) => void | Promise<void>;
    afterMoneyLock?: (orgId: string) => void | Promise<void>;
  } = {},
): TreasurerCompensationService {
  const now = options.now ?? (() => new Date());
  return {
    getBreakdown(input) {
      return withTenantTransaction(input.orgId, async (tx) =>
        (await computeTreasurerCompensationBreakdownInTransaction(tx, input)).breakdown);
    },

    async recordPayout(input) {
      const fiscalYear = assertFiscalYear(input.fiscalYear);
      const amount = parsePositiveMoney4(input.amount);
      const datedOn = assertDateOnly(input.datedOn);
      const notes = normalizedNotes(input.notes);
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        await options.beforeMoneyLock?.(input.orgId);
        await lockTenantMoneyWrites(tx, input.orgId);
        await options.afterMoneyLock?.(input.orgId);

        const assertEquivalentReplay = async (row: typeof expense.$inferSelect) => {
          const [audit] = await tx.select().from(auditLogEntry).where(and(
            eq(auditLogEntry.orgId, input.orgId),
            eq(auditLogEntry.actionKind, "treasurer_compensation.paid"),
            eq(auditLogEntry.subjectId, row.id),
          )).limit(1);
          const snapshot = audit?.payloadSnapshot as Record<string, unknown> | undefined;
          if (
            !audit
            || audit.orgId !== input.orgId
            || audit.actorKind !== "member"
            || audit.actorId !== input.actorId
            || audit.actionKind !== "treasurer_compensation.paid"
            || audit.subjectKind !== "expense"
            || audit.subjectId !== row.id
            || audit.reason !== notes
            || audit.at.getTime() !== row.recordedAt.getTime()
            || audit.createdAt.getTime() !== row.createdAt.getTime()
            || row.orgId !== input.orgId
            || row.clientRequestId !== input.clientRequestId
            || row.createdBy !== input.actorId
            || row.accountId !== input.accountId
            || row.category !== "treasurer_comp_payout"
            || row.purpose !== "pago a tesorera"
            || row.beneficiaryMemberId !== input.actorId
            || row.beneficiaryText !== null
            || String(row.amount) !== amount
            || String(row.incurredOn) !== datedOn
            || row.notes !== notes
            || row.status !== "paid"
            || row.reversesId !== null
            || row.reverseReason !== null
            || row.adjustmentCycleId !== null
            || row.slipPhotoId !== null
            || row.createdByKind !== "member"
            || snapshot?.orgId !== input.orgId
            || snapshot?.expenseId !== row.id
            || snapshot?.fiscalYear !== fiscalYear
            || snapshot?.clientRequestId !== input.clientRequestId
            || snapshot?.accountId !== input.accountId
            || snapshot?.beneficiaryMemberId !== input.actorId
            || snapshot?.beneficiaryText !== null
            || snapshot?.amount !== amount
            || snapshot?.currencyCode !== row.currencyCode
            || snapshot?.datedOn !== datedOn
            || snapshot?.notes !== notes
            || snapshot?.purpose !== "pago a tesorera"
            || snapshot?.category !== "treasurer_comp_payout"
            || snapshot?.status !== "paid"
            || snapshot?.reversesId !== null
            || snapshot?.reverseReason !== null
            || snapshot?.adjustmentCycleId !== null
            || snapshot?.slipPhotoId !== null
            || snapshot?.createdBy !== input.actorId
            || snapshot?.createdByKind !== "member"
            || snapshot?.recordedAt !== row.recordedAt.toISOString()
            || snapshot?.createdAt !== row.createdAt.toISOString()
          ) {
            throw new Error("compensation_idempotency_conflict");
          }
          return row;
        };
        const [replayed] = await tx.select().from(expense).where(and(
          eq(expense.orgId, input.orgId),
          eq(expense.clientRequestId, input.clientRequestId),
        )).limit(1);
        if (replayed) return assertEquivalentReplay(replayed);

        const { boundary } = await loadCurrentBoundary(tx, input.orgId);
        if (fiscalYearForDateOnly(datedOn, boundary) !== fiscalYear) {
          throw new Error("compensation_payout_fiscal_year_mismatch");
        }
        const [treasurer] = await tx.select().from(member).where(and(
          eq(member.orgId, input.orgId),
          eq(member.id, input.actorId),
          eq(member.role, "tesorera"),
          eq(member.status, "activo"),
        )).for("update").limit(1);
        if (!treasurer) throw new Error("compensation_actor_not_active_treasurer");
        const [selectedAccount] = await tx.select().from(account).where(and(
          eq(account.orgId, input.orgId),
          eq(account.id, input.accountId),
          eq(account.status, "active"),
          eq(account.isGroupFund, true),
        )).for("update").limit(1);
        if (!selectedAccount) throw new Error("compensation_account_unavailable");

        const { breakdown, currencyCode } = await computeTreasurerCompensationBreakdownInTransaction(
          tx,
          { orgId: input.orgId, fiscalYear },
        );
        if (parseMoney4Units(amount) > parseMoney4Units(breakdown.payableNow)) {
          throw new CompensationCeilingExceededError(breakdown);
        }
        const timestamp = now();
        const [saved] = await tx.insert(expense).values({
          id: randomUUID(),
          orgId: input.orgId,
          purpose: "pago a tesorera",
          notes,
          amount,
          currencyCode,
          beneficiaryMemberId: treasurer.id,
          beneficiaryText: null,
          incurredOn: datedOn,
          status: "paid",
          recordedAt: timestamp,
          reversesId: null,
          reverseReason: null,
          adjustmentCycleId: null,
          accountId: selectedAccount.id,
          category: "treasurer_comp_payout",
          clientRequestId: input.clientRequestId,
          slipPhotoId: null,
          createdAt: timestamp,
          createdBy: input.actorId,
          createdByKind: "member",
        }).returning();
        if (!saved) throw new Error("compensation_payout_not_saved");
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "treasurer_compensation.paid",
          subjectKind: "expense",
          subjectId: saved.id,
          payloadSnapshot: {
            orgId: input.orgId,
            expenseId: saved.id,
            fiscalYear,
            accountId: selectedAccount.id,
            beneficiaryMemberId: treasurer.id,
            beneficiaryText: null,
            amount,
            currencyCode,
            datedOn,
            notes,
            clientRequestId: input.clientRequestId,
            purpose: "pago a tesorera",
            category: "treasurer_comp_payout",
            status: "paid",
            reversesId: null,
            reverseReason: null,
            adjustmentCycleId: null,
            slipPhotoId: null,
            createdBy: input.actorId,
            createdByKind: "member",
            recordedAt: timestamp.toISOString(),
            createdAt: timestamp.toISOString(),
            ceilingBeforePayout: breakdown,
          },
          reason: notes,
          at: timestamp,
          createdAt: timestamp,
        });
        return saved;
      });
    },
  };
}
