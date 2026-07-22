import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile("../../apps/web/.env.local");
  } catch {
    // Database tests are skipped below when the local environment is absent.
  }
}

const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;
const now = new Date("2026-07-13T03:00:00.000Z");

type Fixture = {
  orgId: string;
  operatorId: string;
  operatorSubject: string;
  membershipId: string;
  memberId: string;
};

let db: typeof import("@mi-banquito/db")["db"];
let assertImpersonationReason: typeof import("./impersonation")["assertImpersonationReason"];
let createImpersonationService: typeof import("./impersonation")["createImpersonationService"];
const fixtureOrgIds: string[] = [];

async function createFixture(options: { treasurerCount?: number; orgStatus?: "active" | "paused" } = {}): Promise<Fixture> {
  const orgId = randomUUID();
  fixtureOrgIds.push(orgId);
  const operatorId = randomUUID();
  const operatorSubject = `auth0|${randomUUID()}`;
  const treasurerCount = options.treasurerCount ?? 1;
  let membershipId = "";
  let memberId = "";
  await db.execute(sql.raw(`
      INSERT INTO platform_operator (id, display_name, email, auth_subject, status, created_at)
      VALUES ('${operatorId}', 'Operator US-020', '${operatorId}@example.test', '${operatorSubject}', 'active', '${now.toISOString()}')
    `));
  await db.execute(sql.raw(`
      INSERT INTO organization (
        id, display_name, country_code, currency_code, timezone, default_language,
        status, created_at, created_by, created_by_kind, platform_operator_id
      ) VALUES ('${orgId}', 'Org US-020', 'EC', 'USD', 'America/Guayaquil', 'es-EC', '${options.orgStatus ?? "active"}', '${now.toISOString()}', '${operatorId}', 'platform_operator', '${operatorId}')
    `));
  for (let index = 0; index < treasurerCount; index += 1) {
      const userId = randomUUID();
      memberId = randomUUID();
      membershipId = randomUUID();
      await db.execute(sql.raw(`
        INSERT INTO user_account (id, auth_subject, email, display_name, status, created_at)
        VALUES ('${userId}', 'auth0|treasurer-${randomUUID()}', '${userId}@example.test', 'Tesorera US-020', 'active', '${now.toISOString()}')
      `));
      await db.execute(sql.raw(`
        INSERT INTO member (
          id, org_id, display_name, joined_on, role, status, initial_savings_balance,
          auth_subject, created_at, created_by, created_by_kind
        ) VALUES ('${memberId}', '${orgId}', 'Tesorera US-020', '2026-01-01', 'tesorera', 'activo', 0, 'auth0|treasurer-${randomUUID()}', '${now.toISOString()}', '${operatorId}', 'platform_operator')
      `));
      await db.execute(sql.raw(`
        INSERT INTO user_org_membership (id, user_id, org_id, role, status, member_id, granted_at)
        VALUES ('${membershipId}', '${userId}', '${orgId}', 'TESORERA', 'active', '${memberId}', '${now.toISOString()}')
      `));
  }
  return { orgId, operatorId, operatorSubject, membershipId, memberId };
}

describe("US-020 impersonation lifecycle", () => {
  beforeAll(async () => {
    ({ db } = await import("@mi-banquito/db"));
    ({ assertImpersonationReason, createImpersonationService } = await import("./impersonation"));
  });
  afterEach(async () => {
    const orgIds = fixtureOrgIds.splice(0);
    if (orgIds.length === 0 || !db) return;
    await db.execute(sql.raw(`
      UPDATE organization
      SET status = 'archived', updated_at = now()
      WHERE id IN (${orgIds.map((id) => `'${id}'`).join(",")})
    `));
  });
  it("requires a trimmed reason of at least ten characters", () => {
    expect(() => assertImpersonationReason(" debug ")).toThrow("impersonation_reason_too_short");
    expect(assertImpersonationReason("  Ayudar con cierre mensual  ")).toBe("Ayudar con cierre mensual");
  });

  runIfDatabase("starts for exactly one active treasurer and resolves only its tenant", async () => {
    const fixture = await createFixture();
    const foreign = await createFixture();
    const service = createImpersonationService({ now: () => now });

    const started = await service.start({
      orgId: fixture.orgId,
      platformOperatorId: fixture.operatorId,
      reason: "Investigar cierre de junio",
    });
    const active = await service.resolve({
      impersonationId: started.id,
      orgId: fixture.orgId,
      targetMembershipId: fixture.membershipId,
      platformOperatorId: fixture.operatorId,
      operatorAuthSubject: fixture.operatorSubject,
    });
    const wrongOrg = await service.resolve({
      impersonationId: started.id,
      orgId: foreign.orgId,
      targetMembershipId: fixture.membershipId,
      platformOperatorId: fixture.operatorId,
      operatorAuthSubject: fixture.operatorSubject,
    });

    expect(started).toMatchObject({ targetMembershipId: fixture.membershipId, reason: "Investigar cierre de junio" });
    expect(started.expiresAt?.toISOString()).toBe("2026-07-13T03:15:00.000Z");
    expect(active).toMatchObject({
      orgId: fixture.orgId,
      actorId: fixture.memberId,
      roles: ["TESORERA"],
      platformOperatorId: fixture.operatorId,
    });
    expect(wrongOrg).toBeNull();
  });

  runIfDatabase("rejects an organization without an active treasurer before writing", async () => {
    const fixture = await createFixture({ treasurerCount: 0 });
    const service = createImpersonationService({ now: () => now });

    await expect(service.start({
      orgId: fixture.orgId,
      platformOperatorId: fixture.operatorId,
      reason: "Investigar acceso de tesorería",
    })).rejects.toThrow("impersonation_requires_exactly_one_treasurer");
  });

  runIfDatabase("appends one termination and one end audit idempotently", async () => {
    const fixture = await createFixture();
    const service = createImpersonationService({ now: () => now });
    const started = await service.start({
      orgId: fixture.orgId,
      platformOperatorId: fixture.operatorId,
      reason: "Validar pantalla de préstamos",
    });

    expect(await service.terminate({
      impersonationId: started.id,
      orgId: fixture.orgId,
      endedByOperatorId: fixture.operatorId,
      kind: "operator_exit",
    })).toBe(true);
    expect(await service.terminate({
      impersonationId: started.id,
      orgId: fixture.orgId,
      endedByOperatorId: fixture.operatorId,
      kind: "operator_exit",
    })).toBe(false);

    const result = await db.execute(sql.raw(`
        SELECT
          (SELECT count(*)::int FROM impersonation_termination WHERE impersonation_id = '${started.id}') AS terminations,
          (SELECT count(*)::int FROM audit_log_entry WHERE subject_id = '${started.id}' AND action_kind = 'impersonation.ended') AS end_audits,
          (SELECT bool_and(reason = 'Validar pantalla de préstamos') FROM audit_log_entry WHERE subject_id = '${started.id}') AS preserved_reason
      `));
      expect(result.rows).toEqual([{ terminations: 1, end_audits: 1, preserved_reason: true }]);
    await expect(db.execute(sql.raw(`UPDATE impersonation SET ended_at = '${now.toISOString()}' WHERE id = '${started.id}'`))).rejects.toMatchObject({ message: expect.stringContaining("append_only_violation") });
  });

  runIfDatabase("rejects a wrong operator binding and lazily audits expiry", async () => {
    const fixture = await createFixture();
    const wrongOperator = await createFixture();
    const started = await createImpersonationService({ now: () => now }).start({
      orgId: fixture.orgId,
      platformOperatorId: fixture.operatorId,
      reason: "Revisar atraso reportado por socia",
    });

    expect(await createImpersonationService({ now: () => now }).resolve({
      impersonationId: started.id,
      orgId: fixture.orgId,
      targetMembershipId: fixture.membershipId,
      platformOperatorId: wrongOperator.operatorId,
      operatorAuthSubject: wrongOperator.operatorSubject,
    })).toBeNull();
    expect(await createImpersonationService({ now: () => new Date("2026-07-13T03:16:00.000Z") }).resolve({
      impersonationId: started.id,
      orgId: fixture.orgId,
      targetMembershipId: fixture.membershipId,
      platformOperatorId: fixture.operatorId,
      operatorAuthSubject: fixture.operatorSubject,
    })).toBeNull();

    const result = await db.execute(sql.raw(`
      SELECT t.kind, t.ended_by_operator_id, a.actor_id, a.reason
      FROM impersonation_termination t
      JOIN audit_log_entry a ON a.subject_id = t.impersonation_id
        AND a.action_kind = 'impersonation.ended'
      WHERE t.impersonation_id = '${started.id}'
    `));
    expect(result.rows).toEqual([{
      kind: "expired",
      ended_by_operator_id: fixture.operatorId,
      actor_id: fixture.operatorId,
      reason: "Revisar atraso reportado por socia",
    }]);
  });

  runIfDatabase("records revocation with the original operator and reason", async () => {
    const fixture = await createFixture();
    const service = createImpersonationService({ now: () => now });
    const started = await service.start({
      orgId: fixture.orgId,
      platformOperatorId: fixture.operatorId,
      reason: "Revocar acceso de soporte solicitado",
    });

    expect(await service.terminate({
      impersonationId: started.id,
      orgId: fixture.orgId,
      endedByOperatorId: fixture.operatorId,
      kind: "revoked",
    })).toBe(true);
    const result = await db.execute(sql.raw(`
      SELECT t.kind, a.actor_id, a.reason
      FROM impersonation_termination t
      JOIN audit_log_entry a ON a.subject_id = t.impersonation_id
        AND a.action_kind = 'impersonation.ended'
      WHERE t.impersonation_id = '${started.id}'
    `));
    expect(result.rows).toEqual([{
      kind: "revoked",
      actor_id: fixture.operatorId,
      reason: "Revocar acceso de soporte solicitado",
    }]);
  });

  runIfDatabase("rolls back the start row when its audit insert fails", async () => {
    const fixture = await createFixture();
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `reject_impersonation_audit_${suffix}`;
    const triggerName = `reject_impersonation_audit_trigger_${suffix}`;
    await db.execute(sql.raw(`
      CREATE FUNCTION ${functionName}() RETURNS trigger AS $$
      BEGIN
        IF NEW.action_kind = 'impersonation.started' THEN
          RAISE EXCEPTION 'forced_impersonation_audit_failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON audit_log_entry
      FOR EACH ROW EXECUTE FUNCTION ${functionName}();
    `));
    try {
      await expect(createImpersonationService({ now: () => now }).start({
        orgId: fixture.orgId,
        platformOperatorId: fixture.operatorId,
        reason: "Forzar fallo de auditoría atómica",
      })).rejects.toThrow("forced_impersonation_audit_failure");
      const rows = await db.execute(sql.raw(`
        SELECT count(*)::int AS starts FROM impersonation WHERE org_id = '${fixture.orgId}'
      `));
      expect(rows.rows).toEqual([{ starts: 0 }]);
    } finally {
      await db.execute(sql.raw(`
        DROP TRIGGER IF EXISTS ${triggerName} ON audit_log_entry;
        DROP FUNCTION IF EXISTS ${functionName}();
      `));
    }
  });
});
