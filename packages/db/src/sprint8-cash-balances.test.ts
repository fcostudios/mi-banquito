import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { cashBalances } from "./schema";

config({ path: "../../.env.local" });
config({ path: "../../apps/web/.env.local" });

const migrationUrl = new URL(
  "./migrations/V20260712210000__br12_cash_balance_projection.sql",
  import.meta.url,
);
const reversalMigrationUrl = new URL(
  "./migrations/V20260712224500__task4_cash_projection_reversals.sql",
  import.meta.url,
);
const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;

describe("BR-12 cash balance projection", () => {
  it("preserves the Drizzle consumer contract for the existing materialized view", () => {
    expect({
      orgId: cashBalances.orgId.name,
      bankBalance: cashBalances.bankBalance.name,
      pettyCashBalance: cashBalances.pettyCashBalance.name,
      refreshedAt: cashBalances.refreshedAt.name,
    }).toEqual({
      orgId: "org_id",
      bankBalance: "bank_balance",
      pettyCashBalance: "petty_cash_balance",
      refreshedAt: "refreshed_at",
    });
  });

  it("uses an append-only migration to preserve and correct the materialized-view contract", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    const migration = readFileSync(migrationUrl, "utf8");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION current_cash_balances");
    expect(migration).toContain("reconciliation_status = 'regularized'");
    expect(migration).toContain("is_group_fund = true");
    expect(migration).toContain("payment_source");
    expect(migration).toContain("FROM repayment");
    expect(migration).toContain("FROM transfer");
    expect(migration).toContain("DROP MATERIALIZED VIEW IF EXISTS mv_cash_balances");
    expect(migration).toContain("CREATE MATERIALIZED VIEW mv_cash_balances AS");
    expect(migration).toContain("idx_mv_cash_balances_org_id");
    const reversalMigration = readFileSync(reversalMigrationUrl, "utf8");
    expect(reversalMigration).toContain("NOT EXISTS");
    expect(reversalMigration).toContain("FROM expense");
    expect(reversalMigration).toContain("FROM loan_disbursement");
  });

  runIfDatabase("exposes the corrected function, unchanged columns, and unique refresh index", async () => {
    const { db } = await import("./index");
    const result = await db.execute(sql`
      SELECT
        to_regprocedure('current_cash_balances(uuid)') IS NOT NULL AS has_function,
        EXISTS (
          SELECT 1 FROM pg_matviews
          WHERE schemaname = 'public'
            AND matviewname = 'mv_cash_balances'
            AND definition ILIKE '%current_cash_balances%'
        ) AS view_uses_function,
        ARRAY(
          SELECT attribute.attname::text
          FROM pg_attribute attribute
          WHERE attribute.attrelid = 'public.mv_cash_balances'::regclass
            AND attribute.attnum > 0
            AND NOT attribute.attisdropped
          ORDER BY attribute.attnum
        )::text[] AS columns,
        EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'mv_cash_balances'
            AND indexname = 'idx_mv_cash_balances_org_id'
            AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
        ) AS has_unique_index
    `);
    expect(result.rows[0]).toEqual({
      has_function: true,
      view_uses_function: true,
      columns: ["org_id", "bank_balance", "petty_cash_balance", "refreshed_at"],
      has_unique_index: true,
    });
  });

  runIfDatabase("projects signs, reversals, tenant scope, pending coverage, full coverage, and ordinary transfers", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    const orgA = randomUUID();
    const orgB = randomUUID();
    const actor = randomUUID();
    const memberA = randomUUID();
    const memberB = randomUUID();
    const cycleA = randomUUID();
    const cycleB = randomUUID();
    const bankA = randomUUID();
    const cashA = randomUUID();
    const personalA = randomUUID();
    const bankB = randomUUID();
    const pending = randomUUID();
    const reversedTransfer = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO organization (
          id, display_name, country_code, currency_code, timezone, default_language,
          status, created_at, created_by, created_by_kind
        ) VALUES
          ($1, 'Projection A', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', now(), $3, 'system'),
          ($2, 'Projection B', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', now(), $3, 'system')
      `, [orgA, orgB, actor]);
      await client.query(`
        INSERT INTO account (id, org_id, name, type, is_group_fund, status, created_at, created_by)
        VALUES
          ($4, $1, 'Bank A', 'group_bank', true, 'active', now(), $3),
          ($5, $1, 'Cash A', 'cash_box', true, 'active', now(), $3),
          ($6, $1, 'Personal A', 'treasurer_personal', false, 'active', now(), $3),
          ($7, $2, 'Bank B', 'group_bank', true, 'active', now(), $3)
      `, [orgA, orgB, actor, bankA, cashA, personalA, bankB]);
      await client.query(`
        INSERT INTO member (
          id, org_id, display_name, joined_on, role, status, initial_savings_balance,
          created_at, created_by, created_by_kind
        ) VALUES
          ($4, $1, 'Member A', '2026-01-01', 'aportante', 'activo', 0, now(), $3, 'member'),
          ($5, $2, 'Member B', '2026-01-01', 'aportante', 'activo', 0, now(), $3, 'member')
      `, [orgA, orgB, actor, memberA, memberB]);
      await client.query(`
        INSERT INTO contribution_cycle (
          id, org_id, cycle_label, kind, opens_on, closes_on, expected_amount_per_member,
          currency_code, status, created_at, created_by, created_by_kind
        ) VALUES
          ($4, $1, 'Projection A', 'monthly', '2026-07-01', '2026-07-31', 100, 'USD', 'open', now(), $3, 'member'),
          ($5, $2, 'Projection B', 'monthly', '2026-07-01', '2026-07-31', 100, 'USD', 'open', now(), $3, 'member')
      `, [orgA, orgB, actor, cycleA, cycleB]);

      await client.query(`
        INSERT INTO contribution (
          id, org_id, cycle_id, member_id, kind, payment_source, amount, currency_code,
          dated_on, recorded_at, account_id, reconciliation_status, created_at, created_by, created_by_kind
        ) VALUES
          ($1, $2, $3, $4, 'regular', 'bank_transfer', 40, 'USD', '2026-07-10', now(), $5, 'regularized', now(), $6, 'member'),
          (gen_random_uuid(), $2, $3, $4, 'regular', 'bank_transfer', 100, 'USD', '2026-07-10', now(), $7, 'pending', now(), $6, 'member'),
          (gen_random_uuid(), $8, $9, $10, 'regular', 'bank_transfer', 500, 'USD', '2026-07-10', now(), $11, 'pending', now(), $6, 'member')
      `, [pending, orgA, cycleA, memberA, personalA, actor, bankA, orgB, cycleB, memberB, bankB]);
      await client.query(`
        INSERT INTO transfer (
          org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, regularizes_kind, regularizes_id, created_at, created_by
        ) VALUES ($1, $2, $3, 15, 'USD', '2026-07-11', 'regularization', 'contribution', $4, now(), $5)
      `, [orgA, personalA, bankA, pending, actor]);

      const partial = await client.query("SELECT * FROM current_cash_balances($1)", [orgA]);
      expect(partial.rows).toEqual([{ bank_balance: "115.0000", petty_cash_balance: "0.0000" }]);

      await client.query(`
        INSERT INTO transfer (
          org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, regularizes_kind, regularizes_id, created_at, created_by
        ) VALUES ($1, $2, $3, 25, 'USD', '2026-07-12', 'regularization', 'contribution', $4, now(), $5)
      `, [orgA, personalA, bankA, pending, actor]);
      await client.query(
        "UPDATE contribution SET reconciliation_status = 'regularized' WHERE org_id = $1 AND id = $2",
        [orgA, pending],
      );
      await client.query(`
        INSERT INTO transfer (
          id, org_id, from_account_id, to_account_id, amount, currency_code, dated_on, purpose, created_at, created_by
        ) VALUES
          (gen_random_uuid(), $1, $2, $3, 30, 'USD', '2026-07-13', 'transfer', now(), $4),
          ($5, $1, $2, $3, 10, 'USD', '2026-07-14', 'transfer', now(), $4)
      `, [orgA, bankA, cashA, actor, reversedTransfer]);
      await client.query(`
        INSERT INTO transfer (
          org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, reverses_id, created_at, created_by
        ) VALUES ($1, $2, $3, 10, 'USD', '2026-07-15', 'transfer_reversal', $4, now(), $5)
      `, [orgA, cashA, bankA, reversedTransfer, actor]);
      await client.query(`
        INSERT INTO expense (
          org_id, purpose, amount, currency_code, incurred_on, status, recorded_at,
          account_id, category, created_at, created_by, created_by_kind
        ) VALUES ($1, 'Supplies', 5, 'USD', '2026-07-15', 'paid', now(), $2, 'supplies', now(), $3, 'member')
      `, [orgA, bankA, actor]);

      const finalA = await client.query("SELECT * FROM current_cash_balances($1)", [orgA]);
      const finalB = await client.query("SELECT * FROM current_cash_balances($1)", [orgB]);
      expect(finalA.rows).toEqual([{ bank_balance: "105.0000", petty_cash_balance: "30.0000" }]);
      expect(finalB.rows).toEqual([{ bank_balance: "500.0000", petty_cash_balance: "0.0000" }]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });
});
