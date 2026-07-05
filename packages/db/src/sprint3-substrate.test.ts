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
        ) AS has_alert_action_snooze_check,
        EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'ck_reconciliation_cycle_adjustment_payload'
            AND conrelid = 'reconciliation_cycle'::regclass
        ) AS has_adjustment_payload_check,
        EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'reconciliation_cycle'
            AND indexname = 'uq_reconciliation_cycle_org_cycle_regular'
        ) AS has_regular_reconciliation_unique_index,
        EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'reconciliation_cycle'
            AND indexname = 'uq_reconciliation_cycle_org_period_close_adjustment'
        ) AS has_adjustment_reconciliation_unique_index
    `);

    expect(result.rows[0]).toEqual({
      has_adjustment_enum: true,
      has_alert_action_index: true,
      has_alert_action_rls: true,
      has_alert_action_force_rls: true,
      has_alert_action_policy: true,
      has_alert_action_kind_check: true,
      has_alert_action_snooze_check: true,
      has_adjustment_payload_check: true,
      has_regular_reconciliation_unique_index: true,
      has_adjustment_reconciliation_unique_index: true,
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

  runIfDatabase("binds period-lock insert triggers to enforce_period_lock", async () => {
    const { db } = await import("./index");

    const result = await db.execute(sql`
      SELECT
        EXISTS (
          SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'enforce_period_lock'
        ) AS has_period_lock_function,
        COALESCE(
          array_agg(
            (c.relname || '.' || t.tgname || '->' || p.proname)::text
            ORDER BY c.relname, t.tgname
          ) FILTER (WHERE t.tgname IS NOT NULL),
          ARRAY[]::text[]
        ) AS trigger_bindings
      FROM (VALUES
        ('contribution'::name, 'contribution_period_lock'::name),
        ('withdrawal'::name, 'withdrawal_period_lock'::name),
        ('expense'::name, 'expense_period_lock'::name),
        ('repayment'::name, 'repayment_period_lock'::name),
        ('interest_accrual'::name, 'interest_accrual_period_lock'::name)
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
      has_period_lock_function: true,
      trigger_bindings: [
        "contribution.contribution_period_lock->enforce_period_lock",
        "expense.expense_period_lock->enforce_period_lock",
        "interest_accrual.interest_accrual_period_lock->enforce_period_lock",
        "repayment.repayment_period_lock->enforce_period_lock",
        "withdrawal.withdrawal_period_lock->enforce_period_lock",
      ],
    });
  });

  runIfDatabase("enforces closed-period contribution inserts with adjustment windows", async () => {
    const { db } = await import("./index");
    const rollback = new Error("rollback_period_lock_test");

    try {
      await db.transaction(async (tx) => {
        const result = await tx.execute(sql`
          DO $$
          DECLARE
            test_org_id UUID := gen_random_uuid();
            test_actor_id UUID := gen_random_uuid();
            test_cycle_id UUID := gen_random_uuid();
            cross_cycle_id UUID := gen_random_uuid();
            open_adjustment_parent_cycle_id UUID := gen_random_uuid();
            test_member_id UUID := gen_random_uuid();
            test_loan_id UUID := gen_random_uuid();
            test_close_cycle_id UUID := gen_random_uuid();
            test_period_close_id UUID := gen_random_uuid();
            open_adjustment_cycle_id UUID := gen_random_uuid();
            insert_id UUID;
            got_period_locked BOOLEAN;
            got_adjustment_payload_check BOOLEAN;
          BEGIN
            PERFORM set_config('app.current_org_id', test_org_id::text, true);

            INSERT INTO organization (
              id,
              display_name,
              country_code,
              currency_code,
              timezone,
              default_language,
              status,
              created_at,
              created_by,
              created_by_kind
            )
            VALUES (
              test_org_id,
              'Period lock test org',
              'EC',
              'USD',
              'America/Guayaquil',
              'es',
              'active',
              now(),
              test_actor_id,
              'system'
            );

            INSERT INTO member (
              id,
              org_id,
              display_name,
              joined_on,
              role,
              status,
              initial_savings_balance,
              created_at,
              created_by,
              created_by_kind
            )
            VALUES (
              test_member_id,
              test_org_id,
              'Period Lock Tester',
              DATE '2026-01-01',
              'aportante',
              'activo',
              0,
              now(),
              test_actor_id,
              'system'
            );

            INSERT INTO loan (
              id,
              org_id,
              member_id,
              borrower_kind,
              borrower_member_id,
              principal_amount,
              currency_code,
              rate_value,
              rate_model,
              term_periods,
              grace_periods,
              originated_on,
              status,
              group_config_version_at_origination,
              created_at,
              created_by,
              created_by_kind
            )
            VALUES (
              test_loan_id,
              test_org_id,
              test_member_id,
              'member',
              test_member_id,
              100,
              'USD',
              5,
              'declining_balance',
              10,
              0,
              DATE '2026-01-01',
              'activo',
              1,
              now(),
              test_actor_id,
              'system'
            );

            INSERT INTO contribution_cycle (
              id,
              org_id,
              cycle_label,
              kind,
              opens_on,
              closes_on,
              expected_amount_per_member,
              currency_code,
              status,
              created_at,
              created_by,
              created_by_kind
            )
            VALUES (
              test_cycle_id,
              test_org_id,
              'period-lock-test-2026-01',
              'monthly',
              DATE '2026-01-01',
              DATE '2026-01-31',
              10,
              'USD',
              'closed',
              now(),
              test_actor_id,
              'system'
            );

            INSERT INTO contribution_cycle (
              id,
              org_id,
              cycle_label,
              kind,
              opens_on,
              closes_on,
              expected_amount_per_member,
              currency_code,
              status,
              created_at,
              created_by,
              created_by_kind
            )
            VALUES (
              cross_cycle_id,
              test_org_id,
              'period-lock-test-cross-cycle',
              'monthly',
              DATE '2026-01-01',
              DATE '2026-01-31',
              10,
              'USD',
              'open',
              now(),
              test_actor_id,
              'system'
            );

            INSERT INTO contribution_cycle (
              id,
              org_id,
              cycle_label,
              kind,
              opens_on,
              closes_on,
              expected_amount_per_member,
              currency_code,
              status,
              created_at,
              created_by,
              created_by_kind
            )
            VALUES
              (
                open_adjustment_parent_cycle_id,
                test_org_id,
                'period-lock-test-open-adjustment-parent',
                'monthly',
                DATE '2026-02-01',
                DATE '2026-02-28',
                10,
                'USD',
                'open',
                now(),
                test_actor_id,
                'system'
              );

            INSERT INTO reconciliation_cycle (
              id,
              org_id,
              cycle_id,
              declared_bank_balance,
              computed_pool_balance,
              discrepancy_amount,
              tolerance_amount,
              resolution_kind,
              closed_at,
              created_at,
              created_by,
              created_by_kind
            )
            VALUES (
              test_close_cycle_id,
              test_org_id,
              test_cycle_id,
              0,
              0,
              0,
              0,
              'auto_within_tolerance',
              TIMESTAMPTZ '2026-01-15 23:59:00+00',
              now(),
              test_actor_id,
              'system'
            );

            INSERT INTO period_close (
              id,
              org_id,
              cycle_id,
              reconciliation_cycle_id,
              closed_at,
              closed_by,
              closed_by_kind,
              is_year_end,
              created_at
            )
            VALUES (
              test_period_close_id,
              test_org_id,
              test_cycle_id,
              test_close_cycle_id,
              TIMESTAMPTZ '2026-01-15 23:59:00+00',
              test_actor_id,
              'system',
              false,
              now()
            );

            INSERT INTO reconciliation_cycle (
              id,
              org_id,
              cycle_id,
              declared_bank_balance,
              computed_pool_balance,
              discrepancy_amount,
              tolerance_amount,
              resolution_kind,
              period_close_id,
              closed_at,
              created_at,
              created_by,
              created_by_kind
            )
            VALUES (
              gen_random_uuid(),
              test_org_id,
              open_adjustment_parent_cycle_id,
              0,
              0,
              0,
              0,
              'auto_within_tolerance',
              test_period_close_id,
              now(),
              now(),
              test_actor_id,
              'system'
            );

            INSERT INTO reconciliation_cycle (
              id,
              org_id,
              cycle_id,
              declared_bank_balance,
              computed_pool_balance,
              discrepancy_amount,
              tolerance_amount,
              resolution_kind,
              period_close_id,
              adjustment_reason,
              adjustment_window_opens_at,
              adjustment_window_closes_at,
              created_at,
              created_by,
              created_by_kind
            )
            VALUES (
              open_adjustment_cycle_id,
              test_org_id,
              open_adjustment_parent_cycle_id,
              0,
              0,
              0,
              0,
              'adjustment',
              test_period_close_id,
              'open adjustment test',
              now() - INTERVAL '1 hour',
              now() + INTERVAL '1 hour',
              now(),
              test_actor_id,
              'system'
            );

            got_period_locked := false;
            BEGIN
              INSERT INTO contribution (
                id,
                org_id,
                cycle_id,
                member_id,
                amount,
                currency_code,
                dated_on,
                recorded_at,
                created_at,
                created_by,
                created_by_kind
              )
              VALUES (
                gen_random_uuid(),
                test_org_id,
                test_cycle_id,
                test_member_id,
                10,
                'USD',
                DATE '2026-01-15',
                now(),
                now(),
                test_actor_id,
                'system'
              );
            EXCEPTION
              WHEN SQLSTATE 'P0001' THEN
                IF SQLERRM = 'period_locked' THEN
                  got_period_locked := true;
                ELSE
                  RAISE;
                END IF;
            END;
            IF NOT got_period_locked THEN
              RAISE EXCEPTION 'expected untagged closed-period contribution to fail';
            END IF;

            got_period_locked := false;
            BEGIN
              INSERT INTO expense (
                id,
                org_id,
                purpose,
                amount,
                currency_code,
                incurred_on,
                status,
                recorded_at,
                created_at,
                created_by,
                created_by_kind
              )
              VALUES (
                gen_random_uuid(),
                test_org_id,
                'period lock expense branch',
                10,
                'USD',
                DATE '2026-01-15',
                'paid',
                now(),
                now(),
                test_actor_id,
                'system'
              );
            EXCEPTION
              WHEN SQLSTATE 'P0001' THEN
                IF SQLERRM = 'period_locked' THEN
                  got_period_locked := true;
                ELSE
                  RAISE;
                END IF;
            END;
            IF NOT got_period_locked THEN
              RAISE EXCEPTION 'expected locked-period expense to fail';
            END IF;

            got_period_locked := false;
            BEGIN
              INSERT INTO interest_accrual (
                id,
                org_id,
                loan_id,
                accrued_on,
                principal_basis,
                period_days,
                rate_value,
                interest_amount,
                currency_code,
                recorded_at,
                created_at,
                created_by_kind
              )
              VALUES (
                gen_random_uuid(),
                test_org_id,
                test_loan_id,
                DATE '2026-01-15',
                100,
                1,
                5,
                1,
                'USD',
                now(),
                now(),
                'system'
              );
            EXCEPTION
              WHEN SQLSTATE 'P0001' THEN
                IF SQLERRM = 'period_locked' THEN
                  got_period_locked := true;
                ELSE
                  RAISE;
                END IF;
            END;
            IF NOT got_period_locked THEN
              RAISE EXCEPTION 'expected locked-period interest accrual to fail';
            END IF;

            got_period_locked := false;
            BEGIN
              INSERT INTO withdrawal (
                id,
                org_id,
                member_id,
                amount,
                currency_code,
                dated_on,
                recorded_at,
                kind,
                created_at,
                created_by,
                created_by_kind
              )
              VALUES (
                gen_random_uuid(),
                test_org_id,
                test_member_id,
                10,
                'USD',
                DATE '2026-01-15',
                now(),
                'other',
                now(),
                test_actor_id,
                'system'
              );
            EXCEPTION
              WHEN SQLSTATE 'P0001' THEN
                IF SQLERRM = 'period_locked' THEN
                  got_period_locked := true;
                ELSE
                  RAISE;
                END IF;
            END;
            IF NOT got_period_locked THEN
              RAISE EXCEPTION 'expected locked-period withdrawal to fail';
            END IF;

            got_period_locked := false;
            BEGIN
              INSERT INTO repayment (
                id,
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
                created_at,
                created_by,
                created_by_kind
              )
              VALUES (
                gen_random_uuid(),
                test_org_id,
                test_loan_id,
                test_member_id,
                10,
                'USD',
                10,
                0,
                0,
                DATE '2026-01-15',
                now(),
                now(),
                test_actor_id,
                'system'
              );
            EXCEPTION
              WHEN SQLSTATE 'P0001' THEN
                IF SQLERRM = 'period_locked' THEN
                  got_period_locked := true;
                ELSE
                  RAISE;
                END IF;
            END;
            IF NOT got_period_locked THEN
              RAISE EXCEPTION 'expected locked-period repayment to fail';
            END IF;

            INSERT INTO contribution (
              id,
              org_id,
              cycle_id,
              member_id,
              amount,
              currency_code,
              dated_on,
              recorded_at,
              created_at,
              created_by,
              created_by_kind
            )
            VALUES (
              gen_random_uuid(),
              test_org_id,
              test_cycle_id,
              test_member_id,
              10,
              'USD',
              DATE '2026-01-16',
              now(),
              now(),
              test_actor_id,
              'system'
            );

            INSERT INTO contribution (
              id,
              org_id,
              cycle_id,
              member_id,
              amount,
              currency_code,
              dated_on,
              recorded_at,
              created_at,
              created_by,
              created_by_kind
            )
            VALUES (
              gen_random_uuid(),
              test_org_id,
              cross_cycle_id,
              test_member_id,
              10,
              'USD',
              DATE '2026-01-15',
              now(),
              now(),
              test_actor_id,
              'system'
            );

            insert_id := gen_random_uuid();
            INSERT INTO contribution (
              id,
              org_id,
              cycle_id,
              member_id,
              amount,
              currency_code,
              dated_on,
              recorded_at,
              adjustment_cycle_id,
              created_at,
              created_by,
              created_by_kind
            )
            VALUES (
              insert_id,
              test_org_id,
              test_cycle_id,
              test_member_id,
              10,
              'USD',
              DATE '2026-01-15',
              now(),
              open_adjustment_cycle_id,
              now(),
              test_actor_id,
              'system'
            );

            IF NOT EXISTS (
              SELECT 1 FROM contribution WHERE id = insert_id
            ) THEN
              RAISE EXCEPTION 'expected open adjustment contribution insert to persist';
            END IF;

            UPDATE reconciliation_cycle
            SET
              adjustment_window_opens_at = now() - INTERVAL '2 hours',
              adjustment_window_closes_at = now() - INTERVAL '1 hour'
            WHERE id = open_adjustment_cycle_id;

            got_period_locked := false;
            BEGIN
              INSERT INTO contribution (
                id,
                org_id,
                cycle_id,
                member_id,
                amount,
                currency_code,
                dated_on,
                recorded_at,
                adjustment_cycle_id,
                created_at,
                created_by,
                created_by_kind
              )
              VALUES (
                gen_random_uuid(),
                test_org_id,
                test_cycle_id,
                test_member_id,
                10,
                'USD',
                DATE '2026-01-15',
                now(),
                open_adjustment_cycle_id,
                now(),
                test_actor_id,
                'system'
              );
            EXCEPTION
              WHEN SQLSTATE 'P0001' THEN
                IF SQLERRM = 'period_locked' THEN
                  got_period_locked := true;
                ELSE
                  RAISE;
                END IF;
            END;
            IF NOT got_period_locked THEN
              RAISE EXCEPTION 'expected expired adjustment contribution to fail';
            END IF;
          END $$;
        `);

        expect(result.rowCount).toBeNull();
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) {
        throw error;
      }
    }
  });
});
