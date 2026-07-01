import type { ReferralCommissionPlan } from "./types";

function money4(value: string): string {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) {
    throw new Error("money value must be a non-negative decimal with up to 4 places");
  }
  return Number(value).toFixed(4);
}

export function generateReferralCommissionCredit(input: {
  loanStatus: string;
  referralAccruedAt: Date | null;
  referrerMemberId?: string | null;
  commissionAmount: string;
  commissionCurrency: string;
}): ReferralCommissionPlan {
  if (input.loanStatus !== "pagado" || input.referralAccruedAt || !input.referrerMemberId) {
    return { shouldCredit: false };
  }

  return {
    shouldCredit: true,
    withdrawalKind: "referral_commission_credit",
    memberId: input.referrerMemberId,
    amount: money4(input.commissionAmount),
    currencyCode: input.commissionCurrency,
  };
}
