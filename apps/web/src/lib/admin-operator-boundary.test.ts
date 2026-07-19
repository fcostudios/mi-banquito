import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const protectedModules = [
  "src/app/(authenticated)/admin/audit/page.tsx",
  "src/app/(authenticated)/admin/audit/export/route.ts",
  "src/app/(authenticated)/admin/orgs/[id]/export/page.tsx",
  "src/app/(authenticated)/admin/orgs/[id]/export/actions.ts",
  "src/app/(authenticated)/admin/orgs/[id]/export/[exportId]/route.ts",
];

describe("US-021/US-022 platform-operator boundary", () => {
  it.each(protectedModules)("gates %s before reading or exporting protected data", (moduleUrl) => {
    const source = readFileSync(resolve(process.cwd(), moduleUrl), "utf8");
    const gate = source.indexOf("await requirePlatformOperator()");
    const protectedCalls = [
      source.indexOf("createAdminAuditService()"),
      source.indexOf("createTenantExportRequest("),
      source.indexOf("prepareTenantExport("),
      source.indexOf("loadTenantExportHistory("),
      source.indexOf("loadTenantExportDownload("),
    ].filter((index) => index >= 0);

    expect(source).toContain('import { requirePlatformOperator } from "@/lib/auth/require-session"');
    expect(gate).toBeGreaterThan(0);
    expect(protectedCalls.length).toBeGreaterThan(0);
    expect(protectedCalls.every((call) => gate < call)).toBe(true);
  });

  it("keeps export generation out of the server action", () => {
    const source = readFileSync(resolve(
      process.cwd(),
      "src/app/(authenticated)/admin/orgs/[id]/export/actions.ts",
    ), "utf8");

    expect(source).toContain("createTenantExportRequest(");
    expect(source).not.toContain("prepareTenantExport(");
    expect(source).not.toContain("generateTenantExport(");
  });

  it("lets the export stream own completion and cleanup", () => {
    const source = readFileSync(resolve(
      process.cwd(),
      "src/app/(authenticated)/admin/orgs/[id]/export/[exportId]/route.ts",
    ), "utf8");

    expect(source).not.toContain("after(");
    expect(source).not.toMatch(/import\s*\{[^}]*\bafter\b[^}]*\}\s*from\s*["']next\/server["']/);
  });

  it("redirects a signed replay before attempting generation again", () => {
    const source = readFileSync(resolve(
      process.cwd(),
      "src/app/(authenticated)/admin/orgs/[id]/export/[exportId]/route.ts",
    ), "utf8");
    const existingExportLookup = source.indexOf("await loadTenantExportHistory(id)");
    const generation = source.indexOf("await prepareTenantExport(");

    expect(existingExportLookup).toBeGreaterThan(0);
    expect(generation).toBeGreaterThan(existingExportLookup);
    expect(source).toContain("redirectToTenantExportDownload(");
  });
});
