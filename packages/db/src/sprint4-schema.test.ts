import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import pg from "pg";
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
          ('promise', 'period_label'),
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

  runIfDatabase("models pilot log free-text comparison fields", async () => {
    const { db } = await import("./index");

    const result = await db.execute(sql`
      WITH expected(column_name, data_type) AS (
        VALUES
          ('paper_value', 'text'),
          ('system_value', 'text'),
          ('discrepancy', 'text')
      )
      SELECT e.column_name, c.data_type
      FROM expected e
      LEFT JOIN information_schema.columns c
        ON c.table_schema = 'public'
       AND c.table_name = 'pilot_log_entry'
       AND c.column_name = e.column_name
      WHERE c.data_type IS DISTINCT FROM e.data_type
      ORDER BY e.column_name
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
            AND matviewname = 'mv_ar_aging'
            AND definition ILIKE '%LEFT JOIN%member%'
            AND definition ILIKE '%LEFT JOIN%non_member_borrower%'
            AND definition ILIKE '%loan_guarantor%'
            AND definition ILIKE '%guarantor_member_id%'
            AND definition ILIKE '%borrower_non_member_id%'
            AND definition ILIKE '%COALESCE%'
            AND definition ILIKE '%assumed_at DESC%'
            AND definition ILIKE '%created_at DESC%'
        ) AS ar_aging_supports_non_member_loans,
        EXISTS (
          SELECT 1
          FROM pg_matviews
          WHERE schemaname = 'public'
            AND matviewname = 'mv_liquidez_proyectada'
        ) AS has_projected_liquidity,
        EXISTS (
          SELECT 1
          FROM pg_matviews
          WHERE schemaname = 'public'
            AND matviewname = 'mv_available_capital'
            AND definition ILIKE '%loan_disbursement%'
            AND definition ILIKE '%repayment%'
            AND definition ILIKE '%withdrawal%'
            AND definition ILIKE '%expense%'
        ) AS available_capital_models_cash_in_and_out,
        EXISTS (
          SELECT 1
          FROM pg_matviews
          WHERE schemaname = 'public'
            AND matviewname = 'mv_liquidez_proyectada'
            AND definition ILIKE '%loan_schedule%'
            AND definition ILIKE '%paid_principal_to_date%'
            AND definition ILIKE '%paid_interest_to_date%'
            AND definition ILIKE '%date_trunc%'
        ) AS projected_liquidity_models_scheduled_collections,
        EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'statement_archive'
            AND indexname = 'idx_statement_archive_hash_public_verify'
        ) AS has_statement_hash_index,
        EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'promise'
            AND indexname = 'uq_promise_open_obligation'
            AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
            AND indexdef ILIKE '%WHERE%'
            AND indexdef ILIKE '%status%'
            AND indexdef ILIKE '%open%'
            AND indexdef ILIKE '%period_label%'
        ) AS has_open_promise_partial_unique_index,
        (
          SELECT count(*)::integer
          FROM pg_constraint c
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid
           AND a.attnum = ANY(c.conkey)
          WHERE c.conrelid = 'promise'::regclass
            AND c.confrelid = 'promise'::regclass
            AND a.attname = 'superseded_by_id'
        ) AS promise_superseded_self_fk_count,
        EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid
           AND a.attnum = ANY(c.conkey)
          WHERE c.conrelid = 'promise'::regclass
            AND c.confrelid = 'promise'::regclass
            AND c.conname = 'fk_promise_superseded_by'
            AND a.attname = 'superseded_by_id'
        ) AS has_promise_superseded_self_fk,
        EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'mv_ar_aging'
            AND indexname = 'idx_mv_ar_aging_unique_obligation'
            AND indexdef ILIKE '%COALESCE(member_id%'
        ) AS has_nullable_member_ar_aging_unique_index,
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
      ar_aging_supports_non_member_loans: true,
      has_projected_liquidity: true,
      available_capital_models_cash_in_and_out: true,
      projected_liquidity_models_scheduled_collections: true,
      has_statement_hash_index: true,
      has_open_promise_partial_unique_index: true,
      promise_superseded_self_fk_count: 1,
      has_promise_superseded_self_fk: true,
      has_nullable_member_ar_aging_unique_index: true,
      has_compensation_period_uniqueness: true,
      all_new_tables_force_rls: true,
      all_new_tables_have_tenant_policy: true,
    });
  });

  runIfDatabase("anchors non-member loan obligations to the active guarantor while displaying borrower details", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    const orgId = randomUUID();
    const actorId = randomUUID();
    const guarantorId = randomUUID();
    const repaymentMemberId = randomUUID();
    const borrowerId = randomUUID();
    const loanId = randomUUID();

    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgId]);
      await client.query(
        `
          INSERT INTO member (
            id,
            org_id,
            display_name,
            whatsapp_number,
            joined_on,
            role,
            status,
            initial_savings_balance,
            created_at,
            created_by,
            created_by_kind
          )
          VALUES
            ($1, $2, 'Garantia Activa', '+593987650001', '2026-01-01', 'aportante', 'activo', 0, now(), $3, 'system'),
            ($4, $2, 'Pago de Otra Socia', '+593987650002', '2026-01-01', 'aportante', 'activo', 0, now(), $3, 'system')
        `,
        [guarantorId, orgId, actorId, repaymentMemberId],
      );
      await client.query(
        `
          INSERT INTO non_member_borrower (
            id,
            org_id,
            display_name,
            whatsapp_number,
            created_at,
            created_by,
            created_by_kind
          )
          VALUES ($1, $2, 'Persona Externa', '+593987650099', now(), $3, 'system')
        `,
        [borrowerId, orgId, actorId],
      );
      await client.query(
        `
          INSERT INTO loan (
            id,
            org_id,
            borrower_kind,
            borrower_non_member_id,
            principal_amount,
            currency_code,
            rate_value,
            rate_model,
            term_periods,
            grace_periods,
            originated_on,
            status,
            created_at,
            created_by,
            created_by_kind
          )
          VALUES ($1, $2, 'non_member', $3, 100, 'USD', 5, 'declining_balance', 1, 0, '2026-01-01', 'activo', now(), $4, 'system')
        `,
        [loanId, orgId, borrowerId, actorId],
      );
      await client.query(
        `
          INSERT INTO loan_guarantor (
            org_id,
            loan_id,
            guarantor_member_id,
            assumed_at,
            liability_amount,
            currency_code,
            created_at,
            created_by,
            created_by_kind
          )
          VALUES ($1, $2, $3, '2026-01-01T00:00:00Z', 100, 'USD', now(), $4, 'system')
        `,
        [orgId, loanId, guarantorId, actorId],
      );
      await client.query(
        `
          INSERT INTO loan_schedule (
            org_id,
            loan_id,
            period_index,
            due_on,
            principal_due,
            interest_due,
            status,
            paid_principal_to_date,
            paid_interest_to_date,
            created_at,
            created_by_kind
          )
          VALUES ($1, $2, 1, CURRENT_DATE - INTERVAL '3 days', 80, 20, 'parcial', 10, 5, now(), 'system')
        `,
        [orgId, loanId],
      );
      await client.query(
        `
          INSERT INTO repayment (
            org_id,
            loan_id,
            member_id,
            amount,
            currency_code,
            applied_to_principal,
            applied_to_interest,
            applied_to_fee,
            dated_on,
            recorded_at,
            client_request_id,
            created_at,
            created_by,
            created_by_kind
          )
          VALUES ($1, $2, $3, 15, 'USD', 10, 5, 0, CURRENT_DATE - INTERVAL '1 day', now(), $4, now(), $5, 'system')
        `,
        [orgId, loanId, repaymentMemberId, randomUUID(), actorId],
      );

      await client.query("REFRESH MATERIALIZED VIEW mv_ar_aging");
      const result = await client.query(
        `
          SELECT member_id, member_name, whatsapp_number, amount_due
          FROM mv_ar_aging
          WHERE org_id = $1
            AND loan_id = $2
            AND reason_kind = 'cuota'
        `,
        [orgId, loanId],
      );

      expect(result.rows).toEqual([
        {
          member_id: guarantorId,
          member_name: "Persona Externa",
          whatsapp_number: "+593987650099",
          amount_due: "85.0000",
        },
      ]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  });
});
