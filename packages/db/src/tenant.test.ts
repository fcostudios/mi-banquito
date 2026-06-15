import { config } from "dotenv";
import { sql } from "drizzle-orm";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

config({ path: "../../.env.local" });
config({ path: "../../.env" });
config({ path: "../../apps/web/.env.local", override: true });

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
});
