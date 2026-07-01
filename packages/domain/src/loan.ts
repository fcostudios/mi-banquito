export { evaluateLoanEligibility, resolveOriginationRate } from "./loans/eligibility";
export { calculateInterestFirstSplit } from "./loans/repayment";
export { generateReferralCommissionCredit } from "./loans/referral";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import {
  auditLogEntry,
  availableCapital,
  groupConfig,
  loan,
  loanFee,
  loanGuarantor,
  loanReferral,
  loanSchedule,
  member,
  nonMemberBorrower,
} from "@mi-banquito/db/schema";
import { evaluateLoanEligibility, resolveOriginationRate } from "./loans/eligibility";
import type {
  OriginateLoanInput,
  OriginateLoanResult,
  LoanSupportMember,
  RecordRepaymentInput,
  RecordRepaymentResult,
} from "./loans/types";
import { generateDecliningBalanceSchedule } from "./rules/loans/declining-balance";
export type {
  BorrowerKind,
  EligibilityResult,
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
  originateLoan(input: OriginateLoanInput): Promise<OriginateLoanResult>;
  recordRepayment(input: RecordRepaymentInput): Promise<RecordRepaymentResult>;
}

type GroupConfigJson = Record<string, unknown>;

const ACTOR_KIND = "member";
const money4 = (value: string | number): string => Number(value).toFixed(4);
const ACTIVE_LOAN_STATUSES = new Set(["originated", "activo", "en_mora"]);

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

export const createLoanService = (): LoanService => ({
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
      const savingsBasis = savingsAfterExposureForCap(
        money4(row.initialSavingsBalance),
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
      throw new Error("Current group configuration is required before originating loans");
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
      borrowerSavingsBalance = savingsAfterExposureForCap(
        money4(borrower.initialSavingsBalance),
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
      guarantorSavingsBalance = savingsAfterExposureForCap(
        money4(guarantor.initialSavingsBalance),
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

    await db.transaction(async (tx) => {
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

      await tx.insert(auditLogEntry).values({
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
          groupConfigVersionAtOrigination: currentConfig.version,
          referrerMemberId: input.referrerMemberId || null,
        },
        reason: null,
        at: now,
        createdAt: now,
      });
    });

    return { loanId };
  },
  async recordRepayment(_input) {
    throw new Error("LoanService.recordRepayment persistence is not implemented yet");
  },
});
