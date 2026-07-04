import { describe, expect, it } from "vitest";

import { evaluatePilotExitChecklist } from "./pilot";

describe("pilot exit checklist", () => {
  it("requires three clean months and would-not-return affirmation", () => {
    expect(evaluatePilotExitChecklist([
      { observedOn: "2026-05-01", cleanMonth: true, wouldNotReturnToPaper: false },
      { observedOn: "2026-06-01", cleanMonth: true, wouldNotReturnToPaper: false },
      { observedOn: "2026-07-01", cleanMonth: true, wouldNotReturnToPaper: true },
    ])).toEqual({
      hasThreeCleanMonths: true,
      hasWouldNotReturnAffirmation: true,
      readyToExit: true,
    });
  });
});
