import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import pg from "pg";
import { describe, expect, it } from "vitest";

import { adminHealthSnapshot, cronRun } from "./schema";

config({ path: "../../.env.local" });
config({ path: "../../apps/web/.env.local" });

const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;

describe("Sprint 8 admin health substrate", () => {
  it("exposes the materialized-view and cron lookup contracts", () => {
    expect({
      orgId: adminHealthSnapshot.orgId.name,
      lastActivityAt: adminHealthSnapshot.lastActivityAt.name,
      lastCloseAt: adminHealthSnapshot.lastCloseAt.name,
      hasPendingReconciliation: adminHealthSnapshot.hasPendingReconciliation.name,
      openLoansCount: adminHealthSnapshot.openLoansCount.name,
      arTotal: adminHealthSnapshot.arTotal.name,
      refreshedAt: adminHealthSnapshot.refreshedAt.name,
    }).toEqual({
      orgId: "org_id",
      lastActivityAt: "last_activity_at",
      lastCloseAt: "last_close_at",
      hasPendingReconciliation: "has_pending_reconciliation",
      openLoansCount: "open_loans_count",
      arTotal: "ar_total",
      refreshedAt: "refreshed_at",
    });
    expect(cronRun.endpoint.name).toBe("endpoint");
    expect(cronRun.finishedAt.name).toBe("finished_at");
  });

  runIfDatabase("projects exactly one isolated health row per organization", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    const orgPending = randomUUID();
    const orgClean = randomUUID();
    const actor = randomUUID();
    const memberPending = randomUUID();
    const memberClean = randomUUID();
    const cyclePending = randomUUID();
    const cycleClean = randomUUID();
    const now = new Date("2026-07-12T12:00:00.000Z");

    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO organization (
          id, display_name, country_code, currency_code, timezone, default_language,
          status, created_at, created_by, created_by_kind
        ) VALUES
          ($1, 'Pending org', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', $4, $3, 'system'),
          ($2, 'Clean org', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', $4, $3, 'system')
      `, [orgPending, orgClean, actor, now]);
      await client.query(`
        INSERT INTO member (
          id, org_id, display_name, joined_on, role, status, initial_savings_balance,
          created_at, created_by, created_by_kind
        ) VALUES
          ($3, $1, 'Pending member', '2026-01-01', 'aportante', 'activo', 0, $6, $5, 'member'),
          ($4, $2, 'Clean member', '2026-01-01', 'aportante', 'activo', 0, $6, $5, 'member')
      `, [orgPending, orgClean, memberPending, memberClean, actor, now]);
      await client.query(`
        INSERT INTO contribution_cycle (
          id, org_id, cycle_label, kind, opens_on, closes_on, expected_amount_per_member,
          currency_code, status, created_at, created_by, created_by_kind
        ) VALUES
          ($3, $1, 'July pending', 'monthly', '2026-07-01', '2026-07-11', 20, 'USD', 'open', $6, $5, 'member'),
          ($4, $2, 'July clean', 'monthly', '2026-07-01', '2026-07-11', 20, 'USD', 'open', $6, $5, 'member')
      `, [orgPending, orgClean, cyclePending, cycleClean, actor, now]);
      await client.query(`
        INSERT INTO contribution (
          org_id, cycle_id, member_id, amount, currency_code, dated_on, recorded_at,
          reconciliation_status, created_at, created_by, created_by_kind
        ) VALUES
          ($1, $3, $5, 5, 'USD', '2026-07-10', $7, 'pending', $7, $8, 'member'),
          ($2, $4, $6, 20, 'USD', '2026-07-10', $7, 'regularized', $7, $8, 'member')
      `, [orgPending, orgClean, cyclePending, cycleClean, memberPending, memberClean, now, actor]);
      await client.query(`
        INSERT INTO loan (
          org_id, member_id, borrower_kind, borrower_member_id, principal_amount,
          currency_code, rate_value, rate_model, term_periods, grace_periods,
          originated_on, status, group_config_version_at_origination,
          created_at, created_by, created_by_kind
        ) VALUES
          ($1, $3, 'member', $3, 100, 'USD', 4, 'declining_balance', 4, 0, '2026-06-01', 'activo', 1, $5, $4, 'member'),
          ($1, $3, 'member', $3, 50, 'USD', 4, 'declining_balance', 2, 0, '2026-05-01', 'pagado', 1, $5, $4, 'member'),
          ($2, $6, 'member', $6, 200, 'USD', 4, 'declining_balance', 4, 0, '2026-06-01', 'en_mora', 1, $5, $4, 'member')
      `, [orgPending, orgClean, memberPending, actor, now, memberClean]);
      await client.query(`
        INSERT INTO audit_log_entry (
          org_id, actor_kind, actor_id, action_kind, subject_kind,
          payload_snapshot, at, created_at
        ) VALUES
          ($1, 'member', $3, 'test.activity', 'organization', '{}', '2026-07-11T10:00:00Z', $5),
          ($2, 'member', $4, 'test.activity', 'organization', '{}', '2026-07-10T10:00:00Z', $5)
      `, [orgPending, orgClean, memberPending, memberClean, now]);

      await client.query("REFRESH MATERIALIZED VIEW mv_ar_aging");
      await client.query("REFRESH MATERIALIZED VIEW mv_org_health_snapshot");
      const result = await client.query(`
        SELECT org_id, has_pending_reconciliation, open_loans_count, ar_total,
               last_activity_at, refreshed_at
        FROM mv_org_health_snapshot
        WHERE org_id = ANY($1::uuid[])
        ORDER BY org_id
      `, [[orgPending, orgClean]]);

      expect(result.rows).toHaveLength(2);
      const byOrg = new Map(result.rows.map((row) => [row.org_id, row]));
      expect(byOrg.get(orgPending)).toMatchObject({
        has_pending_reconciliation: true,
        open_loans_count: 1,
      });
      expect(byOrg.get(orgClean)).toMatchObject({
        has_pending_reconciliation: false,
        open_loans_count: 1,
      });
      expect(byOrg.get(orgPending)?.ar_total).not.toBe(byOrg.get(orgClean)?.ar_total);
      expect(byOrg.get(orgPending)?.last_activity_at.toISOString()).toBe("2026-07-11T10:00:00.000Z");
      expect(byOrg.get(orgPending)?.refreshed_at).toBeInstanceOf(Date);

      const indexes = await client.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN ('idx_mv_org_health_snapshot_org_id', 'idx_cron_run_endpoint_finished_at')
        ORDER BY indexname
      `);
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        "idx_cron_run_endpoint_finished_at",
        "idx_mv_org_health_snapshot_org_id",
      ]);
      const refreshFunction = await client.query(`
        SELECT to_regprocedure('refresh_admin_health_snapshot()') IS NOT NULL AS exists
      `);
      expect(refreshFunction.rows).toEqual([{ exists: true }]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });
});
