import { describe, expect, it } from "vitest";
import {
  evaluateSchemaHealth,
  EXPECTED_CHECK_CONSTRAINT_NAMES,
  EXPECTED_FOREIGN_KEY_CONSTRAINT_NAMES,
  EXPECTED_POLICY_TABLES,
  EXPECTED_FORCED_RLS_TABLE_NAMES,
  EXPECTED_INDEX_NAMES,
  EXPECTED_MATERIALIZED_VIEW_NAMES,
  EXPECTED_RLS_TABLE_NAMES,
  EXPECTED_TABLE_NAMES,
  EXPECTED_TRIGGER_TABLES,
  EXPECTED_UNIQUE_CONSTRAINT_NAMES,
  EXPECTED_UPDATED_AT_TABLES,
  REQUIRED_FUNCTIONS,
  parseExpectedSchema,
} from "./verify-schema.mjs";

describe("schema verifier", () => {
  it("ignores quoted dynamic trigger templates when deriving static expectations", () => {
    const parsed = parseExpectedSchema(`
      EXECUTE format('CREATE TRIGGER fake BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION f()', table_name);
      CREATE TRIGGER real BEFORE INSERT ON contribution FOR EACH ROW EXECUTE FUNCTION f();
      SELECT 1 FROM account a ON a.id = a.id;
    `);
    expect(parsed.triggerTables).toEqual(["contribution"]);
  });

  it("passes when tables, RLS, policies, triggers, and updated_at triggers match expectations", () => {
    const result = evaluateSchemaHealth({
      tableNames: EXPECTED_TABLE_NAMES,
      rlsTableNames: EXPECTED_RLS_TABLE_NAMES,
      forcedRlsTableNames: EXPECTED_FORCED_RLS_TABLE_NAMES,
      policyTables: EXPECTED_POLICY_TABLES,
      failClosedPolicyTables: EXPECTED_POLICY_TABLES,
      triggerTables: EXPECTED_TRIGGER_TABLES,
      materializedViewNames: EXPECTED_MATERIALIZED_VIEW_NAMES,
      indexNames: EXPECTED_INDEX_NAMES,
      checkConstraintNames: EXPECTED_CHECK_CONSTRAINT_NAMES,
      uniqueConstraintNames: EXPECTED_UNIQUE_CONSTRAINT_NAMES,
      foreignKeyConstraintNames: EXPECTED_FOREIGN_KEY_CONSTRAINT_NAMES,
      functionNames: REQUIRED_FUNCTIONS,
      updatedAtTables: EXPECTED_UPDATED_AT_TABLES,
      updatedAtTriggerTables: EXPECTED_UPDATED_AT_TABLES,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails when tenant policies exist but are not fail closed", () => {
    const result = evaluateSchemaHealth({
      tableNames: EXPECTED_TABLE_NAMES,
      rlsTableNames: EXPECTED_RLS_TABLE_NAMES,
      forcedRlsTableNames: EXPECTED_FORCED_RLS_TABLE_NAMES,
      policyTables: EXPECTED_POLICY_TABLES,
      failClosedPolicyTables: EXPECTED_POLICY_TABLES.slice(1),
      triggerTables: EXPECTED_TRIGGER_TABLES,
      materializedViewNames: EXPECTED_MATERIALIZED_VIEW_NAMES,
      indexNames: EXPECTED_INDEX_NAMES,
      checkConstraintNames: EXPECTED_CHECK_CONSTRAINT_NAMES,
      uniqueConstraintNames: EXPECTED_UNIQUE_CONSTRAINT_NAMES,
      foreignKeyConstraintNames: EXPECTED_FOREIGN_KEY_CONSTRAINT_NAMES,
      functionNames: REQUIRED_FUNCTIONS,
      updatedAtTables: EXPECTED_UPDATED_AT_TABLES,
      updatedAtTriggerTables: EXPECTED_UPDATED_AT_TABLES,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `missing fail-closed policies on tables: ${EXPECTED_POLICY_TABLES[0]}`,
    );
  });

  it("fails when drizzle push creates tables but no RLS policies or triggers", () => {
    const result = evaluateSchemaHealth({
      tableNames: EXPECTED_TABLE_NAMES,
      rlsTableNames: [],
      policyTables: [],
      triggerTables: [],
      updatedAtTables: EXPECTED_UPDATED_AT_TABLES,
      updatedAtTriggerTables: [],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(`expected ${EXPECTED_RLS_TABLE_NAMES.length} RLS-enabled tables, found 0`);
    expect(result.errors).toContain(`expected ${EXPECTED_FORCED_RLS_TABLE_NAMES.length} forced RLS tables, found 0`);
    expect(result.errors).toContain(`expected ${EXPECTED_POLICY_TABLES.length} policies on tables, found 0`);
    expect(result.errors).toContain(`expected ${EXPECTED_TRIGGER_TABLES.length} triggers on tables, found 0`);
    expect(result.errors).toContain(`expected ${EXPECTED_MATERIALIZED_VIEW_NAMES.length} materialized views, found 0`);
    expect(result.errors).toContain(`expected ${EXPECTED_INDEX_NAMES.length} indexes, found 0`);
    expect(result.errors).toContain(`expected ${EXPECTED_CHECK_CONSTRAINT_NAMES.length} check constraints, found 0`);
    expect(result.errors).toContain(`expected ${EXPECTED_UNIQUE_CONSTRAINT_NAMES.length} unique constraints, found 0`);
    expect(result.errors).toContain(`expected ${EXPECTED_FOREIGN_KEY_CONSTRAINT_NAMES.length} foreign key constraints, found 0`);
  });

  it("derives Sprint 2 table and tenant-RLS expectations from migrations", () => {
    expect(EXPECTED_TABLE_NAMES).toEqual(expect.arrayContaining([
      "cron_run",
      "loan_guarantor",
      "loan_referral",
      "non_member_borrower",
    ]));
    expect(EXPECTED_RLS_TABLE_NAMES).toEqual(expect.arrayContaining([
      "loan_guarantor",
      "loan_referral",
      "non_member_borrower",
    ]));
    expect(EXPECTED_FORCED_RLS_TABLE_NAMES).toEqual(expect.arrayContaining([
      "loan_guarantor",
      "loan_referral",
      "non_member_borrower",
    ]));
    expect(EXPECTED_POLICY_TABLES).toEqual(expect.arrayContaining([
      "loan_guarantor",
      "loan_referral",
      "non_member_borrower",
    ]));
    expect(EXPECTED_RLS_TABLE_NAMES).not.toContain("cron_run");
    expect(EXPECTED_MATERIALIZED_VIEW_NAMES).toEqual(expect.arrayContaining([
      "mv_cash_balances",
      "mv_member_compliance_state",
    ]));
    expect(EXPECTED_INDEX_NAMES).toEqual(expect.arrayContaining([
      "idx_mv_cash_balances_org_id",
      "uq_reconciliation_cycle_org_cycle_regular",
      "uq_reconciliation_cycle_org_period_close_adjustment",
    ]));
    expect(EXPECTED_CHECK_CONSTRAINT_NAMES).toEqual(expect.arrayContaining([
      "ck_loan_exactly_one_borrower",
      "ck_reconciliation_cycle_adjustment_payload",
    ]));
    expect(EXPECTED_UNIQUE_CONSTRAINT_NAMES).toEqual(expect.arrayContaining([
      "uq_interest_accrual_loan_id_accrued_on",
      "uq_loan_fee_loan_id_fee_kind_accrued_on",
      "uq_repayment_org_id_client_request_id",
      "uq_base_fund_quota_config_org_id_fiscal_year",
      "uq_loan_guarantor_loan_id_guarantor_member_id_assumed_at",
      "uq_loan_referral_loan_id",
    ]));
    expect(EXPECTED_UNIQUE_CONSTRAINT_NAMES).not.toContain("uq_reconciliation_cycle_org_id_cycle_id");
    expect(EXPECTED_FOREIGN_KEY_CONSTRAINT_NAMES).toEqual(expect.arrayContaining([
      "fk_loan_borrower_member_id",
      "fk_loan_borrower_non_member_id",
      "fk_loan_referrer_member_id",
      "fk_loan_guarantor_loan_id",
      "fk_loan_guarantor_guarantor_member_id",
      "fk_loan_referral_loan_id",
      "fk_loan_referral_referrer_member_id",
      "fk_loan_referral_withdrawal_id",
    ]));
  });

  it("requires Sprint 3 period-lock enforcement function", () => {
    expect(REQUIRED_FUNCTIONS).toEqual(expect.arrayContaining([
      "enforce_period_lock",
      "raise_append_only_violation",
    ]));
  });

  it("fails when a table with updated_at is missing an update trigger", () => {
    const result = evaluateSchemaHealth({
      tableNames: EXPECTED_TABLE_NAMES,
      rlsTableNames: EXPECTED_RLS_TABLE_NAMES,
      forcedRlsTableNames: EXPECTED_FORCED_RLS_TABLE_NAMES,
      policyTables: EXPECTED_POLICY_TABLES,
      triggerTables: EXPECTED_TRIGGER_TABLES,
      materializedViewNames: EXPECTED_MATERIALIZED_VIEW_NAMES,
      indexNames: EXPECTED_INDEX_NAMES,
      checkConstraintNames: EXPECTED_CHECK_CONSTRAINT_NAMES,
      uniqueConstraintNames: EXPECTED_UNIQUE_CONSTRAINT_NAMES,
      foreignKeyConstraintNames: EXPECTED_FOREIGN_KEY_CONSTRAINT_NAMES,
      functionNames: REQUIRED_FUNCTIONS,
      updatedAtTables: ["member", "loan"],
      updatedAtTriggerTables: ["member"],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "missing updated_at update triggers on: loan"
    );
  });
});
