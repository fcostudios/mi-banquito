// contracts — drizzle-zod schemas derived from the db package (PRIN-03).
// One direction: packages/db/schema.ts is the SSOT; these zod schemas
// derive from it, so validation can't drift from the tables.
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
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
