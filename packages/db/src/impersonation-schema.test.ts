import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { impersonation, impersonationTermination } from "./schema";

const migration = readFileSync(
  new URL("./migrations/V20260713030000__read_only_impersonation_lifecycle.sql", import.meta.url),
  "utf8",
);

describe("US-020 impersonation lifecycle schema", () => {
  it("binds each start to a target membership and a finite expiry", () => {
    expect({
      targetMembershipId: impersonation.targetMembershipId.name,
      expiresAt: impersonation.expiresAt.name,
    }).toEqual({
      targetMembershipId: "target_membership_id",
      expiresAt: "expires_at",
    });
  });

  it("models termination as one append-only event per impersonation", () => {
    const config = getTableConfig(impersonationTermination);

    expect(config.name).toBe("impersonation_termination");
    expect(impersonationTermination.kind.enumValues).toEqual([
      "operator_exit",
      "expired",
      "revoked",
    ]);
    expect(migration).toMatch(/UNIQUE \(impersonation_id\)/);
    expect(migration).toMatch(/FOREIGN KEY \(impersonation_id, org_id\)[\s\S]*REFERENCES impersonation \(id, org_id\)/);
    expect(migration).toMatch(/FOREIGN KEY \(target_membership_id, org_id\)[\s\S]*REFERENCES user_org_membership \(id, org_id\)/);
  });

  it("forces tenant RLS and rejects mutation of both lifecycle tables", () => {
    expect(migration).toContain("ALTER TABLE impersonation FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE impersonation_termination FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("CREATE POLICY impersonation_termination_tenant_isolation");
    expect(migration).toMatch(/CREATE TRIGGER impersonation_no_mutate BEFORE UPDATE OR DELETE ON impersonation/);
    expect(migration).toMatch(/CREATE TRIGGER impersonation_termination_no_mutate BEFORE UPDATE OR DELETE ON impersonation_termination/);
  });
});
