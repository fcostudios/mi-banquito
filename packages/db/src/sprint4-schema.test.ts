import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

config({ path: "../../.env.local" });
config({ path: "../../apps/web/.env.local", override: true });

const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;

describe("Sprint 4 schema substrate", () => {
  runIfDatabase("exposes collections and operations tables with required columns", async () => {
    const { db } = await import("./index");

    const result = await db.execute(sql`
      WITH expected(table_name, column_name) AS (
        VALUES
          ('promise', 'id'),
          ('promise', 'org_id'),
          ('promise', 'member_id'),
          ('promise', 'loan_id'),
          ('promise', 'cycle_id'),
          ('promise', 'promised_on'),
          ('promise', 'note'),
          ('promise', 'status'),
          ('promise', 'superseded_by_id'),
          ('promise', 'created_by'),
          ('promise', 'created_at'),
          ('promise_reminder', 'id'),
          ('promise_reminder', 'org_id'),
          ('promise_reminder', 'promise_id'),
          ('promise_reminder', 'reminder_date'),
          ('promise_reminder', 'alert_id'),
          ('promise_reminder', 'created_at'),
          ('loan_disbursement', 'id'),
          ('loan_disbursement', 'org_id'),
          ('loan_disbursement', 'loan_id'),
          ('loan_disbursement', 'disbursement_source'),
          ('loan_disbursement', 'amount'),
          ('loan_disbursement', 'currency_code'),
          ('loan_disbursement', 'disbursed_on'),
          ('loan_disbursement', 'created_at'),
          ('loan_disbursement', 'created_by'),
          ('loan_disbursement', 'created_by_kind'),
          ('treasurer_compensation_disbursement', 'id'),
          ('treasurer_compensation_disbursement', 'org_id'),
          ('treasurer_compensation_disbursement', 'member_id'),
          ('treasurer_compensation_disbursement', 'period_label'),
          ('treasurer_compensation_disbursement', 'amount'),
          ('treasurer_compensation_disbursement', 'currency_code'),
          ('treasurer_compensation_disbursement', 'kind_at_disbursement'),
          ('treasurer_compensation_disbursement', 'withdrawal_id'),
          ('treasurer_compensation_disbursement', 'disbursed_on'),
          ('treasurer_compensation_disbursement', 'created_at'),
          ('pilot_log_entry', 'id'),
          ('pilot_log_entry', 'org_id'),
          ('pilot_log_entry', 'observed_on'),
          ('pilot_log_entry', 'vocabulary_answer'),
          ('pilot_log_entry', 'paper_value'),
          ('pilot_log_entry', 'system_value'),
          ('pilot_log_entry', 'discrepancy'),
          ('pilot_log_entry', 'would_not_return_to_paper'),
          ('pilot_log_entry', 'clean_month'),
          ('pilot_log_entry', 'note'),
          ('pilot_log_entry', 'logged_by'),
          ('pilot_log_entry', 'created_at'),
          ('statement_archive', 'canonical_payload_hash')
      )
      SELECT e.table_name, e.column_name
      FROM expected e
      LEFT JOIN information_schema.columns c
        ON c.table_schema = 'public'
       AND c.table_name = e.table_name
       AND c.column_name = e.column_name
      WHERE c.column_name IS NULL
      ORDER BY e.table_name, e.column_name
    `);

    expect(result.rows).toEqual([]);
  });

  runIfDatabase("exposes Sprint 4 materialized views, uniqueness, indexes, and RLS policies", async () => {
    const { db } = await import("./index");

    const result = await db.execute(sql`
      SELECT
        EXISTS (
          SELECT 1
          FROM pg_matviews
          WHERE schemaname = 'public'
            AND matviewname = 'mv_ar_aging'
        ) AS has_ar_aging,
        EXISTS (
          SELECT 1
          FROM pg_matviews
          WHERE schemaname = 'public'
            AND matviewname = 'mv_liquidez_proyectada'
        ) AS has_projected_liquidity,
        EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'statement_archive'
            AND indexname = 'idx_statement_archive_hash_public_verify'
        ) AS has_statement_hash_index,
        (
          EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'promise'
              AND indexname = 'uq_promise_open_obligation'
          )
          OR EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = to_regclass('public.promise')
              AND conname = 'uq_promise_open_obligation'
          )
        ) AS has_open_promise_uniqueness,
        (
          EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'treasurer_compensation_disbursement'
              AND indexname = 'uq_treasurer_compensation_disbursement_org_period_label'
          )
          OR EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = to_regclass('public.treasurer_compensation_disbursement')
              AND conname = 'uq_treasurer_compensation_disbursement_org_period_label'
          )
        ) AS has_compensation_period_uniqueness,
        COALESCE(bool_and(c.relrowsecurity AND c.relforcerowsecurity), false) AS all_new_tables_force_rls,
        COALESCE(bool_and(p.policyname IS NOT NULL), false) AS all_new_tables_have_tenant_policy
      FROM (VALUES
        ('promise'::name, 'promise_tenant_isolation'::name),
        ('promise_reminder'::name, 'promise_reminder_tenant_isolation'::name),
        ('loan_disbursement'::name, 'loan_disbursement_tenant_isolation'::name),
        ('treasurer_compensation_disbursement'::name, 'treasurer_compensation_disbursement_tenant_isolation'::name),
        ('pilot_log_entry'::name, 'pilot_log_entry_tenant_isolation'::name)
      ) AS expected(table_name, policy_name)
      LEFT JOIN pg_class c
        ON c.relname = expected.table_name
       AND c.relnamespace = 'public'::regnamespace
      LEFT JOIN pg_policies p
        ON p.schemaname = 'public'
       AND p.tablename = expected.table_name
       AND p.policyname = expected.policy_name
    `);

    expect(result.rows[0]).toEqual({
      has_ar_aging: true,
      has_projected_liquidity: true,
      has_statement_hash_index: true,
      has_open_promise_uniqueness: true,
      has_compensation_period_uniqueness: true,
      all_new_tables_force_rls: true,
      all_new_tables_have_tenant_policy: true,
    });
  });
});
