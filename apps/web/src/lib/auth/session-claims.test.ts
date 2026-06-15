import { describe, expect, it } from "vitest";
import { getDbOrgIdFromUser, getRolesFromUser } from "./session-claims";

const namespace = "https://mi-banquito.app";

describe("session claims", () => {
  it("uses the namespaced DB org UUID claim before Auth0 native org_id", () => {
    const user = {
      org_id: "org_auth0native",
      [`${namespace}/org_id`]: "11111111-1111-4111-8111-111111111111",
    };

    expect(getDbOrgIdFromUser(user)).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("rejects Auth0 native org ids because Postgres org_id is uuid", () => {
    expect(getDbOrgIdFromUser({ org_id: "org_Chul6oWgE2ZzCNvE" })).toBeUndefined();
  });

  it("returns undefined for missing tenant claims", () => {
    expect(getDbOrgIdFromUser({ sub: "auth0|abc" })).toBeUndefined();
  });

  it("reads namespaced roles first and falls back to legacy roles", () => {
    expect(getRolesFromUser({ [`${namespace}/roles`]: ["TESORERA"] })).toEqual(["TESORERA"]);
    expect(getRolesFromUser({ roles: ["PLATFORM_OPERATOR"] })).toEqual(["PLATFORM_OPERATOR"]);
  });
});
