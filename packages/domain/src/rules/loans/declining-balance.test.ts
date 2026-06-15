import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateDecliningBalanceSchedule } from "./declining-balance";
import { propertySamples } from "../testing/property";

const fixturePath = fileURLToPath(
  new URL("../../../rules/__fixtures__/BR-01__1000_4pct_10mo_with_admin_fee.json", import.meta.url),
);

describe("BR-01 declining-balance schedule", () => {
  it("matches the golden fixture bit-for-bit", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

    const actual = generateDecliningBalanceSchedule(fixture.input);

    expect(actual).toEqual(fixture.expected);
  });

  it("keeps interest monotonically non-increasing across representative cases", () => {
    propertySamples(
      [
        { principal: 250, ratePerPeriod: 0.01, termPeriods: 5, adminFeeRate: 0 },
        { principal: 1000, ratePerPeriod: 0.04, termPeriods: 10, adminFeeRate: 0.01 },
        { principal: 1375.5, ratePerPeriod: 0.025, termPeriods: 7, adminFeeRate: 0.005 },
        { principal: 5000, ratePerPeriod: 0.03, termPeriods: 12, adminFeeRate: 0.01 },
      ],
      (input) => {
        const schedule = generateDecliningBalanceSchedule(input);
        const interests = schedule.installments.map((row) => Number(row.interestDue));

        for (let i = 1; i < interests.length; i += 1) {
          expect(interests[i]).toBeLessThanOrEqual(interests[i - 1]);
        }

        expect(Number(schedule.totals.principalDue)).toBeCloseTo(input.principal, 2);
        expect(Number(schedule.totals.installmentTotal)).toBeCloseTo(
          Number(schedule.totals.principalDue) +
            Number(schedule.totals.interestDue) +
            Number(schedule.totals.feeDue),
          2,
        );
      },
    );
  });
});
