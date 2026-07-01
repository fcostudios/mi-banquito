export type BorrowerKind = "member" | "non_member";

export type EligibilityResult =
  | { ok: true }
  | { ok: false; reason: string };

export type RepaymentSplitResult = {
  appliedToInterest: string;
  appliedToPrincipal: string;
  remainingInterest: string;
  remainingPrincipal: string;
  unappliedAmount: string;
  paidOff: boolean;
};

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
  purpose?: string;
};

export type OriginateLoanResult = {
  loanId: string;
};

export type LoanSupportMember = {
  id: string;
  displayName: string;
};

export type RecordRepaymentInput = {
  orgId: string;
  actorId: string;
  clientRequestId: string;
  loanId: string;
  amount: string;
  datedOn: string;
  slipPhotoId?: string;
  notes?: string;
};

export type RecordRepaymentResult = {
  repaymentId: string;
  paidOff: boolean;
  split: RepaymentSplitResult;
};
