import { describe, expect, it } from "vitest";

import { hasMinRole, highestRole } from "./roles";

describe("role hierarchy", () => {
  it.each([
    [[], "empty"],
    [["APORTANTE"], "unrecognized"],
  ])("fails closed for %s roles", (roles) => {
    expect(highestRole(roles)).toBeUndefined();
    expect(hasMinRole(roles, "TESORERA")).toBe(false);
  });

  it("preserves the recognized hierarchy", () => {
    expect(hasMinRole(["TESORERA"], "TESORERA")).toBe(true);
    expect(hasMinRole(["PRESIDENTE"], "TESORERA")).toBe(true);
    expect(hasMinRole(["TESORERA"], "PRESIDENTE")).toBe(false);
    expect(highestRole(["ROLE_TESORERA", "MIEMBRO"])).toBe("MIEMBRO");
  });
});
