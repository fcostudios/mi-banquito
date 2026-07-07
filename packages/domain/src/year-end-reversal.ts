const REVERSIBLE_STATUSES = new Set(["approved", "distributed"]);
const DECIMAL_4 = /^-?\d+(?:\.\d{1,4})?$/;
const ZERO = BigInt(0);
const TEN_THOUSAND = BigInt(10000);

function money4ToUnits(value: string): bigint {
  const normalized = String(value).trim();
  if (!DECIMAL_4.test(normalized)) {
    throw new Error("invalid_money_amount");
  }
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const units = BigInt(whole) * TEN_THOUSAND + BigInt(fraction.padEnd(4, "0"));
  return negative ? -units : units;
}

function unitsToMoney4(value: bigint): string {
  const sign = value < ZERO ? "-" : "";
  const abs = value < ZERO ? -value : value;
  return `${sign}${abs / TEN_THOUSAND}.${String(abs % TEN_THOUSAND).padStart(4, "0")}`;
}

export function assertShareOutReversalAllowed(input: {
  status: string;
  approvedAt: Date | string | null;
  now: Date;
  graceDays: number;
}) {
  if (!REVERSIBLE_STATUSES.has(input.status)) {
    throw new Error("share_out_not_reversible");
  }
  if (!input.approvedAt) {
    throw new Error("share_out_reversal_approval_date_required");
  }
  const approvedAt = input.approvedAt instanceof Date ? input.approvedAt : new Date(input.approvedAt);
  const windowEndsAt = new Date(approvedAt.getTime() + input.graceDays * 24 * 60 * 60 * 1000);
  if (input.now.getTime() > windowEndsAt.getTime()) {
    throw new Error("share_out_reversal_window_closed");
  }
}

export function hasLinkedNonzeroShareOutWithdrawal(input: {
  lines: Array<{ finalShareAmount: string; withdrawalId: string | null }>;
}) {
  return input.lines.some((line) => line.withdrawalId && money4ToUnits(line.finalShareAmount) > ZERO);
}

export function isShareOutReversalEligibleForView(input: {
  status: string;
  approvedAt: Date | string | null;
  now: Date;
  graceDays: number;
  lines: Array<{ finalShareAmount: string; withdrawalId: string | null }>;
}) {
  try {
    assertShareOutReversalAllowed(input);
  } catch {
    return false;
  }
  return hasLinkedNonzeroShareOutWithdrawal({ lines: input.lines });
}

export type ShareOutReversalLineInput = {
  id: string;
  memberId: string;
  finalShareAmount: string;
  withdrawalId: string | null;
};

export type ShareOutReversalPlan = {
  shareOutId: string;
  reason: string;
  withdrawalOffsets: Array<{
    lineId: string;
    memberId: string;
    amount: string;
    reversesId: string;
  }>;
};

export function buildShareOutReversalPlan(input: {
  shareOutId: string;
  reason: string;
  lines: ShareOutReversalLineInput[];
}): ShareOutReversalPlan {
  const reason = input.reason.trim();
  if (reason.length < 10) {
    throw new Error("share_out_reversal_reason_min_length");
  }
  const withdrawalOffsets = input.lines.flatMap((line) => {
    const amount = money4ToUnits(line.finalShareAmount);
    if (!line.withdrawalId || amount === ZERO) return [];
    if (amount < ZERO) {
      throw new Error("share_out_reversal_amount_invalid");
    }
    return [{
      lineId: line.id,
      memberId: line.memberId,
      amount: unitsToMoney4(-amount),
      reversesId: line.withdrawalId,
    }];
  });
  if (withdrawalOffsets.length === 0) {
    throw new Error("share_out_reversal_no_paid_lines");
  }
  return {
    shareOutId: input.shareOutId,
    reason,
    withdrawalOffsets,
  };
}
