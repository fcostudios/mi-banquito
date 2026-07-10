const MONEY_SCALE = BigInt(10000);
const BR_ID = "BR-26";

export type PaymentAllocationKind =
  | "loan_fee"
  | "loan_interest"
  | "loan_principal"
  | "contribution_overdue"
  | "contribution_current"
  | "contribution_future"
  | "extra_savings";

export type PaymentExtraDecision = "extra_savings" | "future_contribution" | "loan_principal";

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

type LoanBucketKind = LoanBucket["kind"];

const loanBucketKinds: LoanBucketKind[] = ["loan_fee", "loan_interest", "loan_principal"];

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

function loanBucketAmount(loan: LoanPaymentObligation, kind: LoanBucketKind): string {
  if (kind === "loan_fee") {
    return loan.feeDue;
  }
  if (kind === "loan_interest") {
    return loan.interestDue;
  }
  return loan.principalDue;
}

function loanBuckets(loans: readonly LoanPaymentObligation[]): LoanBucket[] {
  const loansByAge = sortedLoans(loans);

  return loanBucketKinds.flatMap((kind) => (
    loansByAge.map((loan) => ({
      kind,
      amount: loanBucketAmount(loan, kind),
      loan,
    }))
  ));
}

function principalBucketKey(loan: LoanPaymentObligation): string {
  return loan.loanScheduleId;
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
  const principalAllocations = new Map<string, bigint>();

  const pushLine = (line: Omit<PaymentAllocationLine, "sortOrder">): void => {
    lines.push({
      ...line,
      sortOrder: lines.length + 1,
    });
  };

  const pushLoanAllocation = (bucket: LoanBucket, amount: bigint): void => {
    if (bucket.kind === "loan_principal") {
      const key = principalBucketKey(bucket.loan);
      principalAllocations.set(key, (principalAllocations.get(key) ?? BigInt(0)) + amount);
    }

    pushLine({
      ...baseLine(input, amount),
      kind: bucket.kind,
      ...(bucket.kind === "loan_fee" ? { loanFeeId: bucket.loan.loanFeeId ?? null } : {}),
      loanId: bucket.loan.loanId,
      loanScheduleId: bucket.loan.loanScheduleId,
    });
  };

  const allocateLoanBucket = (bucket: LoanBucket): void => {
    const allocation = applyAmount(remaining, parseMoney4(bucket.amount));
    remaining = allocation.remaining;

    if (allocation.applied === BigInt(0)) {
      return;
    }

    pushLoanAllocation(bucket, allocation.applied);
  };

  for (const bucket of loanBuckets(input.loanObligations)) {
    allocateLoanBucket(bucket);
  }

  const baseContributions = input.contributionObligations.filter(
    (contribution) => contribution.kind !== "future",
  );

  for (const contribution of sortedContributions(baseContributions)) {
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

  if (remaining > BigInt(0) && input.extraDecision === "future_contribution") {
    const futureContributions = input.contributionObligations.filter(
      (contribution) => contribution.kind === "future",
    );

    for (const contribution of sortedContributions(futureContributions)) {
      const allocation = applyAmount(remaining, parseMoney4(contribution.amountDue));
      remaining = allocation.remaining;

      if (allocation.applied === BigInt(0)) {
        continue;
      }

      pushLine({
        ...baseLine(input, allocation.applied),
        kind: "contribution_future",
        cycleId: contribution.cycleId,
        cycleLabel: contribution.cycleLabel,
      });
    }
  }

  if (remaining > BigInt(0) && input.extraDecision === "loan_principal") {
    for (const loan of sortedLoans(input.loanObligations)) {
      const principalDue = parseMoney4(loan.principalDue);
      const alreadyAllocated = principalAllocations.get(principalBucketKey(loan)) ?? BigInt(0);
      const outstandingPrincipal = principalDue - alreadyAllocated;

      if (outstandingPrincipal <= BigInt(0)) {
        continue;
      }

      const allocation = applyAmount(remaining, outstandingPrincipal);
      remaining = allocation.remaining;

      if (allocation.applied === BigInt(0)) {
        continue;
      }

      pushLoanAllocation({
        kind: "loan_principal",
        amount: formatMoney4(outstandingPrincipal),
        loan,
      }, allocation.applied);
    }
  }

  if (remaining > BigInt(0) && input.extraDecision === "extra_savings") {
    pushLine({
      ...baseLine(input, remaining),
      kind: "extra_savings",
    });
    remaining = BigInt(0);
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
