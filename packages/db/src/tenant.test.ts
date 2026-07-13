import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { runWithTenantRequestContext } from "./request-context";

config({ path: "../../.env.local" });
config({ path: "../../.env" });
config({ path: "../../apps/web/.env.local" });

const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;
const testRole = "mi_banquito_rls_test";

describe("tenant RLS transaction helper", () => {
  let dbModule: typeof import("./tenant");

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      return;
    }
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${testRole}') THEN
            CREATE ROLE ${testRole} NOLOGIN;
          END IF;
        END
        $$;
        GRANT USAGE ON SCHEMA public TO ${testRole};
        GRANT SELECT, INSERT, DELETE ON member TO ${testRole};
      `);
    } finally {
      await pool.end();
    }
    dbModule = await import("./tenant");
  });

  runIfDatabase("scopes reads per transaction without leaking org context", async () => {
    const { withTenantTransaction } = dbModule;
    const orgA = "11111111-1111-4111-8111-111111111111";
    const orgB = "22222222-2222-4222-8222-222222222222";
    const actor = "33333333-3333-4333-8333-333333333333";
    const marker = `rls-${Date.now()}`;

    await withTenantTransaction(orgA, async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${testRole}`));
      await tx.execute(sql`
        INSERT INTO member (
          org_id, display_name, joined_on, role, status,
          initial_savings_balance, created_at, created_by, created_by_kind
        )
        VALUES (
          ${orgA}, ${`${marker}-a`}, CURRENT_DATE, 'aportante', 'activo',
          0, now(), ${actor}, 'system'
        )
      `);
    });

    await withTenantTransaction(orgB, async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${testRole}`));
      await tx.execute(sql`
        INSERT INTO member (
          org_id, display_name, joined_on, role, status,
          initial_savings_balance, created_at, created_by, created_by_kind
        )
        VALUES (
          ${orgB}, ${`${marker}-b`}, CURRENT_DATE, 'aportante', 'activo',
          0, now(), ${actor}, 'system'
        )
      `);
    });

    const rowsForA = await withTenantTransaction(orgA, async (tx) =>
      {
        await tx.execute(sql.raw(`SET LOCAL ROLE ${testRole}`));
        return tx.execute(sql`
        SELECT org_id, display_name
        FROM member
        WHERE display_name LIKE ${`${marker}-%`}
        ORDER BY display_name
      `);
      },
    );
    const rowsForB = await withTenantTransaction(orgB, async (tx) =>
      {
        await tx.execute(sql.raw(`SET LOCAL ROLE ${testRole}`));
        return tx.execute(sql`
        SELECT org_id, display_name
        FROM member
        WHERE display_name LIKE ${`${marker}-%`}
        ORDER BY display_name
      `);
      },
    );

    expect(rowsForA.rows).toEqual([{ org_id: orgA, display_name: `${marker}-a` }]);
    expect(rowsForB.rows).toEqual([{ org_id: orgB, display_name: `${marker}-b` }]);
  });

  runIfDatabase("fails closed when app.current_org_id is missing", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await pool.query("BEGIN");
      try {
        await pool.query(`SET LOCAL ROLE ${testRole}`);
        const result = await pool.query(`
          SELECT display_name
          FROM member
          ORDER BY display_name
          LIMIT 1
        `);
        expect(result.rows).toEqual([]);
      } finally {
        await pool.query("ROLLBACK");
      }
    } finally {
      await pool.end();
    }
  });

  runIfDatabase("fails closed when app.current_org_id is empty", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await pool.query("BEGIN");
      try {
        await pool.query(`SET LOCAL ROLE ${testRole}`);
        await pool.query("SET LOCAL app.current_org_id = ''");
        const result = await pool.query(`
          SELECT display_name
          FROM member
          ORDER BY display_name
          LIMIT 1
        `);
        expect(result.rows).toEqual([]);
      } finally {
        await pool.query("ROLLBACK");
      }
    } finally {
      await pool.end();
    }
  });

  runIfDatabase("allows only named system maintenance to bypass request read-only", async () => {
    const { withSystemTenantTransaction, withWritableTenantTransaction } = dbModule;
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const orgId = randomUUID();
    const actor = randomUUID();
    try {
      await pool.query(`
        INSERT INTO organization (
          id, display_name, country_code, currency_code, timezone, default_language,
          status, created_at, created_by, created_by_kind
        ) VALUES ($1, 'System helper test', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', now(), $2, 'system')
      `, [orgId, actor]);

      await runWithTenantRequestContext({ readOnly: true, orgId }, async () => {
        await expect(withWritableTenantTransaction(orgId, async () => undefined))
          .rejects.toThrow("impersonation_read_only");
        await expect(withSystemTenantTransaction(orgId, {
          operation: "monthly_close_artifact_maintenance",
          reason: "recover a pending artifact",
        }, async (tx) => {
          await tx.execute(sql.raw(`SET LOCAL ROLE ${testRole}`));
          await tx.execute(sql`
            INSERT INTO member (
              org_id, display_name, joined_on, role, status,
              initial_savings_balance, created_at, created_by, created_by_kind
            ) VALUES (
              ${orgId}, 'System maintenance member', CURRENT_DATE, 'aportante', 'activo',
              0, now(), ${actor}, 'system'
            )
          `);
        })).resolves.toBeUndefined();
        await expect(withSystemTenantTransaction(orgId, {
          operation: "forged_operation" as "monthly_close_artifact_maintenance",
          reason: "not allowlisted",
        }, async () => undefined)).rejects.toThrow("system_tenant_operation_not_allowed");
      });

      const persisted = await pool.query("SELECT display_name FROM member WHERE org_id = $1", [orgId]);
      expect(persisted.rows).toEqual([{ display_name: "System maintenance member" }]);
    } finally {
      await pool.query("DELETE FROM member WHERE org_id = $1", [orgId]);
      await pool.query("DELETE FROM organization WHERE id = $1", [orgId]);
      await pool.end();
    }
  });

  runIfDatabase("serializes same-tenant money writes while another tenant proceeds", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const holder = await pool.connect();
    const writer = await pool.connect();
    const orgA = randomUUID();
    const orgB = randomUUID();
    const accountA = randomUUID();
    const accountB = randomUUID();
    const actor = randomUUID();
    try {
      await pool.query(`
        INSERT INTO organization (
          id, display_name, country_code, currency_code, timezone, default_language,
          status, created_at, created_by, created_by_kind
        ) VALUES
          ($1, 'Lock A', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', now(), $3, 'system'),
          ($2, 'Lock B', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', now(), $3, 'system')
      `, [orgA, orgB, actor]);
      await pool.query(`
        INSERT INTO account (id, org_id, name, type, is_group_fund, status, created_at, created_by)
        VALUES
          ($4, $1, 'Banco A', 'group_bank', true, 'active', now(), $3),
          ($5, $2, 'Banco B', 'group_bank', true, 'active', now(), $3)
      `, [orgA, orgB, actor, accountA, accountB]);

      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`tenant-money:${orgA}`]);

      await writer.query("BEGIN");
      await writer.query("SET LOCAL lock_timeout = '100ms'");
      await expect(writer.query(`
        INSERT INTO expense (
          org_id, purpose, amount, currency_code, incurred_on, status, recorded_at,
          account_id, category, created_at, created_by, created_by_kind
        ) VALUES ($1, 'blocked', 1, 'USD', CURRENT_DATE, 'paid', now(), $2, 'operating', now(), $3, 'member')
      `, [orgA, accountA, actor])).rejects.toMatchObject({ code: "55P03" });
      await writer.query("ROLLBACK");

      await writer.query("BEGIN");
      await writer.query("SET LOCAL lock_timeout = '100ms'");
      await expect(writer.query(`
        INSERT INTO expense (
          org_id, purpose, amount, currency_code, incurred_on, status, recorded_at,
          account_id, category, created_at, created_by, created_by_kind
        ) VALUES ($1, 'other tenant', 1, 'USD', CURRENT_DATE, 'paid', now(), $2, 'operating', now(), $3, 'member')
      `, [orgB, accountB, actor])).resolves.toMatchObject({ rowCount: 1 });
      await writer.query("ROLLBACK");
      await holder.query("ROLLBACK");
    } finally {
      await holder.query("ROLLBACK").catch(() => undefined);
      await writer.query("ROLLBACK").catch(() => undefined);
      holder.release();
      writer.release();
      await pool.query("DELETE FROM account WHERE org_id = ANY($1::uuid[])", [[orgA, orgB]]);
      await pool.query("DELETE FROM organization WHERE id = ANY($1::uuid[])", [[orgA, orgB]]);
      await pool.end();
    }
  });
});
