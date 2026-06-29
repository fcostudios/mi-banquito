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
  loanSchedule,
  loanFee,
  repayment,
  organization,
  groupConfig,
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
export const insertLoanScheduleSchema = createInsertSchema(loanSchedule);
export const selectLoanScheduleSchema = createSelectSchema(loanSchedule);
export const insertLoanFeeSchema = createInsertSchema(loanFee);
export const selectLoanFeeSchema = createSelectSchema(loanFee);
export const insertRepaymentSchema = createInsertSchema(repayment);
export const selectRepaymentSchema = createSelectSchema(repayment);
export const insertOrganizationSchema = createInsertSchema(organization);
export const selectOrganizationSchema = createSelectSchema(organization);
export const insertGroupConfigSchema = createInsertSchema(groupConfig);
export const selectGroupConfigSchema = createSelectSchema(groupConfig);
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
export const insertYearEndShareOutSchema = createInsertSchema(yearEndShareOut);
export const selectYearEndShareOutSchema = createSelectSchema(yearEndShareOut);
export const insertYearEndShareOutLineSchema = createInsertSchema(yearEndShareOutLine);
export const selectYearEndShareOutLineSchema = createSelectSchema(yearEndShareOutLine);
export const insertYearEndBalanceSnapshotSchema = createInsertSchema(yearEndBalanceSnapshot);
export const selectYearEndBalanceSnapshotSchema = createSelectSchema(yearEndBalanceSnapshot);
export const insertYearEndBalanceSnapshotLineSchema = createInsertSchema(yearEndBalanceSnapshotLine);
export const selectYearEndBalanceSnapshotLineSchema = createSelectSchema(yearEndBalanceSnapshotLine);

const moneyString = z.string().regex(/^\d+(\.\d{1,4})?$/, "Use a non-negative decimal amount");
const uuidString = z.string().uuid();
const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use E.164 format, for example +593987654321");

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

export const contributionFormSchema = z.object({
  clientRequestId: uuidString,
  memberId: uuidString,
  amount: moneyString,
  datedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slipPhotoId: uuidString.optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
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

export type OrganizationCreateForm = z.infer<typeof organizationCreateFormSchema>;
export type GroupConfigForm = z.infer<typeof groupConfigFormSchema>;
export type AddMemberForm = z.infer<typeof addMemberFormSchema>;
export type MemberStatusTransitionForm = z.infer<typeof memberStatusTransitionFormSchema>;
export type ContributionForm = z.infer<typeof contributionFormSchema>;
export type ReverseContributionForm = z.infer<typeof reverseContributionFormSchema>;
export type BaseFundQuotaPaymentForm = z.infer<typeof baseFundQuotaPaymentFormSchema>;
