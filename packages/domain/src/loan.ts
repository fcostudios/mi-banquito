export { evaluateLoanEligibility, resolveOriginationRate } from "./loans/eligibility";
export { calculateInterestFirstSplit } from "./loans/repayment";
export { generateReferralCommissionCredit } from "./loans/referral";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import { withWritableTenantTransaction } from "@mi-banquito/db/tenant";
import {
  alert,
  auditLogEntry,
  availableCapital,
  contribution,
  groupConfig,
  interestAccrual,
  loan,
  loanDisbursement,
  loanFee,
  loanGuarantor,
  loanReferral,
  loanSchedule,
  member,
  nonMemberBorrower,
  repayment,
  withdrawal,
} from "@mi-banquito/db/schema";
import { calculateInterestFirstSplit, calculateNextInstallmentSplit } from "./loans/repayment";
import { evaluateLoanEligibility, resolveOriginationRate } from "./loans/eligibility";
import { calculateDailyInterestAmount, calculatePrincipalBasisOn } from "./loans/accrual";
import type {
  LoanDisbursementSource,
  OriginateLoanInput,
  OriginateLoanResult,
  LoanDetailRow,
  LoanListRow,
  LoanSupportMember,
  RecordRepaymentInput,
  RecordRepaymentResult,
} from "./loans/types";
import { generateDecliningBalanceSchedule } from "./rules/loans/declining-balance";
import { type AuditWriter, writeWithAudit } from "./audit";
export type {
  BorrowerKind,
  EligibilityResult,
  LoanDisbursementSource,
  LoanDetailRow,
  LoanListRow,
  LoanSupportMember,
  OriginateLoanInput,
  OriginateLoanResult,
  RecordRepaymentInput,
  RecordRepaymentResult,
  ReferralCommissionPlan,
  RepaymentSplitResult,
} from "./loans/types";

export interface LoanService {
  readonly context: "loan";
  listEligibleGuarantorMembers(orgId: string): Promise<LoanSupportMember[]>;
  listLoans(orgId: string): Promise<LoanListRow[]>;
  getLoanDetail(orgId: string, loanId: string): Promise<LoanDetailRow | undefined>;
  originateLoan(input: OriginateLoanInput): Promise<OriginateLoanResult>;
  recordRepayment(input: RecordRepaymentInput): Promise<RecordRepaymentResult>;
}

export type LoanAuditEntry = typeof auditLogEntry.$inferInsert;
export type LoanAuditTx = {
  insert(table: typeof auditLogEntry): {
    values(values: LoanAuditEntry): unknown;
  };
};
export type LoanAuditWriter = AuditWriter<LoanAuditEntry, LoanAuditTx>;

export interface LoanServiceOptions {
  auditWriter?: LoanAuditWriter;
}

type GroupConfigJson = Record<string, unknown>;

const ACTOR_KIND = "member";
const money4 = (value: string | number): string => Number(value).toFixed(4);
const ACTIVE_LOAN_STATUSES = new Set(["originated", "activo", "en_mora"]);

const defaultAuditWriter: LoanAuditWriter = async ({ tx, entry }) => {
  await tx.insert(auditLogEntry).values(entry);
};

const normalizeNullableText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const configValue = (config: unknown, key: string, fallback: string): string => {
  if (!config || typeof config !== "object") {
    return fallback;
  }
  const value = (config as GroupConfigJson)[key];
  if (typeof value === "number") {
    return money4(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return fallback;
};

const addMonths = (dateOnly: string, months: number): string => {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
};

const requireActiveMember = async (orgId: string, memberId: string, label: string) => {
  const [row] = await db.select().from(member)
    .where(and(eq(member.orgId, orgId), eq(member.id, memberId), eq(member.status, "activo")));
  if (!row) {
    throw new Error(`${label} must be an active member in the active org`);
  }
  return row;
};

const sumMoney = (rows: Array<Record<string, unknown>>, key: string): string => money4(
  rows.reduce((total, row) => total + Number(row[key] ?? 0), 0),
);

const memberNetContributions = async (orgId: string, memberId: string): Promise<string> => {
  const rows = await db.select().from(contribution)
    .where(and(eq(contribution.orgId, orgId), eq(contribution.memberId, memberId)));
  return sumMoney(rows as Array<Record<string, unknown>>, "amount");
};

const memberNetWithdrawals = async (orgId: string, memberId: string): Promise<string> => {
  const rows = await db.select().from(withdrawal)
    .where(and(eq(withdrawal.orgId, orgId), eq(withdrawal.memberId, memberId)));
  return sumMoney(rows as Array<Record<string, unknown>>, "amount");
};

const memberAccumulatedSavings = async (
  orgId: string,
  memberRow: typeof member.$inferSelect,
): Promise<string> => money4(
  Number(memberRow.initialSavingsBalance)
    + Number(await memberNetContributions(orgId, memberRow.id))
    - Number(await memberNetWithdrawals(orgId, memberRow.id)),
);

const savingsAfterExposureForCap = (
  savingsBalance: string,
  loanToSavingsCapRatio: string,
  activeExposure: string,
): string => {
  const ratio = Number(loanToSavingsCapRatio);
  if (ratio <= 0) {
    return "0.0000";
  }
  const remainingCapacity = Math.max(0, Number(savingsBalance) * ratio - Number(activeExposure));
  return money4(remainingCapacity / ratio);
};

const memberBorrowerExposure = async (orgId: string, memberId: string): Promise<string> => {
  const rows = await db.select().from(loan)
    .where(and(eq(loan.orgId, orgId), eq(loan.borrowerMemberId, memberId)));
  return sumMoney(
    rows.filter((row) => ACTIVE_LOAN_STATUSES.has(String(row.status))) as Array<Record<string, unknown>>,
    "principalAmount",
  );
};

const guarantorExposure = async (orgId: string, memberId: string): Promise<string> => {
  const rows = await db.select().from(loanGuarantor)
    .where(and(
      eq(loanGuarantor.orgId, orgId),
      eq(loanGuarantor.guarantorMemberId, memberId),
      isNull(loanGuarantor.releasedAt),
    ));
  return sumMoney(rows as Array<Record<string, unknown>>, "liabilityAmount");
};

const memberActiveExposure = async (orgId: string, memberId: string): Promise<string> => money4(
  Number(await memberBorrowerExposure(orgId, memberId)) + Number(await guarantorExposure(orgId, memberId)),
);

const openLoanStatuses = new Set(["originated", "activo", "en_mora"]);

const refreshLoanReadModels = async (tx: unknown) => {
  if (
    tx
    && typeof tx === "object"
    && "execute" in tx
    && typeof tx.execute === "function"
  ) {
    await tx.execute(sql`
      SELECT refresh_sprint1_read_models()
    `);
  }
};

const scheduledInterestDueOn = (
  rows: Array<typeof loanSchedule.$inferSelect>,
  datedOn: string,
): string => money4(
  rows
    .filter((row) => row.dueOn <= datedOn)
    .reduce((total, row) => total + Number(row.interestDue), 0),
);

const feeDueForSchedule = (
  row: typeof loanSchedule.$inferSelect,
  feeRows: Array<typeof loanFee.$inferSelect>,
): string => money4(
  feeRows
    .filter((fee) => fee.loanScheduleId === row.id || (!fee.loanScheduleId && fee.datedOn === row.dueOn))
    .reduce((total, fee) => total + Number(fee.amount), 0),
);

const feePaidBySchedule = (
  rows: Array<typeof loanSchedule.$inferSelect>,
  feeRows: Array<typeof loanFee.$inferSelect>,
  paidFee: string,
): Map<string, string> => {
  let remainingFeePaid = Number(paidFee);
  const result = new Map<string, string>();
  for (const row of [...rows].sort((left, right) => left.periodIndex - right.periodIndex)) {
    const feeDue = Number(feeDueForSchedule(row, feeRows));
    const applied = Math.min(feeDue, remainingFeePaid);
    remainingFeePaid -= applied;
    result.set(row.id, money4(applied));
  }
  return result;
};

const feePaidByFeeId = (
  feeRows: Array<typeof loanFee.$inferSelect>,
  paidFee: string,
): Map<string, string> => {
  let remainingFeePaid = Number(paidFee);
  const result = new Map<string, string>();
  for (const fee of [...feeRows].sort((left, right) =>
    left.datedOn.localeCompare(right.datedOn) || left.id.localeCompare(right.id),
  )) {
    const applied = Math.min(Number(fee.amount), remainingFeePaid);
    remainingFeePaid -= applied;
    result.set(fee.id, money4(applied));
  }
  return result;
};

const scheduledRowsForRepayment = (
  rows: Array<typeof loanSchedule.$inferSelect>,
  feeRows: Array<typeof loanFee.$inferSelect>,
  paidFee: string,
) => {
  const paidFeeBySchedule = feePaidBySchedule(rows, feeRows, paidFee);
  return [...rows].sort((left, right) => left.periodIndex - right.periodIndex).map((row) => ({
    principalDue: money4(row.principalDue),
    interestDue: money4(row.interestDue),
    feeDue: feeDueForSchedule(row, feeRows),
    paidPrincipalToDate: money4(row.paidPrincipalToDate),
    paidInterestToDate: money4(row.paidInterestToDate),
    paidFeeToDate: paidFeeBySchedule.get(row.id) ?? "0.0000",
  }));
};

const allocateRepaymentToSchedule = (
  rows: Array<typeof loanSchedule.$inferSelect>,
  feeRows: Array<typeof loanFee.$inferSelect>,
  priorPaidFee: string,
  split: { appliedToFee?: string; appliedToInterest: string; appliedToPrincipal: string },
): Array<{
  row: typeof loanSchedule.$inferSelect;
  paidInterestToDate: string;
  paidPrincipalToDate: string;
  status: typeof loanSchedule.$inferSelect.status;
}> => {
  const priorFeePaidBySchedule = feePaidBySchedule(rows, feeRows, priorPaidFee);
  let remainingFee = Number(split.appliedToFee ?? 0);
  let remainingInterest = Number(split.appliedToInterest);
  let remainingPrincipal = Number(split.appliedToPrincipal);
  return [...rows].sort((left, right) => left.periodIndex - right.periodIndex).map((row) => {
    const feeRoom = Math.max(0, Number(feeDueForSchedule(row, feeRows)) - Number(priorFeePaidBySchedule.get(row.id) ?? 0));
    const interestRoom = Math.max(0, Number(row.interestDue) - Number(row.paidInterestToDate));
    const principalRoom = Math.max(0, Number(row.principalDue) - Number(row.paidPrincipalToDate));
    const feeApplied = Math.min(feeRoom, remainingFee);
    remainingFee -= feeApplied;
    const interestApplied = Math.min(interestRoom, remainingInterest);
    remainingInterest -= interestApplied;
    const principalApplied = Math.min(principalRoom, remainingPrincipal);
    remainingPrincipal -= principalApplied;
    const paidInterestToDate = money4(Number(row.paidInterestToDate) + interestApplied);
    const paidPrincipalToDate = money4(Number(row.paidPrincipalToDate) + principalApplied);
    const paidFeeToDate = money4(Number(priorFeePaidBySchedule.get(row.id) ?? 0) + feeApplied);
    const fullyPaid = Number(paidInterestToDate) >= Number(row.interestDue)
      && Number(paidPrincipalToDate) >= Number(row.principalDue)
      && Number(paidFeeToDate) >= Number(feeDueForSchedule(row, feeRows));
    const partiallyPaid = Number(paidInterestToDate) > 0 || Number(paidPrincipalToDate) > 0 || Number(paidFeeToDate) > 0;
    return {
      row,
      paidInterestToDate,
      paidPrincipalToDate,
      status: fullyPaid ? "pagado" : partiallyPaid ? "parcial" : row.status,
    };
  });
};

const payerMemberIdForLoan = async (orgId: string, currentLoan: typeof loan.$inferSelect): Promise<string> => {
  if (currentLoan.borrowerMemberId) {
    return currentLoan.borrowerMemberId;
  }
  const [guarantor] = await db.select().from(loanGuarantor)
    .where(and(eq(loanGuarantor.orgId, orgId), eq(loanGuarantor.loanId, currentLoan.id), isNull(loanGuarantor.releasedAt)));
  if (!guarantor) {
    throw new Error("Active guarantor is required to record a non-member repayment");
  }
  return guarantor.guarantorMemberId;
};

const resolveBorrowerName = async (orgId: string, row: typeof loan.$inferSelect): Promise<string> => {
  if (row.borrowerMemberId) {
    const [borrower] = await db.select().from(member)
      .where(and(eq(member.orgId, orgId), eq(member.id, row.borrowerMemberId)));
    return borrower?.displayName ?? "Socia";
  }
  if (row.borrowerNonMemberId) {
    const [borrower] = await db.select().from(nonMemberBorrower)
      .where(and(eq(nonMemberBorrower.orgId, orgId), eq(nonMemberBorrower.id, row.borrowerNonMemberId)));
    return borrower?.displayName ?? "No socia";
  }
  return "Prestataria";
};

export const createLoanService = (options: LoanServiceOptions = {}): LoanService => {
  const auditWriter = options.auditWriter ?? defaultAuditWriter;

  return {
  context: "loan",
  async listEligibleGuarantorMembers(orgId) {
    const [currentConfig] = await db.select().from(groupConfig)
      .where(and(eq(groupConfig.orgId, orgId), isNull(groupConfig.validTo)))
      .orderBy(desc(groupConfig.version));
    if (!currentConfig) {
      return [];
    }

    const activeMembers = await db.select().from(member)
      .where(and(eq(member.orgId, orgId), eq(member.status, "activo")));
    const membersWithCapacity = await Promise.all(activeMembers.map(async (row) => {
      const activeExposure = await memberActiveExposure(orgId, row.id);
      const savingsBalance = await memberAccumulatedSavings(orgId, row);
      const savingsBasis = savingsAfterExposureForCap(
        savingsBalance,
        currentConfig.loanToSavingsCapRatio,
        activeExposure,
      );
      return {
        id: row.id,
        displayName: row.displayName,
        remainingCapacity: Number(savingsBasis) * Number(currentConfig.loanToSavingsCapRatio),
      };
    }));

    return membersWithCapacity
      .filter((row) => row.remainingCapacity > 0)
      .map(({ id, displayName }) => ({ id, displayName }));
  },
  async listLoans(orgId) {
    const rows = await db.select().from(loan)
      .where(eq(loan.orgId, orgId))
      .orderBy(desc(loan.originatedOn));
    return Promise.all(rows.map(async (row) => ({
      id: row.id,
      borrowerName: await resolveBorrowerName(orgId, row),
      borrowerKind: row.borrowerKind,
      principalAmount: money4(row.principalAmount),
      currencyCode: row.currencyCode,
      status: row.status,
    })));
  },
  async getLoanDetail(orgId, loanId) {
    const [row] = await db.select().from(loan)
      .where(and(eq(loan.orgId, orgId), eq(loan.id, loanId)));
    if (!row) {
      return undefined;
    }
    const [scheduleRows, feeRows, repaymentRows, accrualRows, guarantorRows, referralRows] = await Promise.all([
      db.select().from(loanSchedule).where(and(eq(loanSchedule.orgId, orgId), eq(loanSchedule.loanId, loanId))),
      db.select().from(loanFee).where(and(eq(loanFee.orgId, orgId), eq(loanFee.loanId, loanId))),
      db.select().from(repayment).where(and(eq(repayment.orgId, orgId), eq(repayment.loanId, loanId))),
      db.select().from(interestAccrual).where(and(eq(interestAccrual.orgId, orgId), eq(interestAccrual.loanId, loanId))),
      db.select().from(loanGuarantor).where(and(eq(loanGuarantor.orgId, orgId), eq(loanGuarantor.loanId, loanId), isNull(loanGuarantor.releasedAt))),
      db.select().from(loanReferral).where(and(eq(loanReferral.orgId, orgId), eq(loanReferral.loanId, loanId))),
    ]);
    const [guarantorMember] = guarantorRows[0]
      ? await db.select().from(member).where(and(eq(member.orgId, orgId), eq(member.id, guarantorRows[0].guarantorMemberId)))
      : [];
    const [referrerMember] = referralRows[0]
      ? await db.select().from(member).where(and(eq(member.orgId, orgId), eq(member.id, referralRows[0].referrerMemberId)))
      : [];
    const principalRepayments = repaymentRows.map((repaymentRow) => ({
      datedOn: repaymentRow.datedOn,
      appliedToPrincipal: money4(repaymentRow.appliedToPrincipal),
    }));
    const paidFeeByFee = feePaidByFeeId(
      feeRows,
      sumMoney(repaymentRows as Array<Record<string, unknown>>, "appliedToFee"),
    );

    return {
      id: row.id,
      borrowerName: await resolveBorrowerName(orgId, row),
      borrowerKind: row.borrowerKind,
      principalAmount: money4(row.principalAmount),
      currencyCode: row.currencyCode,
      status: row.status,
      rateValue: money4(row.rateValue),
      rateModel: row.rateModel,
      termPeriods: row.termPeriods,
      originatedOn: row.originatedOn,
      guarantorName: guarantorMember?.displayName,
      referrerName: referrerMember?.displayName,
      schedule: [...scheduleRows].sort((left, right) => left.periodIndex - right.periodIndex).map((schedule) => ({
        periodIndex: schedule.periodIndex,
        dueOn: schedule.dueOn,
        principalDue: money4(schedule.principalDue),
        interestDue: money4(schedule.interestDue),
        paidPrincipalToDate: money4(schedule.paidPrincipalToDate),
        paidInterestToDate: money4(schedule.paidInterestToDate),
        status: schedule.status,
      })),
      fees: feeRows.map((fee) => ({
        feeKind: fee.feeKind,
        amount: money4(fee.amount),
        paidToDate: paidFeeByFee.get(fee.id) ?? "0.0000",
        datedOn: fee.datedOn,
        loanScheduleId: fee.loanScheduleId,
      })),
      repayments: repaymentRows.map((repaymentRow) => ({
        id: repaymentRow.id,
        amount: money4(repaymentRow.amount),
        appliedToFee: money4(repaymentRow.appliedToFee ?? 0),
        appliedToInterest: money4(repaymentRow.appliedToInterest),
        appliedToPrincipal: money4(repaymentRow.appliedToPrincipal),
        datedOn: repaymentRow.datedOn,
        reversesId: repaymentRow.reversesId,
        reverseReason: repaymentRow.reverseReason,
      })),
      accruals: accrualRows.map((accrual) => ({
        accruedOn: accrual.accruedOn,
        ...(() => {
          const principalBasis = calculatePrincipalBasisOn({
            principalAmount: money4(row.principalAmount),
            accrualDate: accrual.accruedOn,
            principalRepayments,
          });
          return {
            interestAmount: calculateDailyInterestAmount({
              principalBasis,
              rateValue: money4(accrual.rateValue ?? row.rateValue),
              periodDays: Number(accrual.periodDays ?? 30),
            }),
            principalBasis,
          };
        })(),
      })),
    };
  },
  async originateLoan(input) {
    const [existing] = await db.select().from(loan)
      .where(and(eq(loan.orgId, input.orgId), eq(loan.clientRequestId, input.clientRequestId)));
    if (existing) {
      return { loanId: existing.id };
    }

    const [currentConfig] = await db.select().from(groupConfig)
      .where(and(eq(groupConfig.orgId, input.orgId), isNull(groupConfig.validTo)))
      .orderBy(desc(groupConfig.version));
    if (!currentConfig) {
      throw new Error("Configura las reglas del grupo antes de registrar préstamos.");
    }

    const memberRateValue = money4(currentConfig.loanRateValue);
    const nonMemberRateValue = configValue(currentConfig.config, "nonMemberLoanRateValue", memberRateValue);
    const adminFeePct = configValue(currentConfig.config, "adminFeePct", "1.0000");
    const referralCommissionAmount = money4(
      configValue(currentConfig.config, "referralCommissionAmount", "0.0000"),
    );
    const rateValue = resolveOriginationRate({
      memberLoanRateValue: memberRateValue,
      nonMemberLoanRateValue: nonMemberRateValue,
    }, input.borrowerKind);
    const principalAmount = money4(input.principalAmount);
    const currencyCode = currentConfig.currencyCode || "USD";
    const disbursementSource: LoanDisbursementSource = input.disbursementSource ?? "bank_transfer";

    let borrowerMemberId: string | null = null;
    let borrowerNonMemberId: string | null = null;
    let borrowerSavingsBalance = "0.0000";
    let guarantorSavingsBalance: string | undefined;
    if (input.borrowerKind === "member") {
      if (!input.borrowerMemberId) {
        throw new Error("borrowerMemberId is required for member loans");
      }
      const borrower = await requireActiveMember(input.orgId, input.borrowerMemberId, "Borrower");
      const activeExposure = await memberActiveExposure(input.orgId, input.borrowerMemberId);
      const savingsBalance = await memberAccumulatedSavings(input.orgId, borrower);
      borrowerSavingsBalance = savingsAfterExposureForCap(
        savingsBalance,
        currentConfig.loanToSavingsCapRatio,
        activeExposure,
      );
      borrowerMemberId = input.borrowerMemberId;
    } else {
      if (!input.nonMemberDisplayName?.trim()) {
        throw new Error("nonMemberDisplayName is required for non-member loans");
      }
      if (!input.guarantorMemberId) {
        throw new Error("guarantorMemberId is required for non-member loans");
      }
      const guarantor = await requireActiveMember(input.orgId, input.guarantorMemberId, "Guarantor");
      const activeExposure = await memberActiveExposure(input.orgId, input.guarantorMemberId);
      const savingsBalance = await memberAccumulatedSavings(input.orgId, guarantor);
      guarantorSavingsBalance = savingsAfterExposureForCap(
        savingsBalance,
        currentConfig.loanToSavingsCapRatio,
        activeExposure,
      );
      borrowerNonMemberId = randomUUID();
    }

    const [capital] = await db.select().from(availableCapital)
      .where(eq(availableCapital.orgId, input.orgId));
    const eligibility = evaluateLoanEligibility({
      requestedPrincipal: principalAmount,
      availableCapital: money4(capital?.availableCapital ?? "0.0000"),
      borrowerSavingsBalance,
      loanToSavingsCapRatio: currentConfig.loanToSavingsCapRatio,
      borrowerKind: input.borrowerKind,
      guarantorSavingsBalance,
    });
    if (!eligibility.ok) {
      throw new Error(eligibility.reason);
    }

    if (input.referrerMemberId) {
      await requireActiveMember(input.orgId, input.referrerMemberId, "Referrer");
    }

    const loanId = randomUUID();
    const now = new Date();
    const schedule = generateDecliningBalanceSchedule({
      principal: Number(principalAmount),
      ratePerPeriod: Number(rateValue) / 100,
      termPeriods: input.termPeriods,
      adminFeeRate: Number(adminFeePct) / 100,
    });
    const scheduleRows = schedule.installments.map((installment) => ({
      id: randomUUID(),
      orgId: input.orgId,
      loanId,
      periodIndex: installment.periodIndex,
      dueOn: addMonths(input.originatedOn, installment.periodIndex),
      principalDue: money4(installment.principalDue),
      interestDue: money4(installment.interestDue),
      status: "pendiente" as const,
      paidPrincipalToDate: "0.0000",
      paidInterestToDate: "0.0000",
      createdAt: now,
      createdByKind: ACTOR_KIND,
    }));

    await withWritableTenantTransaction(input.orgId, async (tx) => {
      await writeWithAudit({
        write: async () => {
          if (input.borrowerKind === "non_member" && borrowerNonMemberId) {
            await tx.insert(nonMemberBorrower).values({
              id: borrowerNonMemberId,
              orgId: input.orgId,
              displayName: input.nonMemberDisplayName?.trim() ?? "",
              whatsappNumber: normalizeNullableText(input.nonMemberWhatsappNumber),
              nationalIdRedacted: input.nonMemberNationalIdLast4 ? `****${input.nonMemberNationalIdLast4}` : null,
              notes: normalizeNullableText(input.nonMemberNotes),
              createdAt: now,
              createdBy: input.actorId,
              createdByKind: ACTOR_KIND,
            });
          }

          await tx.insert(loan).values({
            id: loanId,
            orgId: input.orgId,
            memberId: borrowerMemberId,
            borrowerKind: input.borrowerKind,
            borrowerMemberId,
            borrowerNonMemberId,
            principalAmount,
            currencyCode,
            rateValue,
            rateModel: currentConfig.loanRateModel,
            termPeriods: input.termPeriods,
            gracePeriods: currentConfig.loanGracePeriods,
            originatedOn: input.originatedOn,
            status: "activo",
            purpose: normalizeNullableText(input.purpose),
            clientRequestId: input.clientRequestId,
            groupConfigVersionAtOrigination: currentConfig.version,
            referrerMemberId: input.referrerMemberId || null,
            createdAt: now,
            createdBy: input.actorId,
            createdByKind: ACTOR_KIND,
            updatedAt: null,
            updatedBy: null,
          });

          await tx.insert(loanDisbursement).values({
            orgId: input.orgId,
            loanId,
            disbursementSource,
            amount: principalAmount,
            currencyCode,
            disbursedOn: input.originatedOn,
            createdAt: now,
            createdBy: input.actorId,
            createdByKind: ACTOR_KIND,
          });

          await tx.insert(loanSchedule).values(scheduleRows);

          const firstInstallment = schedule.installments[0];
          if (firstInstallment) {
            await tx.insert(loanFee).values({
              orgId: input.orgId,
              loanId,
              loanScheduleId: scheduleRows[0]?.id ?? null,
              feeKind: "admin",
              amount: money4(firstInstallment.feeDue),
              currencyCode,
              datedOn: scheduleRows[0]?.dueOn ?? input.originatedOn,
              accruedOn: input.originatedOn,
              groupConfigVersion: currentConfig.version,
              feedsSurplus: true,
              accountId: null,
              reconciliationStatus: null,
              reversesId: null,
              reverseReason: null,
              createdAt: now,
              createdBy: input.actorId,
              createdByKind: ACTOR_KIND,
            });
          }

          if (input.borrowerKind === "non_member" && input.guarantorMemberId) {
            await tx.insert(loanGuarantor).values({
              orgId: input.orgId,
              loanId,
              guarantorMemberId: input.guarantorMemberId,
              assumedAt: now,
              releasedAt: null,
              liabilityAmount: principalAmount,
              currencyCode,
              createdAt: now,
              createdBy: input.actorId,
              createdByKind: ACTOR_KIND,
            });
          }

          if (input.referrerMemberId) {
            await tx.insert(loanReferral).values({
              orgId: input.orgId,
              loanId,
              referrerMemberId: input.referrerMemberId,
              commissionAmount: referralCommissionAmount,
              commissionCurrency: currencyCode,
              accruedAt: null,
              withdrawalId: null,
              createdAt: now,
              createdBy: input.actorId,
              createdByKind: ACTOR_KIND,
            });
          }
          await refreshLoanReadModels(tx);
        },
        audit: () => auditWriter({
          tx,
          entry: {
            orgId: input.orgId,
            actorKind: ACTOR_KIND,
            actorId: input.actorId,
            actionKind: "loan.originated",
            subjectKind: "loan",
            subjectId: loanId,
            payloadSnapshot: {
              loanId,
              borrowerKind: input.borrowerKind,
              borrowerMemberId,
              borrowerNonMemberId,
              principalAmount,
              currencyCode,
              rateValue,
              rateModel: currentConfig.loanRateModel,
              termPeriods: input.termPeriods,
              originatedOn: input.originatedOn,
              disbursementSource,
              groupConfigVersionAtOrigination: currentConfig.version,
              referrerMemberId: input.referrerMemberId || null,
            },
            reason: null,
            at: now,
            createdAt: now,
          },
        }),
      });
    });

    return { loanId };
  },
  async recordRepayment(input) {
    const [existing] = await db.select().from(repayment)
      .where(and(eq(repayment.orgId, input.orgId), eq(repayment.clientRequestId, input.clientRequestId)));
    if (existing) {
      return {
        repaymentId: existing.id,
        paidOff: false,
        split: {
          appliedToFee: money4(existing.appliedToFee ?? 0),
          appliedToInterest: money4(existing.appliedToInterest),
          appliedToPrincipal: money4(existing.appliedToPrincipal),
          remainingFee: "0.0000",
          remainingInterest: "0.0000",
          remainingPrincipal: "0.0000",
          unappliedAmount: "0.0000",
          paidOff: false,
        },
      };
    }

    const [currentLoan] = await db.select().from(loan)
      .where(and(eq(loan.orgId, input.orgId), eq(loan.id, input.loanId)));
    if (!currentLoan || !openLoanStatuses.has(currentLoan.status)) {
      throw new Error("Loan is not open for repayment");
    }

    const [priorRepayments, scheduleRows, accrualRows, feeRows] = await Promise.all([
      db.select().from(repayment).where(and(eq(repayment.orgId, input.orgId), eq(repayment.loanId, input.loanId))),
      db.select().from(loanSchedule).where(and(eq(loanSchedule.orgId, input.orgId), eq(loanSchedule.loanId, input.loanId))),
      db.select().from(interestAccrual).where(and(eq(interestAccrual.orgId, input.orgId), eq(interestAccrual.loanId, input.loanId))),
      db.select().from(loanFee).where(and(eq(loanFee.orgId, input.orgId), eq(loanFee.loanId, input.loanId))),
    ]);
    const paidPrincipal = priorRepayments.reduce((total, row) => total + Number(row.appliedToPrincipal), 0);
    const paidInterest = priorRepayments.reduce((total, row) => total + Number(row.appliedToInterest), 0);
    const paidFee = priorRepayments.reduce((total, row) => total + Number(row.appliedToFee ?? 0), 0);
    const outstandingFee = money4(Math.max(0, feeRows.reduce((total, row) => total + Number(row.amount), 0) - paidFee));
    const accruedInterest = accrualRows
      .filter((row) => row.accruedOn <= input.datedOn)
      .reduce((total, row) => total + Number(row.interestAmount), 0);
    const scheduledInterest = Number(scheduledInterestDueOn(scheduleRows, input.datedOn));
    const outstandingPrincipal = money4(Math.max(0, Number(currentLoan.principalAmount) - paidPrincipal));
    const outstandingInterest = money4(Math.max(0, scheduledInterest + accruedInterest - paidInterest));
    const paymentMode = input.paymentMode ?? "next_installment";
    const split = paymentMode === "next_installment"
      ? calculateNextInstallmentSplit({
        amount: money4(input.amount),
        outstandingPrincipal,
        rows: scheduledRowsForRepayment(scheduleRows, feeRows, money4(paidFee)),
      })
      : (() => {
        const interestFirstSplit = calculateInterestFirstSplit({
          amount: money4(input.amount),
          accruedInterest: outstandingInterest,
          outstandingPrincipal,
        });
        return {
          ...interestFirstSplit,
          remainingFee: outstandingFee,
          paidOff: interestFirstSplit.paidOff && Number(outstandingFee) === 0,
        };
      })();
    if (Number(split.unappliedAmount) > 0) {
      throw new Error("Repayment amount exceeds the current loan balance");
    }
    const payerMemberId = await payerMemberIdForLoan(input.orgId, currentLoan);
    const repaymentId = randomUUID();
    const now = new Date();
    const paidOff = split.paidOff && Number(split.remainingFee) === 0;
    const scheduleUpdates = allocateRepaymentToSchedule(scheduleRows, feeRows, money4(paidFee), split);
    const borrowerDisplayName = await resolveBorrowerName(input.orgId, currentLoan);

    await withWritableTenantTransaction(input.orgId, async (tx) => {
      await writeWithAudit({
        write: async () => {
          await tx.insert(repayment).values({
        id: repaymentId,
        orgId: input.orgId,
        loanId: input.loanId,
        memberId: payerMemberId,
        amount: money4(input.amount),
        currencyCode: currentLoan.currencyCode,
        appliedToPrincipal: split.appliedToPrincipal,
        appliedToInterest: split.appliedToInterest,
        appliedToFee: split.appliedToFee,
        datedOn: input.datedOn,
        recordedAt: now,
        slipPhotoId: input.slipPhotoId || null,
        notes: normalizeNullableText(input.notes),
        reversesId: null,
        reverseReason: null,
        clientRequestId: input.clientRequestId,
        createdAt: now,
        createdBy: input.actorId,
        createdByKind: ACTOR_KIND,
      });

      await Promise.all(scheduleUpdates.map((update) => tx.update(loanSchedule)
        .set({
          paidInterestToDate: update.paidInterestToDate,
          paidPrincipalToDate: update.paidPrincipalToDate,
          status: update.status,
        })
        .where(and(eq(loanSchedule.orgId, input.orgId), eq(loanSchedule.id, update.row.id)))));

      if (paidOff) {
        await tx.update(loan)
          .set({ status: "pagado", updatedAt: now, updatedBy: input.actorId })
          .where(and(eq(loan.orgId, input.orgId), eq(loan.id, input.loanId)));

        const [referral] = await tx.select().from(loanReferral)
          .where(and(eq(loanReferral.orgId, input.orgId), eq(loanReferral.loanId, input.loanId), isNull(loanReferral.accruedAt)));
        if (referral && Number(referral.commissionAmount) > 0) {
          const [stillUncredited] = await tx.select().from(loanReferral)
            .where(and(eq(loanReferral.orgId, input.orgId), eq(loanReferral.id, referral.id), isNull(loanReferral.accruedAt)));
          if (stillUncredited) {
            const [referrer] = await tx.select().from(member)
              .where(and(eq(member.orgId, input.orgId), eq(member.id, referral.referrerMemberId)));
            const withdrawalId = randomUUID();
            await writeWithAudit({
              write: async () => {
                await tx.insert(withdrawal).values({
                  id: withdrawalId,
                  orgId: input.orgId,
                  memberId: referral.referrerMemberId,
                  amount: money4(referral.commissionAmount),
                  currencyCode: referral.commissionCurrency,
                  datedOn: input.datedOn,
                  recordedAt: now,
                  kind: "referral_commission_credit",
                  shareOutId: null,
                  notes: `Comisión por préstamo ${input.loanId}`,
                  reversesId: null,
                  reverseReason: null,
                  clientRequestId: referral.id,
                  createdAt: now,
                  createdBy: input.actorId,
                  createdByKind: ACTOR_KIND,
                  yearEndShareOutLineId: null,
                });
                await tx.update(loanReferral)
                  .set({ accruedAt: now, withdrawalId })
                  .where(and(eq(loanReferral.orgId, input.orgId), eq(loanReferral.id, referral.id), isNull(loanReferral.accruedAt)));
                await tx.insert(alert).values({
                  orgId: input.orgId,
                  alertKind: "loan_referral_commission",
                  severity: "low",
                  audience: "treasurer",
                  subjectKind: "loan",
                  subjectId: input.loanId,
                  payload: {
                    message: `Préstamo de ${borrowerDisplayName} pagado — comisión de ${referral.commissionCurrency} ${money4(referral.commissionAmount)} acreditada a ${referrer?.displayName ?? "la socia referidora"}`,
                    referralId: referral.id,
                    withdrawalId,
                  },
                  dedupWindowEnd: now,
                  dismissedAt: null,
                  dismissedBy: null,
                  snoozedUntil: null,
                  createdAt: now,
                });
              },
              audit: () => auditWriter({
                tx,
                entry: {
                  orgId: input.orgId,
                  actorKind: ACTOR_KIND,
                  actorId: input.actorId,
                  actionKind: "loan.referral_commission.credit",
                  subjectKind: "withdrawal",
                  subjectId: withdrawalId,
                  payloadSnapshot: {
                    loanId: input.loanId,
                    referralId: referral.id,
                    withdrawalId,
                    referrerMemberId: referral.referrerMemberId,
                    commissionAmount: money4(referral.commissionAmount),
                    commissionCurrency: referral.commissionCurrency,
                  },
                  reason: null,
                  at: now,
                  createdAt: now,
                },
              }),
            });
          }
        }
      }
      await refreshLoanReadModels(tx);

        },
        audit: () => auditWriter({
          tx,
          entry: {
            orgId: input.orgId,
            actorKind: ACTOR_KIND,
            actorId: input.actorId,
            actionKind: paidOff ? "loan.repayment.payoff" : "loan.repayment.create",
            subjectKind: "repayment",
            subjectId: repaymentId,
            payloadSnapshot: {
              repaymentId,
              loanId: input.loanId,
              amount: money4(input.amount),
              split,
              paidOff,
            },
            reason: null,
            at: now,
            createdAt: now,
          },
        }),
      });
    });

    return { repaymentId, paidOff, split };
  },
  };
};
