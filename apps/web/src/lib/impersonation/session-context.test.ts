import { describe, expect, it } from "vitest";

import { getTenantRequestContext, runWithTenantRequestContext } from "@mi-banquito/db/request-context";

import { establishActiveImpersonationContext } from "./session";

describe("active impersonation request context", () => {
  it("propagates read-only tenant and operator identity to downstream work", async () => {
    await runWithTenantRequestContext({ readOnly: false }, async () => {
      establishActiveImpersonationContext({
        readOnly: true,
        orgId: "11111111-1111-4111-8111-111111111111",
        platformOperatorId: "22222222-2222-4222-8222-222222222222",
      });
      await Promise.resolve();

      expect(getTenantRequestContext()).toEqual({
        readOnly: true,
        orgId: "11111111-1111-4111-8111-111111111111",
        operatorId: "22222222-2222-4222-8222-222222222222",
      });
    });
  });
});
