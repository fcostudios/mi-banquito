import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLogEntry, organization } from "@mi-banquito/db/schema";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile("../../apps/web/.env.local");
  } catch {
    // The integration setup below reports a missing database explicitly.
  }
}

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const ACTOR_A = randomUUID();
const ACTOR_B = randomUUID();
const PLATFORM_ACTOR = randomUUID();
const RLS_ROLE = `audit_rls_${randomUUID().replaceAll("-", "")}`;
const TIE_OLDER_ID = "10000000-0000-4000-8000-000000000001";
const TIE_NEWER_ID = "f0000000-0000-4000-8000-000000000001";

let db: typeof import("@mi-banquito/db")["db"];
let service: ReturnType<typeof import("./admin-audit")["createAdminAuditService"]>;
let parseAuditDateRange: typeof import("./admin-audit")["parseAuditDateRange"];
let auditRowsToCsv: typeof import("./admin-audit")["auditRowsToCsv"];
let auditRowsToCsvStream: typeof import("./admin-audit")["auditRowsToCsvStream"];

describe("US-022 cross-organization audit", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for admin audit integration tests");
    }

    ({ db } = await import("@mi-banquito/db"));
    const auditModule = await import("./admin-audit");
    service = auditModule.createAdminAuditService();
    parseAuditDateRange = auditModule.parseAuditDateRange;
    auditRowsToCsv = auditModule.auditRowsToCsv;
    auditRowsToCsvStream = auditModule.auditRowsToCsvStream;

    await db.insert(organization).values([
      {
        id: ORG_A,
        displayName: "Audit org A",
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        createdBy: PLATFORM_ACTOR,
        createdByKind: "system",
      },
      {
        id: ORG_B,
        displayName: "Audit org B",
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        createdBy: PLATFORM_ACTOR,
        createdByKind: "system",
      },
    ]);

    await db.insert(auditLogEntry).values([
      {
        id: TIE_NEWER_ID,
        orgId: ORG_A,
        actorKind: "member",
        actorId: ACTOR_A,
        actionKind: "contribution.recorded",
        subjectKind: "contribution",
        subjectId: randomUUID(),
        payloadSnapshot: { amount: "10.00", note: "=SUM(A1:A2)" },
        reason: "=HYPERLINK(\"https://invalid.example\",\"ok\")\nsecond line",
        at: new Date("2026-07-12T23:59:59.999Z"),
        createdAt: new Date("2026-07-12T23:59:59.999Z"),
      },
      {
        id: TIE_OLDER_ID,
        orgId: ORG_A,
        actorKind: "member",
        actorId: ACTOR_A,
        actionKind: "contribution.adjusted",
        subjectKind: "contribution",
        subjectId: randomUUID(),
        payloadSnapshot: { amount: "9.00" },
        reason: null,
        at: new Date("2026-07-12T23:59:59.999Z"),
        createdAt: new Date("2026-07-12T23:59:59.999Z"),
      },
      {
        orgId: ORG_B,
        actorKind: "system",
        actorId: ACTOR_B,
        actionKind: "interest.accrued",
        subjectKind: "loan",
        subjectId: randomUUID(),
        payloadSnapshot: { tenantSentinel: "org-b-only" },
        reason: null,
        at: new Date("2026-07-12T12:00:00.000Z"),
        createdAt: new Date("2026-07-12T12:00:00.000Z"),
      },
      {
        orgId: null,
        actorKind: "platform_operator",
        actorId: PLATFORM_ACTOR,
        actionKind: "platform.maintenance",
        subjectKind: "platform",
        subjectId: null,
        payloadSnapshot: { scope: "platform" },
        reason: null,
        at: new Date("2026-07-11T12:00:00.000Z"),
        createdAt: new Date("2026-07-11T12:00:00.000Z"),
      },
    ]);

    await db.execute(sql.raw(`CREATE ROLE ${RLS_ROLE} NOLOGIN`));
    await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${RLS_ROLE}`));
    await db.execute(sql.raw(`GRANT SELECT ON audit_log_entry TO ${RLS_ROLE}`));
  });

  afterAll(async () => {
    if (!db) return;
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(auditLogEntry).where(inArray(auditLogEntry.orgId, [ORG_A, ORG_B]));
      await tx.execute(sql`DELETE FROM audit_log_entry WHERE org_id IS NULL AND actor_id = ${PLATFORM_ACTOR}`);
      await tx.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
    });
    await db.execute(sql.raw(`REVOKE SELECT ON audit_log_entry FROM ${RLS_ROLE}`));
    await db.execute(sql.raw(`REVOKE USAGE ON SCHEMA public FROM ${RLS_ROLE}`));
    await db.execute(sql.raw(`DROP ROLE IF EXISTS ${RLS_ROLE}`));
  });

  it("keeps ordinary tenant reads isolated under FORCE RLS and withholds function execution", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${RLS_ROLE}`));
      await tx.execute(sql`SELECT set_config('app.current_org_id', ${ORG_A}, true)`);
      const result = await tx.execute(sql`SELECT org_id, action_kind FROM audit_log_entry ORDER BY action_kind`);
      await expect(tx.execute(sql`SELECT * FROM admin_read_audit_log(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10)`))
        .rejects.toThrow(/permission denied/i);
      return result.rows;
    });

    expect(rows).toEqual([
      { org_id: ORG_A, action_kind: "contribution.adjusted" },
      { org_id: ORG_A, action_kind: "contribution.recorded" },
    ]);
  });

  it("grants the cross-org reader only through a dedicated NOLOGIN capability role", async () => {
    const role = await db.execute(sql`
      SELECT rolcanlogin, pg_has_role(current_user, oid, 'MEMBER') AS runtime_is_member
      FROM pg_roles
      WHERE rolname = 'mi_banquito_operator_audit'
    `);
    expect(role.rows).toEqual([{ rolcanlogin: false, runtime_is_member: true }]);

    const acl = await db.execute(sql`
      SELECT expanded.grantee, grantee.rolname, expanded.privilege_type
      FROM pg_proc AS procedure
      CROSS JOIN LATERAL aclexplode(procedure.proacl) AS expanded
      LEFT JOIN pg_roles AS grantee ON grantee.oid = expanded.grantee
      WHERE procedure.oid = 'admin_read_audit_log(uuid,audit_log_entry_actor_kind_enum,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,uuid,integer)'::regprocedure
        AND expanded.privilege_type = 'EXECUTE'
      ORDER BY expanded.grantee
    `);
    expect(acl.rows).toEqual([{
      grantee: expect.any(Number),
      rolname: "mi_banquito_operator_audit",
      privilege_type: "EXECUTE",
    }]);
    expect(acl.rows.some((row) => row.grantee === 0)).toBe(false);
  });

  it("combines typed filters, includes platform rows, and treats the end date as an inclusive UTC day", async () => {
    const range = parseAuditDateRange({ from: "2026-07-12", to: "2026-07-12" });
    const page = await service.list({
      orgId: ORG_A,
      actorKind: "member",
      actionKind: "contribution",
      ...range,
      limit: 10,
    });

    expect(page.rows.map((row) => [row.id, row.orgId, row.actionKind, row.payloadSnapshot])).toEqual([
      [TIE_NEWER_ID, ORG_A, "contribution.recorded", { amount: "10.00", note: "=SUM(A1:A2)" }],
      [TIE_OLDER_ID, ORG_A, "contribution.adjusted", { amount: "9.00" }],
    ]);
    expect(page.nextCursor).toBeNull();

    const platformRows = await service.list({ actionKind: "platform.maintenance", limit: 10 });
    const tenantRows = await service.list({ orgId: ORG_B, actionKind: "interest.accrued", limit: 10 });
    expect(platformRows.rows.some((row) => row.orgId === null && row.actionKind === "platform.maintenance")).toBe(true);
    expect(tenantRows.rows.some((row) => row.orgId === ORG_B && row.actionKind === "interest.accrued")).toBe(true);
  });

  it("uses stable (at desc, id desc) cursor ordering without duplicates", async () => {
    const first = await service.list({ orgId: ORG_A, limit: 1 });
    const second = await service.list({ orgId: ORG_A, limit: 1, cursor: first.nextCursor ?? undefined });

    expect(first.rows.map((row) => row.id)).toEqual([TIE_NEWER_ID]);
    expect(second.rows.map((row) => row.id)).toEqual([TIE_OLDER_ID]);
    expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(2);
  });

  it("rejects cursor ids that only resemble UUIDs before querying", async () => {
    const malformedCursor = Buffer.from(JSON.stringify({
      at: "2026-07-12T23:59:59.999Z",
      id: "12345678-1234-1234-1234-12345678901-",
    }), "utf8").toString("base64url");

    await expect(service.list({ cursor: malformedCursor })).rejects.toThrow("audit_cursor_invalid");
  });

  it("parameterizes hostile filter text and exposes no mutation capability", async () => {
    const hostile = await service.list({ actionKind: "%' OR 1=1; DELETE FROM audit_log_entry; --", limit: 100 });
    expect(hostile.rows).toEqual([]);

    const metadata = await db.execute(sql`
      SELECT prosecdef, provolatile, proconfig, pg_get_functiondef(oid) AS definition
      FROM pg_proc
      WHERE oid = 'admin_read_audit_log(uuid,audit_log_entry_actor_kind_enum,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,uuid,integer)'::regprocedure
    `);
    expect(metadata.rows[0]).toEqual(expect.objectContaining({ prosecdef: true, provolatile: "s" }));
    expect(metadata.rows[0]?.proconfig).toEqual(expect.arrayContaining(["search_path=pg_catalog, public", "row_security=off"]));
    expect(String(metadata.rows[0]?.definition)).toMatch(/RETURN QUERY\s+SELECT/i);
    expect(String(metadata.rows[0]?.definition)).not.toMatch(/\b(INSERT|UPDATE|DELETE|EXECUTE)\b/i);
  });

  it("exports RFC4180 CSV with exact row parity and spreadsheet-formula neutralization", async () => {
    const rows = (await service.list({ orgId: ORG_A, actionKind: "recorded", limit: 10 })).rows;
    const csv = auditRowsToCsv(rows);

    expect(csv.startsWith("id,org_id,actor_kind,actor_id,action_kind,subject_kind,subject_id,payload_snapshot,reason,at\r\n")).toBe(true);
    expect(csv).toContain('"{\"\"amount\"\":\"\"10.00\"\",\"\"note\"\":\"\"=SUM(A1:A2)\"\"}"');
    expect(csv).toContain('"\'=HYPERLINK(\"\"https://invalid.example\"\",\"\"ok\"\")\nsecond line"');
    expect(csv.trimEnd().split("\r\n")).toHaveLength(2);
  });

  it("streams a deterministic large RFC4180 export directly across cursor pages", async () => {
    const at = new Date("2026-07-10T08:00:00.000Z");
    const ids = Array.from({ length: 1_205 }, (_, index) =>
      `70000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    );
    await db.insert(auditLogEntry).values(ids.map((id, index) => ({
      id,
      orgId: ORG_A,
      actorKind: "member" as const,
      actorId: ACTOR_A,
      actionKind: "bulk.export.row",
      subjectKind: "audit_fixture",
      subjectId: null,
      payloadSnapshot: { index, stable: true },
      reason: index === 602 ? "bulk,\"quoted\"\nrow" : null,
      at,
      createdAt: at,
    })));

    const stream = auditRowsToCsvStream(service.iterate({
      orgId: ORG_A,
      actionKind: "bulk.export.row",
    }));
    const reader = stream.getReader();
    const chunks: string[] = [];
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(Buffer.from(next.value).toString("utf8"));
    }

    expect(chunks).toHaveLength(ids.length + 1);
    expect(chunks[0]).toBe("id,org_id,actor_kind,actor_id,action_kind,subject_kind,subject_id,payload_snapshot,reason,at\r\n");
    expect(chunks[1]).toContain(ids.at(-1));
    expect(chunks.at(-1)).toContain(ids[0]);
    expect(chunks.some((chunk) => chunk.includes('"bulk,""quoted""\nrow"'))).toBe(true);
    expect(Math.max(...chunks.map((chunk) => Buffer.byteLength(chunk)))).toBeLessThan(1_024);
    expect(chunks.slice(1).every((chunk) => chunk.endsWith("\r\n"))).toBe(true);
  });
});
