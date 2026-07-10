const MONEY_SCALE = BigInt(10000);
const BR_ID = "BR-26";

export type PaymentAllocationKind =
  | "loan_fee"
  | "loan_interest"
  | "loan_principal"
  | "contribution_overdue"
  | "contribution_current"
  | "contribution_future";

export type PaymentExtraDecision = {
  kind: "leave_unapplied" | "apply_to_future_contribution";
};

export type LoanPaymentObligation = {
  loanId: string;
  loanScheduleId: string;
  loanFeeId?: string | null;
  dueOn: string;
  feeDue: string;
  interestDue: string;
  principalDue: string;
};

export type ContributionPaymentObligation = {
  cycleId: string;
  cycleLabel: string;
  dueOn: string;
  amountDue: string;
  kind: "overdue" | "current" | "future";
};

export type PaymentAllocationLine = {
  kind: PaymentAllocationKind;
  amount: string;
  sortOrder: number;
  currencyCode: string;
  brId: typeof BR_ID;
  groupConfigVersion: number;
  loanId?: string;
  loanScheduleId?: string;
  loanFeeId?: string | null;
  cycleId?: string;
  cycleLabel?: string;
};

export type AllocateMemberPaymentInput = {
  orgId: string;
  memberId: string;
  amount: string;
  currencyCode: string;
  datedOn: string;
  groupConfigVersion: number;
  loanObligations: LoanPaymentObligation[];
  contributionObligations: ContributionPaymentObligation[];
  extraDecision?: PaymentExtraDecision | null;
};

export type AllocateMemberPaymentResult = {
  orgId: string;
  memberId: string;
  amount: string;
  currencyCode: string;
  datedOn: string;
  groupConfigVersion: number;
  lines: PaymentAllocationLine[];
  unappliedAmount: string;
  requiresExtraDecision: boolean;
};

type LoanBucket = {
  kind: Extract<PaymentAllocationKind, "loan_fee" | "loan_interest" | "loan_principal">;
  amount: string;
  loan: LoanPaymentObligation;
};

const contributionKindOrder: Record<ContributionPaymentObligation["kind"], number> = {
  overdue: 1,
  current: 2,
  future: 3,
};

function parseMoney4(value: string): bigint {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value)) {
    throw new Error("money value must be a non-negative decimal with up to 4 places");
  }

  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * MONEY_SCALE + BigInt(fraction.padEnd(4, "0"));
}

function formatMoney4(value: bigint): string {
  const whole = value / MONEY_SCALE;
  const fraction = `${value % MONEY_SCALE}`.padStart(4, "0");
  return `${whole}.${fraction}`;
}

function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

function sortedLoans(loans: readonly LoanPaymentObligation[]): LoanPaymentObligation[] {
  return loans
    .map((loan, index) => ({ loan, index }))
    .sort((a, b) => (
      compareText(a.loan.dueOn, b.loan.dueOn)
      || compareText(a.loan.loanScheduleId, b.loan.loanScheduleId)
      || a.index - b.index
    ))
    .map(({ loan }) => loan);
}

function sortedContributions(
  contributions: readonly ContributionPaymentObligation[],
): ContributionPaymentObligation[] {
  return contributions
    .map((contribution, index) => ({ contribution, index }))
    .sort((a, b) => (
      contributionKindOrder[a.contribution.kind] - contributionKindOrder[b.contribution.kind]
      || compareText(a.contribution.dueOn, b.contribution.dueOn)
      || compareText(a.contribution.cycleId, b.contribution.cycleId)
      || a.index - b.index
    ))
    .map(({ contribution }) => contribution);
}

function loanBuckets(loan: LoanPaymentObligation): LoanBucket[] {
  return [
    { kind: "loan_fee", amount: loan.feeDue, loan },
    { kind: "loan_interest", amount: loan.interestDue, loan },
    { kind: "loan_principal", amount: loan.principalDue, loan },
  ];
}

function applyAmount(remaining: bigint, due: bigint): { applied: bigint; remaining: bigint } {
  const applied = remaining < due ? remaining : due;
  return {
    applied,
    remaining: remaining - applied,
  };
}

function baseLine(
  input: AllocateMemberPaymentInput,
  amount: bigint,
): Pick<PaymentAllocationLine, "amount" | "brId" | "currencyCode" | "groupConfigVersion"> {
  return {
    amount: formatMoney4(amount),
    brId: BR_ID,
    currencyCode: input.currencyCode,
    groupConfigVersion: input.groupConfigVersion,
  };
}

export function allocateMemberPayment(input: AllocateMemberPaymentInput): AllocateMemberPaymentResult {
  let remaining = parseMoney4(input.amount);
  const lines: PaymentAllocationLine[] = [];

  const pushLine = (line: Omit<PaymentAllocationLine, "sortOrder">): void => {
    lines.push({
      ...line,
      sortOrder: lines.length + 1,
    });
  };

  for (const loan of sortedLoans(input.loanObligations)) {
    for (const bucket of loanBuckets(loan)) {
      const allocation = applyAmount(remaining, parseMoney4(bucket.amount));
      remaining = allocation.remaining;

      if (allocation.applied === BigInt(0)) {
        continue;
      }

      pushLine({
        ...baseLine(input, allocation.applied),
        kind: bucket.kind,
        ...(bucket.kind === "loan_fee" ? { loanFeeId: bucket.loan.loanFeeId ?? null } : {}),
        loanId: bucket.loan.loanId,
        loanScheduleId: bucket.loan.loanScheduleId,
      });
    }
  }

  for (const contribution of sortedContributions(input.contributionObligations)) {
    const allocation = applyAmount(remaining, parseMoney4(contribution.amountDue));
    remaining = allocation.remaining;

    if (allocation.applied === BigInt(0)) {
      continue;
    }

    pushLine({
      ...baseLine(input, allocation.applied),
      kind: `contribution_${contribution.kind}`,
      cycleId: contribution.cycleId,
      cycleLabel: contribution.cycleLabel,
    });
  }

  return {
    orgId: input.orgId,
    memberId: input.memberId,
    amount: formatMoney4(parseMoney4(input.amount)),
    currencyCode: input.currencyCode,
    datedOn: input.datedOn,
    groupConfigVersion: input.groupConfigVersion,
    lines,
    unappliedAmount: formatMoney4(remaining),
    requiresExtraDecision: remaining > BigInt(0) && !input.extraDecision,
  };
}
