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

  it("allocates loan phases globally before moving to lower-priority loan buckets", () => {
    const result = allocateMemberPayment({
      ...baseInput,
      amount: "20.0000",
      loanObligations: [
        {
          loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          loanScheduleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          dueOn: "2026-05-01",
          feeDue: "0.0000",
          interestDue: "0.0000",
          principalDue: "30.0000",
        },
        {
          loanId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          loanScheduleId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          loanFeeId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          dueOn: "2026-06-01",
          feeDue: "5.0000",
          interestDue: "7.0000",
          principalDue: "30.0000",
        },
      ],
      contributionObligations: [],
    });

    expect(result.lines.map((line) => [line.kind, line.amount, line.loanId])).toEqual([
      ["loan_fee", "5.0000", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
      ["loan_interest", "7.0000", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
      ["loan_principal", "8.0000", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ]);
    expect(result.unappliedAmount).toBe("0.0000");
  });

  it("requires an extra decision before allocating future contributions", () => {
    const contributionObligations = [
      {
        cycleId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        cycleLabel: "2026-06",
        dueOn: "2026-06-30",
        amountDue: "10.0000",
        kind: "overdue" as const,
      },
      {
        cycleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        cycleLabel: "2026-07",
        dueOn: "2026-07-31",
        amountDue: "15.0000",
        kind: "current" as const,
      },
      {
        cycleId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        cycleLabel: "2026-08",
        dueOn: "2026-08-31",
        amountDue: "20.0000",
        kind: "future" as const,
      },
    ];

    const withoutDecision = allocateMemberPayment({
      ...baseInput,
      amount: "45.0000",
      loanObligations: [],
      contributionObligations,
    });
    const withDecision = allocateMemberPayment({
      ...baseInput,
      amount: "45.0000",
      loanObligations: [],
      contributionObligations,
      extraDecision: "future_contribution",
    });

    expect(withoutDecision.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["contribution_overdue", "10.0000"],
      ["contribution_current", "15.0000"],
    ]);
    expect(withoutDecision.unappliedAmount).toBe("20.0000");
    expect(withoutDecision.requiresExtraDecision).toBe(true);

    expect(withDecision.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["contribution_overdue", "10.0000"],
      ["contribution_current", "15.0000"],
      ["contribution_future", "20.0000"],
    ]);
    expect(withDecision.unappliedAmount).toBe("0.0000");
    expect(withDecision.requiresExtraDecision).toBe(false);
  });

  it("uses a string extra-savings decision to emit an extra savings allocation", () => {
    const result = allocateMemberPayment({
      ...baseInput,
      amount: "25.0000",
      loanObligations: [],
      contributionObligations: [
        {
          cycleId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          cycleLabel: "2026-07",
          dueOn: "2026-07-31",
          amountDue: "20.0000",
          kind: "current",
        },
      ],
      extraDecision: "extra_savings",
    });

    expect(result.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["contribution_current", "20.0000"],
      ["extra_savings", "5.0000"],
    ]);
    expect(result.unappliedAmount).toBe("0.0000");
    expect(result.requiresExtraDecision).toBe(false);
  });

  it("allocates a loan-principal extra decision to prepayable principal", () => {
    const result = allocateMemberPayment({
      ...baseInput,
      amount: "40.0000",
      loanObligations: [
        {
          loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          loanScheduleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          dueOn: "2026-06-01",
          feeDue: "0.0000",
          interestDue: "0.0000",
          principalDue: "30.0000",
          prepayablePrincipal: "25.0000",
        },
      ],
      contributionObligations: [],
      extraDecision: "loan_principal",
    });

    expect(result.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["loan_principal", "30.0000"],
      ["loan_principal", "10.0000"],
    ]);
    expect(result.unappliedAmount).toBe("0.0000");
    expect(result.requiresExtraDecision).toBe(false);
  });

  it("keeps requiring an extra decision when loan-principal has no prepayable principal", () => {
    const result = allocateMemberPayment({
      ...baseInput,
      amount: "40.0000",
      loanObligations: [
        {
          loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          loanScheduleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          dueOn: "2026-06-01",
          feeDue: "0.0000",
          interestDue: "0.0000",
          principalDue: "30.0000",
        },
      ],
      contributionObligations: [],
      extraDecision: "loan_principal",
    });

    expect(result.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["loan_principal", "30.0000"],
    ]);
    expect(result.unappliedAmount).toBe("10.0000");
    expect(result.requiresExtraDecision).toBe(true);
  });

  it("keeps requiring an extra decision when future-contribution capacity is insufficient", () => {
    const result = allocateMemberPayment({
      ...baseInput,
      amount: "50.0000",
      loanObligations: [],
      contributionObligations: [
        {
          cycleId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          cycleLabel: "2026-07",
          dueOn: "2026-07-31",
          amountDue: "20.0000",
          kind: "current",
        },
        {
          cycleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          cycleLabel: "2026-08",
          dueOn: "2026-08-31",
          amountDue: "10.0000",
          kind: "future",
        },
      ],
      extraDecision: "future_contribution",
    });

    expect(result.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["contribution_current", "20.0000"],
      ["contribution_future", "10.0000"],
    ]);
    expect(result.unappliedAmount).toBe("20.0000");
    expect(result.requiresExtraDecision).toBe(true);
  });
});
