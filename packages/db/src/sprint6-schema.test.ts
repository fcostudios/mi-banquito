import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  distributableSurplus,
  loanActivityPoints,
  memberComplianceState,
  memberTimeWeightedBalance,
} from "./schema";

config({ path: "../../.env.local" });
config({ path: "../../apps/web/.env.local" });

const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;

describe("Sprint 6 schema", () => {
  it("exports member balance and year-end materialized views", () => {
    expect(memberComplianceState.currentBalance.name).toBe("current_balance");
    expect(memberTimeWeightedBalance.saldoPonderadoUsdDias.name).toBe("saldo_ponderado_usd_dias");
    expect(loanActivityPoints.loanActivityBasis.name).toBe("loan_activity_basis");
    expect(distributableSurplus.distributableSurplus.name).toBe("distributable_surplus");
  });

  it("derives member compliance from aging obligations", () => {
    const migration = readFileSync(
      new URL("./migrations/V20260709011000__align_compliance_with_ar_aging.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("FROM mv_ar_aging aging");
    expect(migration).toContain("WHEN member_aging.max_days_late IS NOT NULL THEN 'atrasado'");
  });

  it("refreshes aging before compliance in the shared read-model refresh function", () => {
    const migration = readFileSync(
      new URL("./migrations/V20260709213000__refresh_ar_aging_before_compliance.sql", import.meta.url),
      "utf8",
    );

    expect(migration.indexOf("REFRESH MATERIALIZED VIEW mv_ar_aging"))
      .toBeGreaterThanOrEqual(0);
    expect(migration.indexOf("REFRESH MATERIALIZED VIEW mv_ar_aging"))
      .toBeLessThan(migration.indexOf("REFRESH MATERIALIZED VIEW mv_member_compliance_state"));
  });

  runIfDatabase("exposes member balance, year-end materialized views, and archive/dedup indexes", async () => {
    const { db } = await import("./index");

    const result = await db.execute(sql`
      SELECT
        EXISTS (
          SELECT 1
          FROM pg_attribute
          WHERE attrelid = 'public.mv_member_compliance_state'::regclass
            AND attname = 'current_balance'
            AND NOT attisdropped
        ) AS has_current_balance,
        to_regclass('public.mv_member_time_weighted_balance') IS NOT NULL AS has_time_weighted_balance,
        to_regclass('public.mv_loan_activity_points') IS NOT NULL AS has_loan_activity_points,
        to_regclass('public.mv_distributable_surplus') IS NOT NULL AS has_distributable_surplus,
        EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'statement_archive'
            AND indexname = 'uq_statement_archive_org_kind_member_period'
            AND indexdef ILIKE '%member_id IS NOT NULL%'
        ) AS has_statement_member_unique,
        EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'uq_alert_org_id_alert_kind_subject_kind_subject_id_dedup_window_end'
            AND conrelid = to_regclass('public.alert')
        ) AS has_alert_dedup
    `);

    expect(result.rows[0]).toMatchObject({
      has_current_balance: true,
      has_time_weighted_balance: true,
      has_loan_activity_points: true,
      has_distributable_surplus: true,
      has_statement_member_unique: true,
      has_alert_dedup: true,
    });
  });
});
