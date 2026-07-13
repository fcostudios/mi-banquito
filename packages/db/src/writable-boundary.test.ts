import { describe, expect, it } from "vitest";

import { runWithTenantRequestContext } from "./request-context";
import { withWritableTenantTransaction } from "./tenant";

describe("writable tenant boundary", () => {
  it("rejects read-only impersonation before invoking transaction work", async () => {
    let invoked = false;

    await runWithTenantRequestContext({
      readOnly: true,
      orgId: "11111111-1111-4111-8111-111111111111",
      operatorId: "22222222-2222-4222-8222-222222222222",
    }, async () => {
      await expect(withWritableTenantTransaction(
        "11111111-1111-4111-8111-111111111111",
        async () => {
          invoked = true;
        },
      )).rejects.toThrow("impersonation_read_only");
    });

    expect(invoked).toBe(false);
  });
});
