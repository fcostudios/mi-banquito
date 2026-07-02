import type { RepaymentSplitResult } from "./types";

function parseMoney4(value: string): bigint {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) {
    throw new Error("money value must be a non-negative decimal with up to 4 places");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(10000) + BigInt(fraction.padEnd(4, "0"));
}

function formatMoney4(value: bigint): string {
  const whole = value / BigInt(10000);
  const fraction = `${value % BigInt(10000)}`.padStart(4, "0");
  return `${whole}.${fraction}`;
}

export function calculateInterestFirstSplit(input: {
  amount: string;
  accruedInterest: string;
  outstandingPrincipal: string;
}): RepaymentSplitResult {
  const amount = parseMoney4(input.amount);
  const accruedInterest = parseMoney4(input.accruedInterest);
  const outstandingPrincipal = parseMoney4(input.outstandingPrincipal);
  const appliedToInterest = amount < accruedInterest ? amount : accruedInterest;
  const principalCandidate = amount - appliedToInterest;
  const appliedToPrincipal = principalCandidate < outstandingPrincipal ? principalCandidate : outstandingPrincipal;
  const remainingInterest = accruedInterest - appliedToInterest;
  const remainingPrincipal = outstandingPrincipal - appliedToPrincipal;
  const unappliedAmount = principalCandidate - appliedToPrincipal;

  return {
    appliedToFee: "0.0000",
    appliedToInterest: formatMoney4(appliedToInterest),
    appliedToPrincipal: formatMoney4(appliedToPrincipal),
    remainingFee: "0.0000",
    remainingInterest: formatMoney4(remainingInterest),
    remainingPrincipal: formatMoney4(remainingPrincipal),
    unappliedAmount: formatMoney4(unappliedAmount),
    paidOff: remainingInterest === BigInt(0) && remainingPrincipal === BigInt(0),
  };
}

export function calculateNextInstallmentSplit(input: {
  amount: string;
  outstandingPrincipal: string;
  rows: Array<{
    principalDue: string;
    interestDue: string;
    feeDue: string;
    paidPrincipalToDate: string;
    paidInterestToDate: string;
    paidFeeToDate: string;
  }>;
}): RepaymentSplitResult {
  let remainingPayment = parseMoney4(input.amount);
  let appliedToFee = BigInt(0);
  let appliedToInterest = BigInt(0);
  let appliedToPrincipal = BigInt(0);
  let totalFeeRoom = BigInt(0);
  let totalInterestRoom = BigInt(0);

  const apply = (room: bigint): bigint => {
    const applied = remainingPayment < room ? remainingPayment : room;
    remainingPayment -= applied;
    return applied;
  };

  for (const row of input.rows) {
    const feeRoom = parseMoney4(row.feeDue) - parseMoney4(row.paidFeeToDate);
    const interestRoom = parseMoney4(row.interestDue) - parseMoney4(row.paidInterestToDate);
    const principalRoom = parseMoney4(row.principalDue) - parseMoney4(row.paidPrincipalToDate);
    const safeFeeRoom = feeRoom > BigInt(0) ? feeRoom : BigInt(0);
    const safeInterestRoom = interestRoom > BigInt(0) ? interestRoom : BigInt(0);
    const safePrincipalRoom = principalRoom > BigInt(0) ? principalRoom : BigInt(0);

    totalFeeRoom += safeFeeRoom;
    totalInterestRoom += safeInterestRoom;
    appliedToFee += apply(safeFeeRoom);
    appliedToInterest += apply(safeInterestRoom);
    appliedToPrincipal += apply(safePrincipalRoom);
  }

  const outstandingPrincipal = parseMoney4(input.outstandingPrincipal);
  const remainingPrincipal = outstandingPrincipal - appliedToPrincipal;
  const remainingFee = totalFeeRoom - appliedToFee;
  const remainingInterest = totalInterestRoom - appliedToInterest;

  return {
    appliedToFee: formatMoney4(appliedToFee),
    appliedToInterest: formatMoney4(appliedToInterest),
    appliedToPrincipal: formatMoney4(appliedToPrincipal),
    remainingFee: formatMoney4(remainingFee > BigInt(0) ? remainingFee : BigInt(0)),
    remainingInterest: formatMoney4(remainingInterest > BigInt(0) ? remainingInterest : BigInt(0)),
    remainingPrincipal: formatMoney4(remainingPrincipal > BigInt(0) ? remainingPrincipal : BigInt(0)),
    unappliedAmount: formatMoney4(remainingPayment),
    paidOff: remainingFee <= BigInt(0) && remainingInterest <= BigInt(0) && remainingPrincipal <= BigInt(0),
  };
}
