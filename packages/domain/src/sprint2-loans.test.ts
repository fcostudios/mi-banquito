import { describe, expect, it } from "vitest";
import {
  calculateInterestFirstSplit,
  evaluateLoanEligibility,
  generateReferralCommissionCredit,
  resolveOriginationRate,
} from "./loan";

describe("Sprint 2 loan domain rules", () => {
  it("uses the member rate for member loans and non-member rate for non-member loans", () => {
    const config = {
      memberLoanRateValue: "4.0000",
      nonMemberLoanRateValue: "5.0000",
    };

    expect(resolveOriginationRate(config, "member")).toBe("4.0000");
    expect(resolveOriginationRate(config, "non_member")).toBe("5.0000");
  });

  it("rejects loans that exceed available capital after protected base fund", () => {
    const result = evaluateLoanEligibility({
      requestedPrincipal: "1001.0000",
      availableCapital: "1000.0000",
      borrowerSavingsBalance: "500.0000",
      loanToSavingsCapRatio: "3.00",
      borrowerKind: "member",
      guarantorSavingsBalance: undefined,
    });

    expect(result).toEqual({
      ok: false,
      reason: "No hay suficiente capital disponible sin tocar la cuota base protegida.",
    });
  });

  it("rejects non-member loans without guarantor capacity", () => {
    const result = evaluateLoanEligibility({
      requestedPrincipal: "500.0000",
      availableCapital: "1000.0000",
      borrowerSavingsBalance: "0.0000",
      loanToSavingsCapRatio: "3.00",
      borrowerKind: "non_member",
      guarantorSavingsBalance: undefined,
    });

    if (result.ok) {
      throw new Error("expected non-member eligibility to fail");
    }
    expect(result.reason).toContain("garante");
  });

  it("splits repayments interest first", () => {
    expect(calculateInterestFirstSplit({
      amount: "125.0000",
      accruedInterest: "40.0000",
      outstandingPrincipal: "1000.0000",
    })).toEqual({
      appliedToInterest: "40.0000",
      appliedToPrincipal: "85.0000",
      remainingInterest: "0.0000",
      remainingPrincipal: "915.0000",
      unappliedAmount: "0.0000",
      paidOff: false,
    });
  });

  it("keeps unapplied repayment overage visible", () => {
    expect(calculateInterestFirstSplit({
      amount: "2000.0000",
      accruedInterest: "40.0000",
      outstandingPrincipal: "1000.0000",
    })).toEqual({
      appliedToInterest: "40.0000",
      appliedToPrincipal: "1000.0000",
      remainingInterest: "0.0000",
      remainingPrincipal: "0.0000",
      unappliedAmount: "960.0000",
      paidOff: true,
    });
  });

  it("allows exact loan cap boundaries without binary float drift", () => {
    expect(evaluateLoanEligibility({
      requestedPrincipal: "300.0024",
      availableCapital: "300.0024",
      borrowerSavingsBalance: "100.0008",
      loanToSavingsCapRatio: "3.00",
      borrowerKind: "member",
    })).toEqual({ ok: true });
  });

  it("rejects invalid decimal inputs", () => {
    expect(() => evaluateLoanEligibility({
      requestedPrincipal: "not-money",
      availableCapital: "1000.0000",
      borrowerSavingsBalance: "500.0000",
      loanToSavingsCapRatio: "3.00",
      borrowerKind: "member",
    })).toThrow();
    expect(() => calculateInterestFirstSplit({
      amount: "-1.0000",
      accruedInterest: "40.0000",
      outstandingPrincipal: "1000.0000",
    })).toThrow();
    expect(() => generateReferralCommissionCredit({
      loanStatus: "pagado",
      referralAccruedAt: null,
      referrerMemberId: "22222222-2222-4222-8222-222222222222",
      commissionAmount: "NaN",
      commissionCurrency: "USD",
    })).toThrow();
  });

  it("plans a referral commission exactly once", () => {
    expect(generateReferralCommissionCredit({
      loanStatus: "pagado",
      referralAccruedAt: null,
      referrerMemberId: "22222222-2222-4222-8222-222222222222",
      commissionAmount: "10.0000",
      commissionCurrency: "USD",
    })).toEqual({
      shouldCredit: true,
      withdrawalKind: "referral_commission_credit",
      amount: "10.0000",
      currencyCode: "USD",
      memberId: "22222222-2222-4222-8222-222222222222",
    });

    expect(generateReferralCommissionCredit({
      loanStatus: "pagado",
      referralAccruedAt: new Date("2026-06-30T00:00:00Z"),
      referrerMemberId: "22222222-2222-4222-8222-222222222222",
      commissionAmount: "10.0000",
      commissionCurrency: "USD",
    })).toEqual({ shouldCredit: false });
  });
});
