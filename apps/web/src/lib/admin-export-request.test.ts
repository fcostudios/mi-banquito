import { describe, expect, it } from "vitest";

import { createTenantExportRequest, verifyTenantExportRequest } from "./admin-export-service";

const request = {
  orgId: "11111111-1111-4111-8111-111111111111",
  exportId: "22222222-2222-4222-8222-222222222222",
  actorId: "33333333-3333-4333-8333-333333333333",
  operatorUserId: "auth0|operator",
};

describe("tenant export signed request", () => {
  it("binds the request to its ids, operator, and short expiry", () => {
    const token = createTenantExportRequest(request, {
      secret: "test-export-signing-secret-with-32-bytes",
      now: new Date("2026-07-12T12:00:00.000Z"),
      ttlSeconds: 300,
    });

    expect(verifyTenantExportRequest(token, {
      secret: "test-export-signing-secret-with-32-bytes",
      now: new Date("2026-07-12T12:04:59.000Z"),
    })).toEqual({ ...request, expiresAt: 1783857900, version: 1 });
    expect(() => verifyTenantExportRequest(token, {
      secret: "test-export-signing-secret-with-32-bytes",
      now: new Date("2026-07-12T12:05:00.000Z"),
    })).toThrow("tenant_export_request_expired");
  });

  it("rejects tampering with a controlled error", () => {
    const token = createTenantExportRequest(request, {
      secret: "test-export-signing-secret-with-32-bytes",
      now: new Date("2026-07-12T12:00:00.000Z"),
      ttlSeconds: 300,
    });

    expect(() => verifyTenantExportRequest(`${token.slice(0, -1)}x`, {
      secret: "test-export-signing-secret-with-32-bytes",
      now: new Date("2026-07-12T12:01:00.000Z"),
    })).toThrow("tenant_export_request_invalid");
  });
});
