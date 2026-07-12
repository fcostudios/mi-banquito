// contracts — drizzle-zod schemas derived from the db package (PRIN-03).
// One direction: packages/db/schema.ts is the SSOT; these zod schemas
// derive from it, so validation can't drift from the tables.
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  alert,
  auditLogEntry,
  entityVersion,
  interestAccrual,
  member,
  contributionCycle,
  contribution,
  withdrawal,
  expense,
  slipPhoto,
  account,
  transfer,
  extraordinaryCollection,
  extraordinaryCollectionLine,
  loan,
  loanDisbursement,
  loanSchedule,
  loanFee,
  repayment,
  promise,
  promiseReminder,
  organization,
  groupConfig,
  arAging,
  projectedLiquidity,
  platformOperator,
  impersonation,
  userAccount,
  userOrgMembership,
  country,
  institution,
  reconciliationCycle,
  periodClose,
  statementArchive,
  surplusGovernanceDecision,
  treasurerCompensationDisbursement,
  pilotLogEntry,
  yearEndShareOut,
  yearEndShareOutLine,
  yearEndBalanceSnapshot,
  yearEndBalanceSnapshotLine
} from "@mi-banquito/db/schema";

export const insertAlertSchema = createInsertSchema(alert);
export const selectAlertSchema = createSelectSchema(alert);
export const insertAuditLogEntrySchema = createInsertSchema(auditLogEntry);
export const selectAuditLogEntrySchema = createSelectSchema(auditLogEntry);
export const insertEntityVersionSchema = createInsertSchema(entityVersion);
export const selectEntityVersionSchema = createSelectSchema(entityVersion);
export const insertInterestAccrualSchema = createInsertSchema(interestAccrual);
export const selectInterestAccrualSchema = createSelectSchema(interestAccrual);
export const insertMemberSchema = createInsertSchema(member);
export const selectMemberSchema = createSelectSchema(member);
export const insertContributionCycleSchema = createInsertSchema(contributionCycle);
export const selectContributionCycleSchema = createSelectSchema(contributionCycle);
export const insertContributionSchema = createInsertSchema(contribution);
export const selectContributionSchema = createSelectSchema(contribution);
export const insertWithdrawalSchema = createInsertSchema(withdrawal);
export const selectWithdrawalSchema = createSelectSchema(withdrawal);
export const insertExpenseSchema = createInsertSchema(expense);
export const selectExpenseSchema = createSelectSchema(expense);
export const insertSlipPhotoSchema = createInsertSchema(slipPhoto);
export const selectSlipPhotoSchema = createSelectSchema(slipPhoto);
export const insertAccountSchema = createInsertSchema(account);
export const selectAccountSchema = createSelectSchema(account);
export const insertTransferSchema = createInsertSchema(transfer);
export const selectTransferSchema = createSelectSchema(transfer);
export const insertExtraordinaryCollectionSchema = createInsertSchema(extraordinaryCollection);
export const selectExtraordinaryCollectionSchema = createSelectSchema(extraordinaryCollection);
export const insertExtraordinaryCollectionLineSchema = createInsertSchema(extraordinaryCollectionLine);
export const selectExtraordinaryCollectionLineSchema = createSelectSchema(extraordinaryCollectionLine);
export const insertLoanSchema = createInsertSchema(loan);
export const selectLoanSchema = createSelectSchema(loan);
export const insertLoanDisbursementSchema = createInsertSchema(loanDisbursement);
export const selectLoanDisbursementSchema = createSelectSchema(loanDisbursement);
export const insertLoanScheduleSchema = createInsertSchema(loanSchedule);
export const selectLoanScheduleSchema = createSelectSchema(loanSchedule);
export const insertLoanFeeSchema = createInsertSchema(loanFee);
export const selectLoanFeeSchema = createSelectSchema(loanFee);
export const insertRepaymentSchema = createInsertSchema(repayment);
export const selectRepaymentSchema = createSelectSchema(repayment);
export const insertPromiseSchema = createInsertSchema(promise);
export const selectPromiseSchema = createSelectSchema(promise);
export const insertPromiseReminderSchema = createInsertSchema(promiseReminder);
export const selectPromiseReminderSchema = createSelectSchema(promiseReminder);
export const insertOrganizationSchema = createInsertSchema(organization);
export const selectOrganizationSchema = createSelectSchema(organization);
export const insertGroupConfigSchema = createInsertSchema(groupConfig);
export const selectGroupConfigSchema = createSelectSchema(groupConfig);
export const selectArAgingSchema = createSelectSchema(arAging);
export const selectProjectedLiquiditySchema = createSelectSchema(projectedLiquidity);
export const insertPlatformOperatorSchema = createInsertSchema(platformOperator);
export const selectPlatformOperatorSchema = createSelectSchema(platformOperator);
export const insertImpersonationSchema = createInsertSchema(impersonation);
export const selectImpersonationSchema = createSelectSchema(impersonation);
export const insertUserAccountSchema = createInsertSchema(userAccount);
export const selectUserAccountSchema = createSelectSchema(userAccount);
export const insertUserOrgMembershipSchema = createInsertSchema(userOrgMembership);
export const selectUserOrgMembershipSchema = createSelectSchema(userOrgMembership);
export const insertCountrySchema = createInsertSchema(country);
export const selectCountrySchema = createSelectSchema(country);
export const insertInstitutionSchema = createInsertSchema(institution);
export const selectInstitutionSchema = createSelectSchema(institution);
export const insertReconciliationCycleSchema = createInsertSchema(reconciliationCycle);
export const selectReconciliationCycleSchema = createSelectSchema(reconciliationCycle);
export const insertPeriodCloseSchema = createInsertSchema(periodClose);
export const selectPeriodCloseSchema = createSelectSchema(periodClose);
export const insertStatementArchiveSchema = createInsertSchema(statementArchive);
export const selectStatementArchiveSchema = createSelectSchema(statementArchive);
export const insertSurplusGovernanceDecisionSchema = createInsertSchema(surplusGovernanceDecision);
export const selectSurplusGovernanceDecisionSchema = createSelectSchema(surplusGovernanceDecision);
export const insertTreasurerCompensationDisbursementSchema = createInsertSchema(treasurerCompensationDisbursement);
export const selectTreasurerCompensationDisbursementSchema = createSelectSchema(treasurerCompensationDisbursement);
export const insertPilotLogEntrySchema = createInsertSchema(pilotLogEntry);
export const selectPilotLogEntrySchema = createSelectSchema(pilotLogEntry);
export const insertYearEndShareOutSchema = createInsertSchema(yearEndShareOut);
export const selectYearEndShareOutSchema = createSelectSchema(yearEndShareOut);
export const insertYearEndShareOutLineSchema = createInsertSchema(yearEndShareOutLine);
export const selectYearEndShareOutLineSchema = createSelectSchema(yearEndShareOutLine);
export const insertYearEndBalanceSnapshotSchema = createInsertSchema(yearEndBalanceSnapshot);
export const selectYearEndBalanceSnapshotSchema = createSelectSchema(yearEndBalanceSnapshot);
export const insertYearEndBalanceSnapshotLineSchema = createInsertSchema(yearEndBalanceSnapshotLine);
export const selectYearEndBalanceSnapshotLineSchema = createSelectSchema(yearEndBalanceSnapshotLine);

const moneyString = z.string().regex(/^\d+(\.\d{1,4})?$/, "Use a non-negative decimal amount");
const positiveMoneyString = moneyString.refine((value) => Number(value) > 0, "Use a positive decimal amount");
const signedMoneyString = z.string().regex(/^-?\d+(\.\d{1,4})?$/, "Use a decimal amount");
const uuidString = z.string().uuid();
const optionalUuidString = uuidString.optional().or(z.literal(""));
const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use E.164 format, for example +593987654321");
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function currentEcuadorDateString(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return now.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

export function isPromiseDateOnOrAfterToday(
  promisedOn: string,
  today = currentEcuadorDateString(),
): boolean {
  return promisedOn >= today;
}

export const organizationCreateFormSchema = z.object({
  displayName: z.string().trim().min(1),
  countryCode: z.string().default("EC"),
  currencyCode: z.string().default("USD"),
  timezone: z.string().default("America/Guayaquil"),
  defaultLanguage: z.string().default("es-EC"),
  brandingLogoUri: z.string().url().optional().or(z.literal("")),
});

export const groupConfigFormSchema = z.object({
  contributionCycleKind: z.enum(["monthly", "weekly"]),
  contributionAmount: moneyString,
  opensOnDay: z.coerce.number().int().min(1).max(31),
  loanRateModel: z.literal("declining_balance"),
  memberLoanRateValue: moneyString,
  nonMemberLoanRateValue: moneyString,
  loanRatePeriodUnit: z.enum(["monthly", "weekly"]),
  loanGracePeriods: z.coerce.number().int().min(0).max(12),
  loanToSavingsCapRatio: moneyString,
  adminFeePct: moneyString,
  referralCommissionAmount: moneyString,
  treasurerCompensationKind: z.enum(["fixed", "percentage"]),
  treasurerCompensationAmount: moneyString,
  treasurerCompensationPeriod: z.enum(["monthly", "cycle"]),
  baseFundQuotaFiscalYear: z.coerce.number().int().min(2000).max(2100),
  baseFundQuotaAmount: moneyString,
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  fiscalYearStartDay: z.coerce.number().int().min(1).max(31),
  yearEndShareOutFormula: z.enum(["proportional_time_weighted"]),
  reconciliationToleranceAmount: moneyString,
  lateThresholdDays: z.coerce.number().int().min(0).max(365),
  moraThresholdDays: z.coerce.number().int().min(1).max(365),
}).refine((value) => value.moraThresholdDays >= value.lateThresholdDays, {
  path: ["moraThresholdDays"],
  message: "Mora threshold must be greater than or equal to late threshold",
});

export const firstRunNameFormSchema = z.object({
  displayName: z.string().trim().min(1),
  brandingLogoUri: z.string().url().optional().or(z.literal("")),
  nextStep: z.literal("rules"),
});

export const firstRunCompleteFormSchema = z.object({
  confirmed: z.literal("yes"),
});

export const addMemberFormSchema = z.object({
  displayName: z.string().trim().min(1),
  whatsappNumber: e164.optional().or(z.literal("")),
  role: z.enum(["aportante", "tesorera", "presidente", "secretaria"]).default("aportante"),
  joinedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  initialSavingsBalance: moneyString.default("0"),
  notes: z.string().max(500).optional(),
});

export const memberStatusTransitionFormSchema = z.object({
  memberId: uuidString,
  nextStatus: z.enum(["en_pausa", "baja"]),
  refundAmount: moneyString.optional(),
  reason: z.string().trim().min(1),
});

export const contributionSourceSchema = z.enum(["bank_transfer", "cash_in_meeting", "petty_cash_deposit"]);
export const contributionKindSchema = z.enum(["regular", "partial"]);

export const contributionFormSchema = z.object({
  clientRequestId: uuidString,
  memberId: uuidString,
  cycleId: uuidString.optional().or(z.literal("")),
  amount: moneyString,
  datedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentSource: contributionSourceSchema.default("cash_in_meeting"),
  kind: contributionKindSchema.default("regular"),
  slipPhotoId: uuidString.optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.paymentSource !== "cash_in_meeting" && !value.slipPhotoId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["slipPhotoId"],
      message: "Slip photo is required for bank and petty-cash deposits",
    });
  }
});

export const reverseContributionFormSchema = z.object({
  contributionId: uuidString,
  reason: z.string().trim().min(1),
});

export const baseFundQuotaPaymentFormSchema = z.object({
  memberId: uuidString,
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  amount: moneyString,
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slipPhotoId: uuidString.optional().or(z.literal("")),
});

export const loanDisbursementSourceSchema = z.enum(["bank_transfer", "petty_cash"]);

export const loanOriginationFormSchema = z.object({
  clientRequestId: uuidString,
  borrowerKind: z.enum(["member", "non_member"]).default("member"),
  borrowerMemberId: uuidString.optional().or(z.literal("")),
  nonMemberDisplayName: z.string().trim().optional(),
  nonMemberWhatsappNumber: e164.optional().or(z.literal("")),
  nonMemberNationalIdLast4: z.string().regex(/^\d{4}$/).optional().or(z.literal("")),
  nonMemberNotes: z.string().max(500).optional(),
  guarantorMemberId: uuidString.optional().or(z.literal("")),
  referrerMemberId: uuidString.optional().or(z.literal("")),
  principalAmount: moneyString,
  termPeriods: z.coerce.number().int().min(1).max(120),
  originatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  disbursementSource: loanDisbursementSourceSchema.default("bank_transfer"),
  purpose: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.borrowerKind === "member" && !value.borrowerMemberId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["borrowerMemberId"],
      message: "Member borrower is required",
    });
  }

  if (value.borrowerKind === "non_member") {
    if (!value.nonMemberDisplayName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nonMemberDisplayName"],
        message: "Non-member name is required",
      });
    }

    if (!value.guarantorMemberId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["guarantorMemberId"],
        message: "Guarantor is required",
      });
    }
  }
});

export const loanRepaymentFormSchema = z.object({
  clientRequestId: uuidString,
  loanId: uuidString,
  accountId: uuidString,
  amount: moneyString,
  datedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMode: z.enum(["next_installment", "principal_payment"]).default("next_installment"),
  slipPhotoId: uuidString.optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
});

export const paymentExtraDecisionSchema = z.enum([
  "extra_savings",
  "future_contribution",
  "loan_principal",
]);

export const memberPaymentFormSchema = z.object({
  clientRequestId: uuidString,
  memberId: uuidString,
  accountId: uuidString,
  amount: positiveMoneyString,
  datedOn: dateString,
  paymentSource: contributionSourceSchema.default("cash_in_meeting"),
  slipPhotoId: uuidString.optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
  targetLoanId: optionalUuidString,
  targetCycleId: optionalUuidString,
  extraDecision: paymentExtraDecisionSchema.optional().or(z.literal("")),
  overrideReason: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.paymentSource !== "cash_in_meeting" && !value.slipPhotoId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["slipPhotoId"],
      message: "Slip photo is required for bank and petty-cash deposits",
    });
  }

  if (value.extraDecision === "loan_principal" && !value.targetLoanId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["extraDecision"],
      message: "A loan target is required to apply extra money to principal",
    });
  }
});

export const markPromiseFormSchema = z.object({
  memberId: uuidString,
  loanId: optionalUuidString,
  cycleId: optionalUuidString,
  periodLabel: z.string().trim().min(1),
  promisedOn: dateString,
  note: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  const sourceCount = Number(Boolean(value.loanId)) + Number(Boolean(value.cycleId));

  if (!isPromiseDateOnOrAfterToday(value.promisedOn)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["promisedOn"],
      message: "La fecha de promesa debe ser hoy o una fecha futura.",
    });
  }

  if (sourceCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["loanId"],
      message: "Elige un solo atraso para registrar la promesa.",
    });
  }
});

export const chaseAttemptFormSchema = z.object({
  memberId: uuidString,
  loanId: optionalUuidString,
  cycleId: optionalUuidString,
  periodLabel: z.string().trim().min(1),
}).superRefine((value, ctx) => {
  const sourceCount = Number(Boolean(value.loanId)) + Number(Boolean(value.cycleId));

  if (sourceCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["loanId"],
      message: "Elige un solo atraso para registrar el aviso.",
    });
  }
});

export const liquiditySandboxSchema = z.object({
  hypotheticalLoanAmount: moneyString.optional().or(z.literal("")),
});

export const verifyHashSchema = z.string().regex(/^[0-9a-fA-F]{64}$/, "Use a 64 character hexadecimal hash");

export const pilotLogEntryFormSchema = z.object({
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vocabularyAnswer: z.string().trim().min(1),
  paperValue: z.string().trim().min(1),
  systemValue: z.string().trim().min(1),
  discrepancy: z.string().trim().min(1),
  wouldNotReturnToPaper: z.enum(["yes", "no"]).default("no"),
  cleanMonth: z.enum(["yes", "no"]).default("no"),
  note: z.string().max(500).optional(),
});

export const cronReplayFormSchema = z.object({
  endpoint: z.enum(["accrue-interest", "award-treasurer-compensation", "drift-check"]),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((value) => value.fromDate <= value.toDate, {
  path: ["toDate"],
  message: "Replay end date must be on or after start date",
});

export type OrganizationCreateForm = z.infer<typeof organizationCreateFormSchema>;
export type GroupConfigForm = z.infer<typeof groupConfigFormSchema>;
export type FirstRunNameForm = z.infer<typeof firstRunNameFormSchema>;
export type FirstRunCompleteForm = z.infer<typeof firstRunCompleteFormSchema>;
export type AddMemberForm = z.infer<typeof addMemberFormSchema>;
export type MemberStatusTransitionForm = z.infer<typeof memberStatusTransitionFormSchema>;
export type ContributionForm = z.infer<typeof contributionFormSchema>;
export type ReverseContributionForm = z.infer<typeof reverseContributionFormSchema>;
export type BaseFundQuotaPaymentForm = z.infer<typeof baseFundQuotaPaymentFormSchema>;
export type LoanOriginationForm = z.infer<typeof loanOriginationFormSchema>;
export type LoanRepaymentForm = z.infer<typeof loanRepaymentFormSchema>;
export type PaymentExtraDecision = z.infer<typeof paymentExtraDecisionSchema>;
export type MemberPaymentForm = z.infer<typeof memberPaymentFormSchema>;
export type MarkPromiseForm = z.infer<typeof markPromiseFormSchema>;
export type ChaseAttemptForm = z.infer<typeof chaseAttemptFormSchema>;
export type LiquiditySandbox = z.infer<typeof liquiditySandboxSchema>;
export type PilotLogEntryForm = z.infer<typeof pilotLogEntryFormSchema>;
export type CronReplayForm = z.infer<typeof cronReplayFormSchema>;
