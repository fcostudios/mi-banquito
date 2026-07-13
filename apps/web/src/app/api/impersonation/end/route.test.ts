import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { account, auditLogEntry, member, organization } from "@mi-banquito/db/schema";

const boundary = vi.hoisted(() => ({
  authSubject: "auth0|us020-platform-operator",
  cookieValue: undefined as string | undefined,
  redirectUrl: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => boundary.cookieValue ? { value: boundary.cookieValue } : undefined,
    set: (_name: string, value: string) => { boundary.cookieValue = value; },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    boundary.redirectUrl = url;
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("@/lib/auth0", () => ({
  auth0: {
    getSession: async () => ({ user: { sub: boundary.authSubject, roles: ["PLATFORM_OPERATOR"] } }),
  },
}));

if (!process.env.DATABASE_URL) {
  try { loadEnvFile(".env.local"); } catch { /* beforeAll reports this clearly. */ }
}

const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;
const NOW = new Date("2026-07-13T03:00:00.000Z");
const ORG_A = randomUUID();
const ORG_B = randomUUID();
const OPERATOR_ID = randomUUID();
const MEMBER_A = randomUUID();
const MEMBER_B = randomUUID();
const USER_A = randomUUID();
const MEMBERSHIP_A = randomUUID();
const NORMAL_ACCOUNT_REQUEST = randomUUID();
const BLOCKED_ACCOUNT_REQUEST = randomUUID();
const TEST_ROLE = "mi_banquito_us020_chain";

let db: typeof import("@mi-banquito/db")["db"];
let runWithTenantRequestContext: typeof import("@mi-banquito/db/request-context")["runWithTenantRequestContext"];
let getTenantRequestContext: typeof import("@mi-banquito/db/request-context")["getTenantRequestContext"];
let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
let createAccountsService: typeof import("@mi-banquito/domain")["createAccountsService"];

describe("US-020 production impersonation chain", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the US-020 production-chain test");
    process.env.IMPERSONATION_COOKIE_SECRET = "impersonation-cookie-secret-at-least-32-bytes";
    boundary.authSubject = `auth0|${randomUUID()}`;
    ({ db } = await import("@mi-banquito/db"));
    ({ runWithTenantRequestContext, getTenantRequestContext } = await import("@mi-banquito/db/request-context"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    ({ createAccountsService } = await import("@mi-banquito/domain"));
    await db.execute(sql.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TEST_ROLE}') THEN
          CREATE ROLE ${TEST_ROLE} NOLOGIN;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO ${TEST_ROLE};
      GRANT SELECT ON member TO ${TEST_ROLE};
      INSERT INTO platform_operator (id, display_name, email, auth_subject, status, created_at)
      VALUES ('${OPERATOR_ID}', 'US-020 operator', '${OPERATOR_ID}@example.test', '${boundary.authSubject}', 'active', '${NOW.toISOString()}');
      INSERT INTO organization (id, display_name, country_code, currency_code, timezone, default_language, status, created_at, created_by, created_by_kind, platform_operator_id)
      VALUES
        ('${ORG_A}', 'US-020 tenant A', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', '${NOW.toISOString()}', '${OPERATOR_ID}', 'platform_operator', '${OPERATOR_ID}'),
        ('${ORG_B}', 'US-020 tenant B', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', '${NOW.toISOString()}', '${OPERATOR_ID}', 'platform_operator', '${OPERATOR_ID}');
      INSERT INTO user_account (id, auth_subject, email, display_name, status, created_at)
      VALUES ('${USER_A}', 'auth0|${USER_A}', '${USER_A}@example.test', 'Target treasurer', 'active', '${NOW.toISOString()}');
      INSERT INTO member (id, org_id, display_name, joined_on, role, status, initial_savings_balance, auth_subject, created_at, created_by, created_by_kind)
      VALUES
        ('${MEMBER_A}', '${ORG_A}', 'Tenant A treasurer', '2026-01-01', 'tesorera', 'activo', 0, 'auth0|${USER_A}', '${NOW.toISOString()}', '${OPERATOR_ID}', 'platform_operator'),
        ('${MEMBER_B}', '${ORG_B}', 'Tenant B member', '2026-01-01', 'aportante', 'activo', 0, null, '${NOW.toISOString()}', '${OPERATOR_ID}', 'platform_operator');
      INSERT INTO user_org_membership (id, user_id, org_id, role, status, member_id, granted_at)
      VALUES ('${MEMBERSHIP_A}', '${USER_A}', '${ORG_A}', 'TESORERA', 'active', '${MEMBER_A}', '${NOW.toISOString()}');
    `));
  });

  afterAll(async () => {
    if (!db) return;
    await db.update(organization).set({ status: "archived", updatedAt: NOW })
      .where(eq(organization.id, ORG_A));
    await db.update(organization).set({ status: "archived", updatedAt: NOW })
      .where(eq(organization.id, ORG_B));
  });

  runIfDatabase("uses the production action, resolver, RLS, write guard, and end route without leaking ALS", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    boundary.cookieValue = undefined;
    boundary.redirectUrl = undefined;

    const { startImpersonationAction } = await import("@/app/(authenticated)/admin/orgs/[id]/impersonate/actions");
    const form = new FormData();
    form.set("reason", "Review tenant A records for support");
    await expect(startImpersonationAction(ORG_A, form)).rejects.toThrow("NEXT_REDIRECT");
    expect(boundary.redirectUrl).toBe("/");
    expect(boundary.cookieValue).toEqual(expect.any(String));

    const { requireTreasurer } = await import("@/lib/auth/require-session");
    const [blocked, normal] = await Promise.all([
      runWithTenantRequestContext({ readOnly: false }, async () => {
        const session = await requireTreasurer();
        expect(session.roles).toEqual(["TESORERA"]);
        expect(session.roles).not.toContain("PLATFORM_OPERATOR");
        expect(session.orgId).toBe(ORG_A);

        const visible = await withTenantTransaction(ORG_A, async (tx) => {
          await tx.execute(sql.raw(`SET LOCAL ROLE ${TEST_ROLE}`));
          return tx.select({ id: member.id, orgId: member.orgId }).from(member)
            .where(and(eq(member.id, MEMBER_A), eq(member.orgId, ORG_A)));
        });
        const denied = await withTenantTransaction(ORG_A, async (tx) => {
          await tx.execute(sql.raw(`SET LOCAL ROLE ${TEST_ROLE}`));
          return tx.select({ id: member.id }).from(member).where(eq(member.id, MEMBER_B));
        });
        expect(visible).toEqual([{ id: MEMBER_A, orgId: ORG_A }]);
        expect(denied).toEqual([]);

        await expect(createAccountsService({ now: () => NOW }).saveAccount({
          orgId: ORG_A,
          actorId: MEMBER_A,
          clientRequestId: BLOCKED_ACCOUNT_REQUEST,
          name: "Blocked impersonation write",
          type: "cash_box",
        })).rejects.toThrow("impersonation_read_only");
        return getTenantRequestContext();
      }),
      runWithTenantRequestContext({ readOnly: false, orgId: ORG_A }, async () => {
        const saved = await createAccountsService({ now: () => NOW }).saveAccount({
          orgId: ORG_A,
          actorId: MEMBER_A,
          clientRequestId: NORMAL_ACCOUNT_REQUEST,
          name: "Concurrent normal write",
          type: "cash_box",
        });
        return { saved, context: getTenantRequestContext() };
      }),
    ]);
    expect(blocked.readOnly).toBe(true);
    expect(normal.context).toEqual({ readOnly: false, orgId: ORG_A });
    expect(getTenantRequestContext()).toEqual({ readOnly: false });

    const persisted = await db.select({ name: account.name }).from(account)
      .where(eq(account.orgId, ORG_A));
    const writeAudits = await db.select({ actionKind: auditLogEntry.actionKind }).from(auditLogEntry)
      .where(and(eq(auditLogEntry.orgId, ORG_A), eq(auditLogEntry.actionKind, "account.create")));
    expect(persisted).toEqual([{ name: "Concurrent normal write" }]);
    expect(writeAudits).toHaveLength(1);

    const { POST } = await import("./route");
    const request = () => new NextRequest("http://localhost/api/impersonation/end", {
      method: "POST",
      headers: { cookie: `mi_banquito_impersonation=${boundary.cookieValue}` },
    });
    const first = await POST(request());
    const duplicate = await POST(request());
    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe(`http://localhost/admin/orgs/${ORG_A}`);
    expect(first.cookies.get("mi_banquito_impersonation")?.value).toBe("");
    expect(duplicate.status).toBe(303);
    expect(duplicate.headers.get("location")).toBe(first.headers.get("location"));

    const lifecycle = await db.execute(sql.raw(`SELECT
      (SELECT count(*)::int FROM impersonation_termination WHERE org_id = '${ORG_A}') AS terminations,
      (SELECT count(*)::int FROM audit_log_entry WHERE org_id = '${ORG_A}' AND action_kind = 'impersonation.started') AS start_audits,
      (SELECT count(*)::int FROM audit_log_entry WHERE org_id = '${ORG_A}' AND action_kind = 'impersonation.ended') AS end_audits`));
    expect(lifecycle.rows).toEqual([{ terminations: 1, start_audits: 1, end_audits: 1 }]);
    vi.useRealTimers();
  });
});
