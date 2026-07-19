import { describe, expect, it } from "vitest";

import { isTenantExportRoutePath } from "./admin-export-route-policy";

describe("tenant export route policy", () => {
  it.each([
    ["export page", "/admin/orgs/11111111-1111-4111-8111-111111111111/export", true],
    ["signed generation", "/admin/orgs/11111111-1111-4111-8111-111111111111/export/22222222-2222-4222-8222-222222222222", true],
    ["nested export path", "/admin/orgs/11111111-1111-4111-8111-111111111111/export/22222222-2222-4222-8222-222222222222/file", true],
    ["organization page", "/admin/orgs/11111111-1111-4111-8111-111111111111", false],
    ["similar prefix", "/admin/orgs/11111111-1111-4111-8111-111111111111/exported", false],
  ])("classifies %s", (_label, pathname, expected) => {
    expect(isTenantExportRoutePath(pathname)).toBe(expected);
  });
});
