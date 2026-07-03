import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

config({ path: "../../.env.local" });
config({ path: "../../apps/web/.env.local", override: true });

const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;

describe("Sprint 3 schema substrate", () => {
  runIfDatabase("exposes alert_action and adjustment columns", async () => {
    const { db } = await import("./index");

    const result = await db.execute(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          table_name = 'alert_action'
          OR (table_name = 'reconciliation_cycle' AND column_name IN (
            'period_close_id',
            'adjustment_reason',
            'adjustment_window_opens_at',
            'adjustment_window_closes_at'
          ))
          OR (table_name IN ('contribution','withdrawal','expense','repayment','interest_accrual') AND column_name = 'adjustment_cycle_id')
        )
      ORDER BY table_name, column_name
    `);

    const actualColumns = result.rows.map((row) => `${row.table_name}.${row.column_name}`);

    expect(actualColumns).toEqual(
      expect.arrayContaining([
        "alert_action.action_kind",
        "alert_action.alert_id",
        "alert_action.actor_id",
        "alert_action.actor_kind",
        "alert_action.created_at",
        "alert_action.id",
        "alert_action.org_id",
        "alert_action.reason",
        "alert_action.snoozed_until",
        "contribution.adjustment_cycle_id",
        "expense.adjustment_cycle_id",
        "interest_accrual.adjustment_cycle_id",
        "reconciliation_cycle.adjustment_reason",
        "reconciliation_cycle.adjustment_window_closes_at",
        "reconciliation_cycle.adjustment_window_opens_at",
        "reconciliation_cycle.period_close_id",
        "repayment.adjustment_cycle_id",
        "withdrawal.adjustment_cycle_id",
      ]),
    );
  });

  runIfDatabase("exposes alert_action policy, index, and adjustment enum value", async () => {
    const { db } = await import("./index");

    const result = await db.execute(sql`
      SELECT
        EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'reconciliation_cycle_resolution_kind_enum'
            AND e.enumlabel = 'adjustment'
        ) AS has_adjustment_enum,
        EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'alert_action'
            AND indexname = 'idx_alert_action_org_alert_created'
        ) AS has_alert_action_index,
        COALESCE((
          SELECT c.relrowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname = 'alert_action'
        ), false) AS has_alert_action_rls,
        COALESCE((
          SELECT c.relforcerowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname = 'alert_action'
        ), false) AS has_alert_action_force_rls,
        EXISTS (
          SELECT 1
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'alert_action'
            AND policyname = 'alert_action_tenant_isolation'
        ) AS has_alert_action_policy,
        EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'ck_alert_action_kind'
            AND conrelid = 'alert_action'::regclass
        ) AS has_alert_action_kind_check,
        EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'ck_alert_action_snooze_payload'
            AND conrelid = 'alert_action'::regclass
        ) AS has_alert_action_snooze_check
    `);

    expect(result.rows[0]).toEqual({
      has_adjustment_enum: true,
      has_alert_action_index: true,
      has_alert_action_rls: true,
      has_alert_action_force_rls: true,
      has_alert_action_policy: true,
      has_alert_action_kind_check: true,
      has_alert_action_snooze_check: true,
    });
  });

  runIfDatabase("uses named append-only errors for ledger mutation triggers", async () => {
    const { db } = await import("./index");

    const result = await db.execute(sql`
      SELECT
        EXISTS (
          SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'raise_append_only_violation'
        ) AS has_append_only_function,
        COALESCE(
          array_agg(
            (c.relname || '.' || t.tgname || '->' || p.proname)::text
            ORDER BY c.relname, t.tgname
          ) FILTER (WHERE t.tgname IS NOT NULL),
          ARRAY[]::text[]
        ) AS trigger_bindings
      FROM (VALUES
        ('contribution'::name, 'contribution_no_mutate'::name),
        ('withdrawal'::name, 'withdrawal_no_mutate'::name),
        ('expense'::name, 'expense_no_mutate'::name),
        ('repayment'::name, 'repayment_no_mutate'::name),
        ('interest_accrual'::name, 'interest_accrual_no_mutate'::name)
      ) AS expected(table_name, trigger_name)
      LEFT JOIN pg_namespace n
        ON n.nspname = 'public'
      LEFT JOIN pg_class c
        ON c.relname = expected.table_name
       AND c.relnamespace = n.oid
      LEFT JOIN pg_trigger t
        ON t.tgrelid = c.oid
       AND t.tgname = expected.trigger_name
       AND NOT t.tgisinternal
      LEFT JOIN pg_proc p
        ON p.oid = t.tgfoid
    `);

    expect(result.rows[0]).toEqual({
      has_append_only_function: true,
      trigger_bindings: [
        "contribution.contribution_no_mutate->raise_append_only_violation",
        "expense.expense_no_mutate->raise_append_only_violation",
        "interest_accrual.interest_accrual_no_mutate->raise_append_only_violation",
        "repayment.repayment_no_mutate->raise_append_only_violation",
        "withdrawal.withdrawal_no_mutate->raise_append_only_violation",
      ],
    });
  });
});
