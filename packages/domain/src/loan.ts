export { evaluateLoanEligibility, resolveOriginationRate } from "./loans/eligibility";
export { calculateInterestFirstSplit } from "./loans/repayment";
export { generateReferralCommissionCredit } from "./loans/referral";
import type {
  OriginateLoanInput,
  OriginateLoanResult,
  RecordRepaymentInput,
  RecordRepaymentResult,
} from "./loans/types";
export type {
  BorrowerKind,
  EligibilityResult,
  OriginateLoanInput,
  OriginateLoanResult,
  RecordRepaymentInput,
  RecordRepaymentResult,
  ReferralCommissionPlan,
  RepaymentSplitResult,
} from "./loans/types";

export interface LoanService {
  readonly context: "loan";
  originateLoan(input: OriginateLoanInput): Promise<OriginateLoanResult>;
  recordRepayment(input: RecordRepaymentInput): Promise<RecordRepaymentResult>;
}

export const createLoanService = (): LoanService => ({
  context: "loan",
  async originateLoan(_input) {
    throw new Error("LoanService.originateLoan persistence is not implemented yet");
  },
  async recordRepayment(_input) {
    throw new Error("LoanService.recordRepayment persistence is not implemented yet");
  },
});
