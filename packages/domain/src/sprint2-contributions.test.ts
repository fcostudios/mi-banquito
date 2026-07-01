import { describe, expect, it } from "vitest";

import type { ContributionForm } from "@mi-banquito/contracts";

describe("Sprint 2 contribution source and partial state", () => {
  it("keeps source and kind available for ledger persistence", () => {
    const input = {
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      amount: "10.0000",
      datedOn: "2026-06-30",
      paymentSource: "cash_in_meeting",
      kind: "partial",
      slipPhotoId: "",
    } satisfies ContributionForm;

    expect(input.paymentSource).toBe("cash_in_meeting");
    expect(input.kind).toBe("partial");
  });
});
