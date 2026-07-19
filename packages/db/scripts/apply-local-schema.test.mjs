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
