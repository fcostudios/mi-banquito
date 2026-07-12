import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

config({ path: "../../.env.local" });
config({ path: "../../apps/web/.env.local" });

const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;

describe("Sprint 5 monthly close schema guards", () => {
  runIfDatabase("enforces monthly-close archive uniqueness and update-aware period locks", async () => {
    const { db } = await import("./index");

    const result = await db.execute(sql`
      WITH expected_trigger(table_name, trigger_name) AS (
        VALUES
          ('contribution', 'contribution_period_lock'),
          ('withdrawal', 'withdrawal_period_lock'),
          ('expense', 'expense_period_lock'),
          ('repayment', 'repayment_period_lock'),
          ('interest_accrual', 'interest_accrual_period_lock')
      )
      SELECT
        EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'statement_archive'
            AND indexname = 'uq_statement_archive_monthly_close_period'
            AND indexdef ILIKE '%period_close_id%'
            AND indexdef ILIKE '%monthly_close%'
        ) AS has_monthly_close_archive_unique_index,
        COALESCE(json_agg(et.table_name || '.' || et.trigger_name ORDER BY et.table_name) FILTER (
          WHERE NOT EXISTS (
            SELECT 1
            FROM information_schema.triggers t_insert
            JOIN information_schema.triggers t_update
              ON t_update.event_object_schema = t_insert.event_object_schema
             AND t_update.event_object_table = t_insert.event_object_table
             AND t_update.trigger_name = t_insert.trigger_name
            WHERE t_insert.event_object_schema = 'public'
              AND t_insert.event_object_table = et.table_name
              AND t_insert.trigger_name = et.trigger_name
              AND t_insert.event_manipulation = 'INSERT'
              AND t_update.event_manipulation = 'UPDATE'
          )
        ), '[]'::json) AS missing_update_aware_period_locks
      FROM expected_trigger et
    `);

    expect(result.rows).toEqual([{
      has_monthly_close_archive_unique_index: true,
      missing_update_aware_period_locks: [],
    }]);
  });
});
