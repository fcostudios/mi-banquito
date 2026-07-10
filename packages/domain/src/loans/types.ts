export type BorrowerKind = "member" | "non_member";
export type LoanDisbursementSource = "bank_transfer" | "petty_cash";

export type EligibilityResult =
  | { ok: true }
  | { ok: false; reason: string };

export type RepaymentSplitResult = {
  appliedToFee: string;
  appliedToInterest: string;
  appliedToPrincipal: string;
  remainingFee: string;
  remainingInterest: string;
  remainingPrincipal: string;
  unappliedAmount: string;
  paidOff: boolean;
};

export type RepaymentMode = "next_installment" | "principal_payment";

export type ReferralCommissionPlan =
  | { shouldCredit: false }
  | {
      shouldCredit: true;
      withdrawalKind: "referral_commission_credit";
      memberId: string;
      amount: string;
      currencyCode: string;
    };

export type OriginateLoanInput = {
  orgId: string;
  actorId: string;
  clientRequestId: string;
  borrowerKind: BorrowerKind;
  borrowerMemberId?: string;
  nonMemberDisplayName?: string;
  nonMemberWhatsappNumber?: string;
  nonMemberNationalIdLast4?: string;
  nonMemberNotes?: string;
  guarantorMemberId?: string;
  referrerMemberId?: string;
  principalAmount: string;
  termPeriods: number;
  originatedOn: string;
  disbursementSource?: LoanDisbursementSource;
  purpose?: string;
};

export type OriginateLoanResult = {
  loanId: string;
};

export type LoanSupportMember = {
  id: string;
  displayName: string;
};

export type LoanListRow = {
  id: string;
  borrowerName: string;
  borrowerKind: BorrowerKind;
  borrowerMemberId?: string | null;
  principalAmount: string;
  currencyCode: string;
  status: string;
};

export type LoanDetailRow = LoanListRow & {
  rateValue: string;
  rateModel: string;
  termPeriods: number;
  originatedOn: string;
  guarantorName?: string;
  guarantorMemberId?: string | null;
  referrerName?: string;
  schedule: Array<{
    periodIndex: number;
    dueOn: string;
    principalDue: string;
    interestDue: string;
    paidPrincipalToDate: string;
    paidInterestToDate: string;
    status: string;
  }>;
  fees: Array<{ feeKind: string; amount: string; paidToDate: string; datedOn: string; loanScheduleId?: string | null }>;
  repayments: Array<{
    id: string;
    amount: string;
    appliedToFee: string;
    appliedToInterest: string;
    appliedToPrincipal: string;
    datedOn: string;
    reversesId?: string | null;
    reverseReason?: string | null;
  }>;
  accruals: Array<{ accruedOn: string; interestAmount: string; principalBasis: string }>;
};

export type RecordRepaymentInput = {
  orgId: string;
  actorId: string;
  clientRequestId: string;
  loanId: string;
  amount: string;
  datedOn: string;
  paymentMode?: RepaymentMode;
  slipPhotoId?: string;
  notes?: string;
};

export type RecordRepaymentResult = {
  repaymentId: string;
  paidOff: boolean;
  split: RepaymentSplitResult;
};
