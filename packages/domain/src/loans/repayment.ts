import type { RepaymentSplitResult } from "./types";

function parseMoney4(value: string): bigint {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) {
    throw new Error("money value must be a non-negative decimal with up to 4 places");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
}

function formatMoney4(value: bigint): string {
  const whole = value / 10_000n;
  const fraction = `${value % 10_000n}`.padStart(4, "0");
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
    appliedToInterest: formatMoney4(appliedToInterest),
    appliedToPrincipal: formatMoney4(appliedToPrincipal),
    remainingInterest: formatMoney4(remainingInterest),
    remainingPrincipal: formatMoney4(remainingPrincipal),
    unappliedAmount: formatMoney4(unappliedAmount),
    paidOff: remainingInterest === 0n && remainingPrincipal === 0n,
  };
}
