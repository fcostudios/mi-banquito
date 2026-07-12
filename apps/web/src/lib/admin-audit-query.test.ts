import { describe, expect, it } from "vitest";

import { auditFiltersFromSearchParams, parseAdminAuditFilters } from "./admin-audit-query";

describe("admin audit query parsing", () => {
  it.each([
    "12345678-1234-1234-1234-12345678901-",
    "not-a-uuid",
  ])("rejects malformed organization UUID %s", (orgId) => {
    expect(() => auditFiltersFromSearchParams({ org_id: orgId })).toThrow("audit_org_invalid");
  });

  it("accepts an RFC 4122 organization UUID", () => {
    const orgId = "11111111-1111-4111-8111-111111111111";

    expect(auditFiltersFromSearchParams({ org_id: orgId }).orgId).toBe(orgId);
  });

  it("returns the controlled invalid_filters result for malformed values", () => {
    expect(parseAdminAuditFilters({ org_id: "12345678-1234-1234-1234-12345678901-" }))
      .toEqual({ ok: false, error: "invalid_filters" });
  });
});
