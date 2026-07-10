import { describe, expect, it } from "vitest";
import { contribution, paymentAllocation, paymentReceipt, repayment } from "./schema";

describe("BR-26 payment receipt schema", () => {
  it("exposes receipt and allocation tables with child row links", () => {
    expect(paymentReceipt.memberId.name).toBe("member_id");
    expect(paymentReceipt.clientRequestId.name).toBe("client_request_id");
    expect(paymentReceipt.extraDecision.name).toBe("extra_decision");
    expect(paymentAllocation.receiptId.name).toBe("receipt_id");
    expect(paymentAllocation.allocationKind.name).toBe("allocation_kind");
    expect(paymentAllocation.brId.name).toBe("br_id");
    expect(paymentAllocation.groupConfigVersion.name).toBe("group_config_version");
    expect(contribution.paymentReceiptId.name).toBe("payment_receipt_id");
    expect(repayment.paymentReceiptId.name).toBe("payment_receipt_id");
  });
});
