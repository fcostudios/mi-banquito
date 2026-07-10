import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { contribution, paymentAllocation, paymentReceipt, repayment } from "./schema";

const migration = readFileSync(
  new URL("./migrations/V20260709190000__br26_payment_receipts.sql", import.meta.url),
  "utf8",
);
const repairMigration = readFileSync(
  new URL("./migrations/V20260709193000__br26_payment_receipt_integrity_repair.sql", import.meta.url),
  "utf8",
);

const foreignKeySummary = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).foreignKeys.map((foreignKey) => {
    const reference = foreignKey.reference();

    return {
      columns: reference.columns.map((column) => column.name),
      foreignColumns: reference.foreignColumns.map((column) => column.name),
      name: foreignKey.getName(),
    };
  });

const uniqueConstraintSummary = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).uniqueConstraints.map((constraint) => ({
    columns: constraint.columns.map((column) => column.name),
    name: constraint.name,
  }));

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
    expect(uniqueConstraintSummary(paymentReceipt)).toContainEqual({
      columns: ["org_id", "client_request_id"],
      name: "uq_payment_receipt_org_client_request",
    });
    expect(migration).toContain("uq_payment_receipt_org_member_id");
    expect(migration).toContain("FOREIGN KEY (org_id, member_id, receipt_id)");
    expect(migration).toContain("FOREIGN KEY (org_id, member_id, payment_receipt_id)");
  });

  it("models receipt links as composite foreign keys in Drizzle", () => {
    expect(foreignKeySummary(contribution)).toContainEqual({
      columns: ["org_id", "member_id", "payment_receipt_id"],
      foreignColumns: ["org_id", "member_id", "id"],
      name: "fk_contribution_payment_receipt_org_member",
    });
    expect(foreignKeySummary(contribution)).not.toContainEqual({
      columns: ["payment_receipt_id"],
      foreignColumns: ["id"],
      name: "contribution_payment_receipt_id_payment_receipt_id_fk",
    });

    expect(foreignKeySummary(repayment)).toContainEqual({
      columns: ["org_id", "member_id", "payment_receipt_id"],
      foreignColumns: ["org_id", "member_id", "id"],
      name: "fk_repayment_payment_receipt_org_member",
    });
    expect(foreignKeySummary(repayment)).not.toContainEqual({
      columns: ["payment_receipt_id"],
      foreignColumns: ["id"],
      name: "repayment_payment_receipt_id_payment_receipt_id_fk",
    });
  });

  it("models allocation-to-child composite integrity in Drizzle", () => {
    expect(uniqueConstraintSummary(paymentAllocation)).toContainEqual({
      columns: ["org_id", "receipt_id", "sort_order"],
      name: "uq_payment_allocation_receipt_order",
    });
    expect(uniqueConstraintSummary(contribution)).toContainEqual({
      columns: ["org_id", "member_id", "payment_receipt_id", "id"],
      name: "uq_contribution_org_member_receipt_id",
    });
    expect(uniqueConstraintSummary(repayment)).toContainEqual({
      columns: ["org_id", "member_id", "payment_receipt_id", "id"],
      name: "uq_repayment_org_member_receipt_id",
    });

    expect(foreignKeySummary(paymentAllocation)).toContainEqual({
      columns: ["org_id", "member_id", "receipt_id", "contribution_id"],
      foreignColumns: ["org_id", "member_id", "payment_receipt_id", "id"],
      name: "fk_payment_allocation_contribution_org_member_receipt",
    });
    expect(foreignKeySummary(paymentAllocation)).toContainEqual({
      columns: ["org_id", "member_id", "receipt_id", "repayment_id"],
      foreignColumns: ["org_id", "member_id", "payment_receipt_id", "id"],
      name: "fk_payment_allocation_repayment_org_member_receipt",
    });
  });

  it("ships an append-only repair migration for deployed BR-26 schemas", () => {
    expect(repairMigration).toContain("uq_payment_receipt_org_member_id");
    expect(repairMigration).toContain("fk_payment_allocation_receipt_org_member");
    expect(repairMigration).toContain("fk_contribution_payment_receipt_org_member");
    expect(repairMigration).toContain("fk_repayment_payment_receipt_org_member");
    expect(repairMigration).toContain("uq_contribution_org_member_receipt_id");
    expect(repairMigration).toContain("uq_repayment_org_member_receipt_id");
    expect(repairMigration).toContain("fk_payment_allocation_contribution_org_member_receipt");
    expect(repairMigration).toContain("fk_payment_allocation_repayment_org_member_receipt");
    expect(repairMigration).toContain("NULLIF(current_setting('app.current_org_id', true), '')::uuid");
  });
});
