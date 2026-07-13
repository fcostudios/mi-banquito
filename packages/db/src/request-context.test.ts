import { describe, expect, it } from "vitest";

import {
  initializeTenantRequestContext,
  establishTenantRequestContext,
  getTenantRequestContext,
  runWithTenantRequestContext,
} from "./request-context";

describe("tenant request context", () => {
  it("is writable by default", () => {
    expect(getTenantRequestContext()).toEqual({ readOnly: false });
  });

  it("keeps concurrent request contexts isolated across async work", async () => {
    let releaseFirst!: () => void;
    const firstPaused = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const impersonated = runWithTenantRequestContext({
      readOnly: true,
      orgId: "org-impersonated",
      operatorId: "operator-a",
    }, async () => {
      await firstPaused;
      return getTenantRequestContext();
    });
    const normal = runWithTenantRequestContext({
      readOnly: false,
      orgId: "org-normal",
      operatorId: "member-b",
    }, async () => getTenantRequestContext());

    expect(await normal).toEqual({
      readOnly: false,
      orgId: "org-normal",
      operatorId: "member-b",
    });
    releaseFirst();
    expect(await impersonated).toEqual({
      readOnly: true,
      orgId: "org-impersonated",
      operatorId: "operator-a",
    });
    expect(getTenantRequestContext()).toEqual({ readOnly: false });
  });

  it("establishes impersonation for the remaining async chain", async () => {
    await Promise.resolve();
    establishTenantRequestContext({
      readOnly: true,
      orgId: "org-target",
      operatorId: "operator",
    });

    await Promise.resolve();
    expect(getTenantRequestContext()).toEqual({
      readOnly: true,
      orgId: "org-target",
      operatorId: "operator",
    });
  });

  it("narrows the caller context when impersonation resolves after an await", async () => {
    async function resolveImpersonation() {
      initializeTenantRequestContext();
      await Promise.resolve();
      establishTenantRequestContext({
        readOnly: true,
        orgId: "org-target",
        operatorId: "operator",
      });
    }

    await resolveImpersonation();
    expect(getTenantRequestContext()).toEqual({
      readOnly: true,
      orgId: "org-target",
      operatorId: "operator",
    });
  });
});
