import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contribution, paymentAllocation, paymentReceipt, repayment } from "./schema";

const migration = readFileSync(
  new URL("./migrations/V20260709190000__br26_payment_receipts.sql", import.meta.url),
  "utf8",
);

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

  it("uses the fail-closed tenant setting in receipt RLS policies", () => {
    expect(migration).toContain("app.current_org_id");
    expect(migration).not.toContain("current_setting('app.current_org')");
    expect(migration).toContain("NULLIF(current_setting('app.current_org_id', true), '')::uuid");
  });

  it("enforces org and member integrity for receipt child links", () => {
    expect(migration).toContain("uq_payment_receipt_org_member_id");
    expect(migration).toContain("FOREIGN KEY (org_id, member_id, receipt_id)");
    expect(migration).toContain("FOREIGN KEY (org_id, member_id, payment_receipt_id)");
  });
});
