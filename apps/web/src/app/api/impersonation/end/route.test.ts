import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { member, organization } from "@mi-banquito/db/schema";
import { signImpersonationCookie } from "@/lib/impersonation/cookie";

import { createEndImpersonationHandler } from "./handler";

if (!process.env.DATABASE_URL) {
  try { loadEnvFile(".env.local"); } catch { /* beforeAll reports this clearly. */ }
}

const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;
const now = new Date("2026-07-13T03:00:00.000Z");
const secret = "impersonation-cookie-secret-at-least-32-bytes";
const orgId = randomUUID();
const operatorId = randomUUID();
const memberId = randomUUID();
const userId = randomUUID();
const membershipId = randomUUID();
const operatorSubject = `auth0|${randomUUID()}`;
const targetSubject = `auth0|${randomUUID()}`;
let db: typeof import("@mi-banquito/db")["db"];
let runWithTenantRequestContext: typeof import("@mi-banquito/db/request-context")["runWithTenantRequestContext"];
let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
let createAccountsService: typeof import("@mi-banquito/domain")["createAccountsService"];
let createImpersonationService: typeof import("@mi-banquito/domain")["createImpersonationService"];
let establishActiveImpersonationContext: typeof import("@/lib/impersonation/session")["establishActiveImpersonationContext"];

describe("POST /api/impersonation/end", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for impersonation route integration tests");
    ({ db } = await import("@mi-banquito/db"));
    ({ runWithTenantRequestContext } = await import("@mi-banquito/db/request-context"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    ({ createAccountsService, createImpersonationService } = await import("@mi-banquito/domain"));
    ({ establishActiveImpersonationContext } = await import("@/lib/impersonation/session"));
    await db.execute(sql.raw(`
      INSERT INTO platform_operator (id, display_name, email, auth_subject, status, created_at)
      VALUES ('${operatorId}', 'Route operator', '${operatorId}@example.test', '${operatorSubject}', 'active', '${now.toISOString()}');
      INSERT INTO organization (id, display_name, country_code, currency_code, timezone, default_language, status, created_at, created_by, created_by_kind, platform_operator_id)
      VALUES ('${orgId}', 'Route org', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', '${now.toISOString()}', '${operatorId}', 'platform_operator', '${operatorId}');
      INSERT INTO user_account (id, auth_subject, email, display_name, status, created_at)
      VALUES ('${userId}', '${targetSubject}', '${userId}@example.test', 'Target', 'active', '${now.toISOString()}');
      INSERT INTO member (id, org_id, display_name, joined_on, role, status, initial_savings_balance, auth_subject, created_at, created_by, created_by_kind)
      VALUES ('${memberId}', '${orgId}', 'Target', '2026-01-01', 'tesorera', 'activo', 0, '${targetSubject}', '${now.toISOString()}', '${operatorId}', 'platform_operator');
      INSERT INTO user_org_membership (id, user_id, org_id, role, status, member_id, granted_at)
      VALUES ('${membershipId}', '${userId}', '${orgId}', 'TESORERA', 'active', '${memberId}', '${now.toISOString()}');
    `));
  });

  afterAll(async () => {
    await db.update(organization).set({ status: "archived", updatedAt: now }).where(eq(organization.id, orgId));
  });

  runIfDatabase("completes the signed-cookie read-only journey and ends idempotently", async () => {
    const service = createImpersonationService({ now: () => now });
    const started = await service.start({ orgId, platformOperatorId: operatorId, reason: "Review target account state" });
    const active = await service.resolve({
      impersonationId: started.id, orgId, targetMembershipId: membershipId,
      platformOperatorId: operatorId, operatorAuthSubject: operatorSubject,
    });
    expect(active).not.toBeNull();
    const token = signImpersonationCookie({
      version: 1, impersonationId: started.id, orgId, targetMembershipId: membershipId,
      platformOperatorId: operatorId, authSubject: operatorSubject,
      issuedAt: now.getTime(), expiresAt: now.getTime() + 15 * 60_000,
    }, secret);

    await runWithTenantRequestContext({ readOnly: false }, async () => {
      establishActiveImpersonationContext(active!);
      const visible = await withTenantTransaction(orgId, (tx) => tx.select({ id: member.id })
        .from(member).where(and(eq(member.orgId, orgId), eq(member.id, memberId))));
      expect(visible).toEqual([{ id: memberId }]);
      await expect(createAccountsService({ now: () => now }).saveAccount({
        orgId, actorId: memberId, clientRequestId: randomUUID(), name: "Blocked", type: "cash_box",
      })).rejects.toThrow("impersonation_read_only");
    });

    const beforeEnd = await db.execute(sql.raw(`SELECT
      (SELECT count(*)::int FROM account WHERE org_id = '${orgId}') AS accounts,
      (SELECT count(*)::int FROM audit_log_entry WHERE org_id = '${orgId}' AND action_kind = 'account.create') AS account_audits`));
    expect(beforeEnd.rows).toEqual([{ accounts: 0, account_audits: 0 }]);

    const handler = createEndImpersonationHandler({
      getSession: async () => ({ user: { sub: operatorSubject } }),
      service,
      secret,
      now: () => now,
    });
    const makeRequest = () => new NextRequest("http://localhost/api/impersonation/end", {
      method: "POST", headers: { cookie: `mi_banquito_impersonation=${token}` },
    });
    const first = await handler(makeRequest());
    const duplicate = await handler(makeRequest());

    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe(`http://localhost/admin/orgs/${orgId}`);
    expect(first.cookies.get("mi_banquito_impersonation")?.value).toBe("");
    expect(duplicate.status).toBe(303);
    expect(duplicate.headers.get("location")).toBe(first.headers.get("location"));
    const ended = await db.execute(sql.raw(`SELECT
      (SELECT count(*)::int FROM impersonation_termination WHERE impersonation_id = '${started.id}') AS terminations,
      (SELECT count(*)::int FROM audit_log_entry WHERE subject_id = '${started.id}' AND action_kind = 'impersonation.ended') AS end_audits`));
    expect(ended.rows).toEqual([{ terminations: 1, end_audits: 1 }]);
  });
});
