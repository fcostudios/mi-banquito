import { describe, expect, it } from "vitest";
import * as schemaApply from "./apply-local-schema.mjs";

describe("US-008 inherited schema repair classifier", () => {
  it("accepts only the missing interest view/index and stale tenant policies", () => {
    expect(typeof schemaApply.isOnlyMissingUs008Repair).toBe("function");
    expect(schemaApply.isOnlyMissingUs008Repair?.({
      errors: [
        "expected 11 materialized views, found 10",
        "missing materialized views: mv_interest_gains_per_fiscal_year",
        "expected 148 indexes, found 147",
        "missing indexes: idx_mv_interest_gains_per_fiscal_year_org_year",
        "expected 47 fail-closed policies on tables, found 0",
        "missing fail-closed policies on tables: account, member",
      ],
    })).toBe(true);

    expect(schemaApply.isOnlyMissingUs008Repair?.({
      errors: ["missing tables: account"],
    })).toBe(false);
  });
});

describe("Sprint 9 inherited schema upgrade classifier", () => {
  it("selects only a healthy pre-Sprint-9 database with no partial markers", () => {
    expect(typeof schemaApply.isSprint9UpgradeState).toBe("function");
    expect(schemaApply.isSprint9UpgradeState?.({
      preSprint9HealthOk: true,
      headHealthOk: false,
      hasCollectionTable: true,
      hasRecognitionFiscalYear: false,
      hasDispositionEnum: false,
      hasTerminalAuditIndex: false,
    })).toBe(true);
    expect(schemaApply.isSprint9UpgradeState?.({
      preSprint9HealthOk: false,
      headHealthOk: false,
      hasCollectionTable: true,
      hasRecognitionFiscalYear: false,
      hasDispositionEnum: false,
      hasTerminalAuditIndex: false,
    })).toBe(false);
    expect(schemaApply.isSprint9UpgradeState?.({
      preSprint9HealthOk: true,
      headHealthOk: false,
      hasCollectionTable: true,
      hasRecognitionFiscalYear: true,
      hasDispositionEnum: true,
      hasTerminalAuditIndex: false,
    })).toBe(false);
    expect(schemaApply.isSprint9UpgradeState?.({
      preSprint9HealthOk: true,
      headHealthOk: true,
      hasCollectionTable: true,
      hasRecognitionFiscalYear: true,
      hasDispositionEnum: true,
      hasTerminalAuditIndex: true,
    })).toBe(false);
  });

  it("identifies a partial Sprint 9 state for fail-closed handling", () => {
    expect(typeof schemaApply.isSprint9PartialState).toBe("function");
    expect(schemaApply.isSprint9PartialState?.({
      preSprint9HealthOk: true,
      headHealthOk: false,
      hasRecognitionFiscalYear: true,
      hasDispositionEnum: false,
      hasTerminalAuditIndex: false,
    })).toBe(true);
    expect(schemaApply.isSprint9PartialState?.({
      preSprint9HealthOk: true,
      headHealthOk: false,
      hasRecognitionFiscalYear: false,
      hasDispositionEnum: false,
      hasTerminalAuditIndex: false,
    })).toBe(false);
  });
});
