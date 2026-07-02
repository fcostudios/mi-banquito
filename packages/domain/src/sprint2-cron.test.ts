import { describe, expect, it } from "vitest";
import {
  calculateDailyInterestAmount,
  planLoanAccruals,
  resolveDateRange,
} from "./loans/accrual";

const loan = {
  id: "loan-1",
  orgId: "org-1",
  principalAmount: "1200.0000",
  currencyCode: "USD",
  rateValue: "3.0000",
  originatedOn: "2026-06-29",
  status: "activo",
};

describe("Sprint 2 cron accrual domain rules", () => {
  it("resolves inclusive replay ranges with ISO date validation", () => {
    expect(resolveDateRange("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
    expect(() => resolveDateRange("2026-07-03", "2026-07-01")).toThrow("from_date");
    expect(() => resolveDateRange("07/01/2026", "2026-07-03")).toThrow("ISO");
  });

  it("calculates daily interest with decimal(18,4) precision", () => {
    expect(calculateDailyInterestAmount({
      principalBasis: "1200.0000",
      rateValue: "3.0000",
      periodDays: 30,
    })).toBe("1.2000");
  });

  it("plans only missing daily interest accruals for active loans", () => {
    const plan = planLoanAccruals({
      loan,
      schedules: [],
      configs: [{
        version: 1,
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null,
        moraThresholdDays: 15,
        config: {},
      }],
      accrualDates: resolveDateRange("2026-07-01", "2026-07-03"),
      existingAccrualDates: new Set(["2026-07-02"]),
      existingMoraFeeKeys: new Set(),
    });

    expect(plan.interestAccruals.map((row) => row.accruedOn)).toEqual([
      "2026-07-01",
      "2026-07-03",
    ]);
    expect(plan.interestAccruals).toEqual([
      expect.objectContaining({
        loanId: "loan-1",
        orgId: "org-1",
        principalBasis: "1200.0000",
        periodDays: 30,
        rateValue: "3.0000",
        interestAmount: "1.2000",
      }),
      expect.objectContaining({
        loanId: "loan-1",
        orgId: "org-1",
        principalBasis: "1200.0000",
        periodDays: 30,
        rateValue: "3.0000",
        interestAmount: "1.2000",
      }),
    ]);
  });

  it("accrues daily interest on remaining principal after repayments", () => {
    const plan = planLoanAccruals({
      loan: { ...loan, principalAmount: "100.0000", rateValue: "5.0000" },
      schedules: [],
      configs: [{
        version: 1,
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null,
        moraThresholdDays: 15,
        config: {},
      }],
      accrualDates: ["2026-07-02"],
      existingAccrualDates: new Set(),
      existingMoraFeeKeys: new Set(),
      principalRepayments: [{ datedOn: "2026-07-02", appliedToPrincipal: "16.0000" }],
    });

    expect(plan.interestAccruals).toEqual([
      expect.objectContaining({
        principalBasis: "84.0000",
        interestAmount: "0.1400",
      }),
    ]);
  });

  it("caps mora to the overdue installment and resolves config per accrual day", () => {
    const plan = planLoanAccruals({
      loan,
      schedules: [{
        id: "schedule-1",
        dueOn: "2026-06-01",
        principalDue: "10.0000",
        interestDue: "2.0000",
        paidPrincipalToDate: "0.0000",
        paidInterestToDate: "0.0000",
        status: "en_mora",
      }],
      configs: [
        {
          version: 1,
          validFrom: "2026-01-01T00:00:00.000Z",
          validTo: "2026-07-02T00:00:00.000Z",
          moraThresholdDays: 15,
          config: {
            mora: {
              mechanic: "flat_per_day",
              per_day_amount: "20.0000",
              cap: "overdue_installment",
              scope: "loans",
            },
          },
        },
        {
          version: 2,
          validFrom: "2026-07-02T00:00:00.000Z",
          validTo: null,
          moraThresholdDays: 15,
          config: {
            mora: {
              mechanic: "flat_per_day",
              per_day_amount: "0.2500",
              cap: "none",
              scope: "loans",
            },
          },
        },
      ],
      accrualDates: resolveDateRange("2026-07-01", "2026-07-02"),
      existingAccrualDates: new Set(),
      existingMoraFeeKeys: new Set(),
    });

    expect(plan.moraFees).toEqual([
      expect.objectContaining({
        loanId: "loan-1",
        loanScheduleId: "schedule-1",
        accruedOn: "2026-07-01",
        amount: "12.0000",
        groupConfigVersion: 1,
      }),
      expect.objectContaining({
        loanId: "loan-1",
        loanScheduleId: "schedule-1",
        accruedOn: "2026-07-02",
        amount: "0.2500",
        groupConfigVersion: 2,
      }),
    ]);
  });
});
