import { describe, expect, it } from "vitest";

import { currentEcuadorDateString, isPromiseDateOnOrAfterToday, loanRepaymentFormSchema } from "./index";

describe("Sprint 4 contract validation helpers", () => {
  it("uses Ecuador's local date for promise validation near a UTC day boundary", () => {
    const boundary = new Date("2026-07-04T02:00:00.000Z");

    expect(currentEcuadorDateString(boundary)).toBe("2026-07-03");
    expect(isPromiseDateOnOrAfterToday("2026-07-03", currentEcuadorDateString(boundary))).toBe(true);
    expect(isPromiseDateOnOrAfterToday("2026-07-02", currentEcuadorDateString(boundary))).toBe(false);
  });
});

describe("loan repayment contract", () => {
  const validRepayment = {
    clientRequestId: "33333333-3333-4333-8333-333333333333",
    loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    accountId: "99999999-9999-4999-8999-999999999999",
    amount: "100.00",
    datedOn: "2026-07-02",
  };

  it("rejects a repayment when its allocation mode was not explicitly selected", () => {
    expect(loanRepaymentFormSchema.safeParse(validRepayment).success).toBe(false);
    expect(loanRepaymentFormSchema.safeParse({
      ...validRepayment,
      paymentMode: "principal_payment",
    }).success).toBe(true);
  });
});
