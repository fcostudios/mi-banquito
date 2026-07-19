import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";
import { describe, expect, it } from "vitest";

config({ path: "../../.env.local" });
config({ path: "../../apps/web/.env.local" });

const migrationUrl = new URL(
  "./migrations/V20260719115020__fail_closed_tenant_policies.sql",
  import.meta.url,
);
const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;
const testRole = "mi_banquito_rls_test";

describe("US-008 fail-closed tenant policy reconciliation", () => {
  runIfDatabase(
    "repairs stale policies and rejects absent, empty, foreign, and cross-tenant write contexts",
    async () => {
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      const client = await pool.connect();
      const orgA = randomUUID();
      const orgB = randomUUID();
      const memberA = randomUUID();
      const memberB = randomUUID();
      const actor = randomUUID();

      try {
        await client.query("BEGIN");
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${testRole}') THEN
              CREATE ROLE ${testRole} NOLOGIN;
            END IF;
          END
          $$;
          GRANT ${testRole} TO CURRENT_USER;
          GRANT USAGE ON SCHEMA public TO ${testRole};
          GRANT SELECT, INSERT ON member TO ${testRole};

          DROP POLICY IF EXISTS member_tenant_isolation ON member;
          CREATE POLICY member_tenant_isolation ON member
            USING (org_id = current_setting('app.current_org_id', true)::uuid)
            WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
        `);
        await client.query(
          `
            INSERT INTO organization (
              id, display_name, country_code, currency_code, timezone,
              default_language, status, created_at, created_by, created_by_kind
            ) VALUES
              ($1, 'RLS A', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', now(), $3, 'system'),
              ($2, 'RLS B', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', now(), $3, 'system')
          `,
          [orgA, orgB, actor],
        );
        await client.query(
          `
            INSERT INTO member (
              id, org_id, display_name, joined_on, role, status,
              initial_savings_balance, created_at, created_by, created_by_kind
            ) VALUES
              ($4, $1, 'RLS Member A', CURRENT_DATE, 'aportante', 'activo', 0, now(), $3, 'system'),
              ($5, $2, 'RLS Member B', CURRENT_DATE, 'aportante', 'activo', 0, now(), $3, 'system');
          `,
          [orgA, orgB, actor, memberA, memberB],
        );

        await client.query(readFileSync(migrationUrl, "utf8"));

        const policyHealth = await client.query(`
          SELECT
            COUNT(*) FILTER (WHERE columns.table_name IS NOT NULL)::integer AS tenant_tables,
            COUNT(*) FILTER (
              WHERE policies.policyname = policies.tablename || '_tenant_isolation'
                AND policies.qual ILIKE '%org_id%nullif%app.current_org_id%'
                AND policies.with_check ILIKE '%org_id%nullif%app.current_org_id%'
            )::integer AS fail_closed_policies
          FROM information_schema.columns columns
          LEFT JOIN pg_policies policies
            ON policies.schemaname = columns.table_schema
           AND policies.tablename = columns.table_name
          WHERE columns.table_schema = 'public'
            AND columns.column_name = 'org_id'
        `);
        expect(policyHealth.rows).toEqual([
          { tenant_tables: 47, fail_closed_policies: 47 },
        ]);

        await client.query(`SET LOCAL ROLE ${testRole}`);
        await client.query("RESET app.current_org_id");
        expect((await client.query("SELECT id FROM member")).rows).toEqual([]);

        await client.query("SELECT set_config('app.current_org_id', '', true)");
        expect((await client.query("SELECT id FROM member")).rows).toEqual([]);

        await client.query(
          "SELECT set_config('app.current_org_id', $1, true)",
          [orgA],
        );
        expect(
          (await client.query("SELECT org_id FROM member ORDER BY org_id")).rows,
        ).toEqual([{ org_id: orgA }]);

        await client.query(
          "SELECT set_config('app.current_org_id', $1, true)",
          [orgB],
        );
        expect(
          (await client.query("SELECT org_id FROM member ORDER BY org_id")).rows,
        ).toEqual([{ org_id: orgB }]);

        await client.query(
          "SELECT set_config('app.current_org_id', $1, true)",
          [orgA],
        );
        await expect(
          client.query(
            `
              INSERT INTO member (
                org_id, display_name, joined_on, role, status,
                initial_savings_balance, created_at, created_by, created_by_kind
              ) VALUES ($1, 'Cross tenant', CURRENT_DATE, 'aportante', 'activo', 0, now(), $2, 'system')
            `,
            [orgB, actor],
          ),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
        await pool.end();
      }
    },
  );
});
