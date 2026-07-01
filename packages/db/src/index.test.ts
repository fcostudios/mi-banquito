import { describe, expect, it } from "vitest";

import { shouldUseNeonHttp } from "./index";

describe("database driver selection", () => {
  it("keeps legacy Neon production envs on transaction-capable pg", () => {
    expect(shouldUseNeonHttp("neon")).toBe(false);
  });

  it("uses neon-http only when explicitly requested", () => {
    expect(shouldUseNeonHttp("neon-http")).toBe(true);
    expect(shouldUseNeonHttp("pg")).toBe(false);
    expect(shouldUseNeonHttp(undefined)).toBe(false);
  });
});
