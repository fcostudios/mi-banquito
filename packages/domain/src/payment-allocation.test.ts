import { describe, expect, it } from "vitest";
import { allocateMemberPayment } from "./payments";

const baseInput = {
  orgId: "11111111-1111-4111-8111-111111111111",
  memberId: "22222222-2222-4222-8222-222222222222",
  amount: "90.0000",
  currencyCode: "USD",
  datedOn: "2026-07-09",
  groupConfigVersion: 3,
};

describe("BR-26 allocateMemberPayment", () => {
  it("allocates loan fee, interest, principal, overdue aporte, and current aporte in strict order", () => {
    const result = allocateMemberPayment({
      ...baseInput,
      loanObligations: [
        {
          loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          loanScheduleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          loanFeeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          dueOn: "2026-06-01",
          feeDue: "5.0000",
          interestDue: "10.0000",
          principalDue: "30.0000",
        },
      ],
      contributionObligations: [
        {
          cycleId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          cycleLabel: "2026-06",
          dueOn: "2026-06-30",
          amountDue: "20.0000",
          kind: "overdue",
        },
        {
          cycleId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          cycleLabel: "2026-07",
          dueOn: "2026-07-31",
          amountDue: "20.0000",
          kind: "current",
        },
      ],
    });

    expect(result.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["loan_fee", "5.0000"],
      ["loan_interest", "10.0000"],
      ["loan_principal", "30.0000"],
      ["contribution_overdue", "20.0000"],
      ["contribution_current", "20.0000"],
    ]);
    expect(result.unappliedAmount).toBe("5.0000");
    expect(result.requiresExtraDecision).toBe(true);
  });

  it("does not allocate more than each obligation", () => {
    const result = allocateMemberPayment({
      ...baseInput,
      amount: "12.0000",
      loanObligations: [
        {
          loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          loanScheduleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          dueOn: "2026-06-01",
          feeDue: "0.0000",
          interestDue: "10.0000",
          principalDue: "30.0000",
        },
      ],
      contributionObligations: [],
    });

    expect(result.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["loan_interest", "10.0000"],
      ["loan_principal", "2.0000"],
    ]);
    expect(result.unappliedAmount).toBe("0.0000");
  });
});
