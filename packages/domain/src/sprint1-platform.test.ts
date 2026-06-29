import { describe, expect, it } from "vitest";
import {
  buildConfigAuditSummary,
  buildDefaultGroupConfigValues,
  createOrgAuditPayload,
  summarizeConfigForTreasurer,
} from "./platform";

describe("US-016 platform org creation helpers", () => {
  it("builds default config v1 from organization locale", () => {
    const values = buildDefaultGroupConfigValues({
      orgId: "00000000-0000-4000-8000-000000000001",
      currencyCode: "USD",
      actorId: "00000000-0000-4000-8000-000000000002",
      now: new Date("2026-06-29T00:00:00Z"),
    });
    expect(values.version).toBe(1);
    expect(values.currencyCode).toBe("USD");
    expect(values.contributionCycleKind).toBe("monthly");
    expect(values.loanRatePeriodUnit).toBe("monthly");
    expect(values.fiscalYearStartMonth).toBe(1);
    expect(values.fiscalYearStartDay).toBe(1);
    expect(values.config).toMatchObject({ mora: { lateThresholdDays: 3, moraThresholdDays: 15 } });
  });

  it("creates an audit payload without leaking request internals", () => {
    expect(createOrgAuditPayload({ displayName: "Banquito Norte", countryCode: "EC" })).toEqual({
      displayName: "Banquito Norte",
      countryCode: "EC",
    });
  });
});

describe("US-017 config summaries", () => {
  it("summarizes the config change for a treasurer", () => {
    expect(summarizeConfigForTreasurer({
      contributionAmount: "20.0000",
      memberLoanRateValue: "4.0000",
      loanRatePeriodUnit: "monthly",
      baseFundQuotaAmount: "25.0000",
    })).toContain("Aporte $20.00");
  });

  it("captures before and after versions in audit payload", () => {
    expect(buildConfigAuditSummary({ beforeVersion: 1, afterVersion: 2 })).toEqual({
      beforeVersion: 1,
      afterVersion: 2,
    });
  });
});
