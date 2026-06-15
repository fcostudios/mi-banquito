import { describe, expect, it } from "vitest";
import {
  evaluateSchemaHealth,
  EXPECTED_POLICY_TABLES,
  EXPECTED_RLS_TABLE_NAMES,
  EXPECTED_TABLE_NAMES,
  EXPECTED_TABLES,
  EXPECTED_TRIGGER_TABLES,
  EXPECTED_UPDATED_AT_TABLES,
} from "./verify-schema.mjs";

describe("schema verifier", () => {
  it("passes when tables, RLS, policies, triggers, and updated_at triggers match expectations", () => {
    const result = evaluateSchemaHealth({
      tableNames: EXPECTED_TABLE_NAMES,
      rlsTableNames: EXPECTED_RLS_TABLE_NAMES,
      policyTables: EXPECTED_POLICY_TABLES,
      triggerTables: EXPECTED_TRIGGER_TABLES,
      updatedAtTables: EXPECTED_UPDATED_AT_TABLES,
      updatedAtTriggerTables: EXPECTED_UPDATED_AT_TABLES,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
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
    expect(result.errors).toContain("expected 29 RLS-enabled tables, found 0");
    expect(result.errors).toContain("expected 29 policies on tables, found 0");
    expect(result.errors).toContain("expected 14 triggers on tables, found 0");
  });

  it("fails when a table with updated_at is missing an update trigger", () => {
    const result = evaluateSchemaHealth({
      tableNames: EXPECTED_TABLE_NAMES,
      rlsTableNames: EXPECTED_RLS_TABLE_NAMES,
      policyTables: EXPECTED_POLICY_TABLES,
      triggerTables: EXPECTED_TRIGGER_TABLES,
      updatedAtTables: ["member", "loan"],
      updatedAtTriggerTables: ["member"],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "missing updated_at update triggers on: loan"
    );
  });
});
