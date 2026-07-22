import { describe, expect, it } from "vitest";
import {
  nextCompensationDueOn,
  periodLabelForCompensation,
  shouldAwardFixedPeriodicCompensation,
} from "./compensation";

describe("treasurer compensation", () => {
  it("advances monthly and yearly due dates with calendar clamping", () => {
    expect(nextCompensationDueOn("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextCompensationDueOn("2024-02-29", "yearly")).toBe("2025-02-28");
  });

  it("labels compensation periods from the due date", () => {
    expect(periodLabelForCompensation("2026-07-01", "monthly")).toBe("2026-07");
    expect(periodLabelForCompensation("2026-07-01", "yearly")).toBe("2026");
  });

  it("only awards fixed periodic compensation when nextDueOn is due", () => {
    expect(shouldAwardFixedPeriodicCompensation({
      kind: "fixed",
      amount: "10.0000",
      period: "monthly",
      nextDueOn: "2026-07-01",
    }, "2026-07-04")).toBe(true);
    expect(shouldAwardFixedPeriodicCompensation({
      kind: "pct_of_interest",
      amount: "10.0000",
      period: "monthly",
      nextDueOn: "2026-07-01",
    }, "2026-07-04")).toBe(false);
    expect(shouldAwardFixedPeriodicCompensation({
      kind: "fixed",
      amount: "10.0000",
      period: "weekly",
      nextDueOn: "2026-07-01",
    }, "2026-07-04")).toBe(false);
    expect(shouldAwardFixedPeriodicCompensation({
      kind: "fixed",
      amount: "10.0000",
      period: "monthly",
      nextDueOn: "2026-07-10",
    }, "2026-07-04")).toBe(false);
  });

});
