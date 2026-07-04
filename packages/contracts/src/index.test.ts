import { describe, expect, it } from "vitest";

import { currentEcuadorDateString, isPromiseDateOnOrAfterToday } from "./index";

describe("Sprint 4 contract validation helpers", () => {
  it("uses Ecuador's local date for promise validation near a UTC day boundary", () => {
    const boundary = new Date("2026-07-04T02:00:00.000Z");

    expect(currentEcuadorDateString(boundary)).toBe("2026-07-03");
    expect(isPromiseDateOnOrAfterToday("2026-07-03", currentEcuadorDateString(boundary))).toBe(true);
    expect(isPromiseDateOnOrAfterToday("2026-07-02", currentEcuadorDateString(boundary))).toBe(false);
  });
});
