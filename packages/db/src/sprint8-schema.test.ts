import { existsSync, readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  account,
  contribution,
  expense,
  expense_category_enum,
  extraordinary_collection_line_reconciliation_status_enum,
  reconciliation_status_enum,
  repayment,
  transfer,
} from "./schema";

const migration = readFileSync(
  new URL("./migrations/V20260711151757__sprint_8_accounts_movements.sql", import.meta.url),
  "utf8",
);
const accountIdempotencyMigrationUrl = new URL(
  "./migrations/V20260711163545__account_client_request_id.sql",
  import.meta.url,
);
const accountIdempotencyMigration = existsSync(accountIdempotencyMigrationUrl)
  ? readFileSync(accountIdempotencyMigrationUrl, "utf8")
  : "";
const liveMovementMigrationUrl = new URL(
  "./migrations/V20260711234500__expense_notes_and_live_movement_reads.sql",
  import.meta.url,
);
const liveMovementMigration = existsSync(liveMovementMigrationUrl)
  ? readFileSync(liveMovementMigrationUrl, "utf8")
  : "";
const qualityMigrationUrl = new URL(
  "./migrations/V20260712223000__task4_quality_guards.sql",
  import.meta.url,
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

const indexSummary = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).indexes.map((tableIndex) => ({
    name: tableIndex.config.name,
    partial: tableIndex.config.where !== undefined,
    unique: tableIndex.config.unique,
  }));

const uniqueConstraintSummary = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).uniqueConstraints.map((constraint) => ({
    columns: constraint.columns.map((column) => column.name),
    name: constraint.name,
  }));

describe("Sprint 8 account and movement schema", () => {
  it("exposes account and regularization columns required by BR-12 and BR-13", () => {
    expect(account.isGroupFund.name).toBe("is_group_fund");
    expect(account.clientRequestId.name).toBe("client_request_id");
    expect(account.clientRequestId.notNull).toBe(false);
    expect(expense.accountId.name).toBe("account_id");
    expect(expense.accountId.notNull).toBe(false);
    expect(expense.category.name).toBe("category");
    expect(expense.clientRequestId.name).toBe("client_request_id");
    expect(expense.clientRequestId.notNull).toBe(false);
    expect(expense.slipPhotoId.name).toBe("slip_photo_id");
    expect(expense.slipPhotoId.notNull).toBe(false);
    expect(expense.notes.name).toBe("notes");
    expect(expense.notes.notNull).toBe(false);
    expect(contribution.accountId.name).toBe("account_id");
    expect(contribution.accountId.notNull).toBe(false);
    expect(contribution.reconciliationStatus.name).toBe("reconciliation_status");
    expect(repayment.accountId.name).toBe("account_id");
    expect(repayment.accountId.notNull).toBe(false);
    expect(repayment.reconciliationStatus.name).toBe("reconciliation_status");
    expect(transfer.regularizesKind.name).toBe("regularizes_kind");
    expect(transfer.regularizesId.name).toBe("regularizes_id");
    expect(transfer.clientRequestId.name).toBe("client_request_id");
    expect(transfer.clientRequestId.notNull).toBe(false);
  });

  it("ships an append-only expense notes migration that removes movement MV refresh", () => {
    expect(liveMovementMigration).toContain("ALTER TABLE expense ADD COLUMN IF NOT EXISTS notes text");
    expect(liveMovementMigration).toContain("DROP FUNCTION IF EXISTS refresh_movement_read_models()");
    expect(liveMovementMigration).not.toContain("REFRESH MATERIALIZED VIEW");
  });

  it("uses shared PostgreSQL enums with required values and defaults", () => {
    expect(expense_category_enum.enumValues).toEqual([
      "bank_fee",
      "supplies",
      "shared_expense",
      "operating",
      "solidarity_payout",
      "treasurer_comp_payout",
    ]);
    expect(expense.category.enumValues).toEqual(expense_category_enum.enumValues);
    expect(expense.category.getSQLType()).toBe("expense_category_enum");
    expect(expense.category.notNull).toBe(true);
    expect(expense.category.default).toBeUndefined();

    expect(reconciliation_status_enum).toBe(
      extraordinary_collection_line_reconciliation_status_enum,
    );
    expect(reconciliation_status_enum.enumName).toBe(
      "extraordinary_collection_line_reconciliation_status_enum",
    );
    expect(reconciliation_status_enum.enumValues).toEqual(["pending", "regularized"]);
    expect(contribution.reconciliationStatus.enumValues).toEqual(
      reconciliation_status_enum.enumValues,
    );
    expect(contribution.reconciliationStatus.getSQLType()).toBe(
      "extraordinary_collection_line_reconciliation_status_enum",
    );
    expect(contribution.reconciliationStatus.notNull).toBe(true);
    expect(contribution.reconciliationStatus.default).toBe("regularized");
    expect(repayment.reconciliationStatus.enumValues).toEqual(
      reconciliation_status_enum.enumValues,
    );
    expect(repayment.reconciliationStatus.getSQLType()).toBe(
      "extraordinary_collection_line_reconciliation_status_enum",
    );
    expect(repayment.reconciliationStatus.notNull).toBe(true);
    expect(repayment.reconciliationStatus.default).toBe("regularized");
  });

  it("models named movement foreign keys without introspection drift", () => {
    expect(foreignKeySummary(expense)).toEqual(expect.arrayContaining([
      {
        columns: ["account_id"],
        foreignColumns: ["id"],
        name: "fk_expense_account_id",
      },
      {
        columns: ["slip_photo_id"],
        foreignColumns: ["id"],
        name: "fk_expense_slip_photo_id",
      },
    ]));
    expect(foreignKeySummary(contribution)).toContainEqual({
      columns: ["account_id"],
      foreignColumns: ["id"],
      name: "fk_contribution_account_id",
    });
    expect(foreignKeySummary(repayment)).toContainEqual({
      columns: ["account_id"],
      foreignColumns: ["id"],
      name: "fk_repayment_account_id",
    });
    expect(foreignKeySummary(repayment)).not.toContainEqual({
      columns: ["account_id"],
      foreignColumns: ["id"],
      name: "repayment_account_id_account_id_fk",
    });
    expect(migration).toContain(
      "CONSTRAINT fk_expense_account_id FOREIGN KEY (account_id) REFERENCES account(id)",
    );
    expect(migration).toContain(
      "CONSTRAINT fk_expense_slip_photo_id FOREIGN KEY (slip_photo_id) REFERENCES slip_photo(id)",
    );
    expect(migration).toContain(
      "CONSTRAINT fk_contribution_account_id FOREIGN KEY (account_id) REFERENCES account(id)",
    );
    expect(migration).toContain(
      "CONSTRAINT fk_repayment_account_id FOREIGN KEY (account_id) REFERENCES account(id)",
    );
  });

  it("declares lookup indexes, idempotency, and distinct transfer accounts", () => {
    expect(indexSummary(account)).toContainEqual({
      name: "idx_account_org_group_fund",
      partial: false,
      unique: false,
    });
    expect(indexSummary(account)).toContainEqual({
      name: "uq_account_org_client_request",
      partial: false,
      unique: true,
    });
    expect(indexSummary(expense)).toContainEqual({
      name: "idx_expense_org_account_date",
      partial: false,
      unique: false,
    });
    expect(uniqueConstraintSummary(expense)).toContainEqual({
      columns: ["org_id", "client_request_id"],
      name: "uq_expense_org_id_client_request_id",
    });
    expect(indexSummary(expense)).not.toContainEqual(expect.objectContaining({
      name: "uq_expense_org_client_request",
    }));
    expect(indexSummary(contribution)).toContainEqual({
      name: "idx_contribution_org_reconciliation",
      partial: false,
      unique: false,
    });
    expect(indexSummary(repayment)).toContainEqual({
      name: "idx_repayment_org_reconciliation",
      partial: false,
      unique: false,
    });
    expect(indexSummary(transfer)).toContainEqual({
      name: "uq_transfer_org_client_request",
      partial: true,
      unique: true,
    });
    expect(getTableConfig(transfer).checks.map((constraint) => constraint.name))
      .toContain("ck_transfer_distinct_accounts");
    expect(migration).toContain("ON account(org_id, is_group_fund, status)");
    expect(existsSync(accountIdempotencyMigrationUrl)).toBe(true);
    expect(accountIdempotencyMigration).toContain("ADD COLUMN IF NOT EXISTS client_request_id uuid");
    expect(accountIdempotencyMigration).toContain("ON account(org_id, client_request_id)");
    expect(migration).toContain("ON expense(org_id, account_id, incurred_on)");
    expect(migration).toContain(
      "ON contribution(org_id, reconciliation_status, dated_on)",
    );
    expect(migration).toContain("ON repayment(org_id, reconciliation_status, dated_on)");
    expect(migration).toContain("ON transfer(org_id, client_request_id)");
    expect(migration).toContain("WHERE client_request_id IS NOT NULL");
  });

  it("adds required expense category without row DML and protects legacy transfers", () => {
    expect(migration).not.toMatch(/\bUPDATE\s+expense\b/i);
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS category expense_category_enum NOT NULL DEFAULT 'operating'/,
    );
    expect(migration).toContain("ALTER COLUMN category DROP DEFAULT");
    expect(migration).toContain("CHECK (from_account_id <> to_account_id) NOT VALID");
    expect(migration).not.toContain("CREATE TYPE reconciliation_status_enum");
    expect(migration).toContain(
      "reconciliation_status extraordinary_collection_line_reconciliation_status_enum",
    );
    expect(migration).not.toContain("uq_expense_org_client_request");
    expect(migration).not.toContain("ALTER TABLE account");
    expect(migration).not.toContain("uq_account_org_client_request");
  });

  it("ships upgraded-database close uniqueness and cumulative regularization guards", () => {
    expect(existsSync(qualityMigrationUrl)).toBe(true);
    const qualityMigration = readFileSync(qualityMigrationUrl, "utf8");
    expect(qualityMigration).toContain("uq_period_close_org_id_cycle_id");
    expect(qualityMigration).toContain("UNIQUE (org_id, cycle_id)");
    expect(qualityMigration).toContain("regularization_amount_exceeds_remaining");
    expect(qualityMigration).toContain("pg_advisory_xact_lock");
    expect(qualityMigration).toContain("statement_archive");
    expect(qualityMigration).toContain("canonical_payload");
  });
});
