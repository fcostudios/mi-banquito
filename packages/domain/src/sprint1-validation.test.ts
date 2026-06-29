import { describe, expect, it } from "vitest";
import {
  addMemberFormSchema,
  contributionFormSchema,
  groupConfigFormSchema,
  organizationCreateFormSchema,
  reverseContributionFormSchema,
} from "@mi-banquito/contracts";

describe("Sprint 1 form contracts", () => {
  it("defaults organization locale fields", () => {
    const parsed = organizationCreateFormSchema.parse({ displayName: "Banquito Norte" });
    expect(parsed.countryCode).toBe("EC");
    expect(parsed.currencyCode).toBe("USD");
    expect(parsed.timezone).toBe("America/Guayaquil");
    expect(parsed.defaultLanguage).toBe("es-EC");
  });

  it("rejects invalid WhatsApp and negative savings", () => {
    expect(() => addMemberFormSchema.parse({
      displayName: "Ana",
      joinedOn: "2026-06-29",
      whatsappNumber: "099",
      initialSavingsBalance: "-1",
    })).toThrow();
  });

  it("requires reversal reason", () => {
    expect(() => reverseContributionFormSchema.parse({ contributionId: crypto.randomUUID(), reason: "" })).toThrow();
  });

  it("keeps loan period units explicit", () => {
    const parsed = groupConfigFormSchema.parse({
      contributionCycleKind: "monthly",
      contributionAmount: "20",
      opensOnDay: 1,
      loanRateModel: "declining_balance",
      memberLoanRateValue: "4",
      nonMemberLoanRateValue: "5",
      loanRatePeriodUnit: "monthly",
      loanGracePeriods: 0,
      loanToSavingsCapRatio: "2",
      adminFeePct: "1",
      referralCommissionAmount: "5",
      treasurerCompensationKind: "fixed",
      treasurerCompensationAmount: "10",
      treasurerCompensationPeriod: "monthly",
      baseFundQuotaFiscalYear: 2026,
      baseFundQuotaAmount: "25",
      fiscalYearStartMonth: 1,
      fiscalYearStartDay: 1,
      yearEndShareOutFormula: "proportional_time_weighted",
      reconciliationToleranceAmount: "1",
      lateThresholdDays: 3,
      moraThresholdDays: 15,
    });
    expect(parsed.loanRatePeriodUnit).toBe("monthly");
  });

  it("requires contribution idempotency key", () => {
    expect(() => contributionFormSchema.parse({
      memberId: crypto.randomUUID(),
      amount: "10",
      datedOn: "2026-06-29",
    })).toThrow();
  });
});
