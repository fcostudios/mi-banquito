import { sql } from "drizzle-orm";

import { db as defaultDb } from "@mi-banquito/db";
import type { adminHealthSnapshot, organization } from "@mi-banquito/db/schema";

type OrganizationRow = typeof organization.$inferSelect;
type HealthRow = typeof adminHealthSnapshot.$inferSelect;

export const ADMIN_HEALTH_STALE_AFTER_MS = 26 * 60 * 60 * 1_000;

export type AdminHealthSnapshot = Pick<OrganizationRow, "id" | "displayName" | "status" | "currencyCode"> & {
  orgId: string;
  lastActivityAt: HealthRow["lastActivityAt"];
  lastCloseAt: HealthRow["lastCloseAt"];
  hasPendingReconciliation: HealthRow["hasPendingReconciliation"] | null;
  openLoansCount: HealthRow["openLoansCount"] | null;
  arTotal: HealthRow["arTotal"] | null;
  refreshedAt: HealthRow["refreshedAt"] | null;
  snapshotStatus: "available" | "missing";
  freshness: "current" | "stale" | "unknown";
  driftExitCode: number | null;
  driftCheckedAt: Date | null;
  driftRawText: string | null;
};

export type AdminGlobalDrift = {
  exitCode: number;
  checkedAt: Date;
  rawText: string;
};

export type AdminHealthDashboard = {
  snapshots: AdminHealthSnapshot[];
  drift: AdminGlobalDrift | null;
  consecutiveCleanMonths: number;
};

export type AdminHealthQueryRow = {
  org_id: string | null;
  display_name: string | null;
  status: OrganizationRow["status"] | null;
  currency_code: string | null;
  last_activity_at: Date | string | null;
  last_close_at: Date | string | null;
  has_pending_reconciliation: boolean | null;
  open_loans_count: number | null;
  ar_total: string | null;
  refreshed_at: Date | string | null;
  drift_exit_code: number | null;
  drift_checked_at: Date | string | null;
  drift_raw_text: string | null;
  consecutive_clean_months: number | null;
};

type QueryResult<T> = T[] | { rows?: T[] };
type AdminHealthDb = {
  execute(query: unknown): Promise<QueryResult<AdminHealthQueryRow>>;
};

function rowsFromResult<T>(result: QueryResult<T>): T[] {
  return Array.isArray(result) ? result : result.rows ?? [];
}

function dateOrNull(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function adminHealthDashboardFromRows(
  rows: AdminHealthQueryRow[],
  now = new Date(),
): AdminHealthDashboard {
  const first = rows[0];
  const driftCheckedAt = dateOrNull(first?.drift_checked_at ?? null);
  const drift = first?.drift_exit_code !== null && first?.drift_exit_code !== undefined && driftCheckedAt
    ? {
        exitCode: first.drift_exit_code,
        checkedAt: driftCheckedAt,
        rawText: first.drift_raw_text ?? "",
      }
    : null;
  const snapshots = rows.flatMap((row): AdminHealthSnapshot[] => {
    const refreshedAt = dateOrNull(row.refreshed_at);
    if (!row.org_id || !row.display_name || !row.status || !row.currency_code) return [];
    const ageMs = refreshedAt ? now.getTime() - refreshedAt.getTime() : null;
    const freshness = refreshedAt === null
      ? "unknown"
      : ageMs !== null && ageMs >= 0 && ageMs <= ADMIN_HEALTH_STALE_AFTER_MS
        ? "current"
        : "stale";
    return [{
      id: row.org_id,
      orgId: row.org_id,
      displayName: row.display_name,
      status: row.status,
      currencyCode: row.currency_code,
      lastActivityAt: dateOrNull(row.last_activity_at),
      lastCloseAt: dateOrNull(row.last_close_at),
      hasPendingReconciliation: row.has_pending_reconciliation,
      openLoansCount: row.open_loans_count,
      arTotal: row.ar_total,
      refreshedAt,
      snapshotStatus: refreshedAt ? "available" : "missing",
      freshness,
      driftExitCode: row.drift_exit_code,
      driftCheckedAt,
      driftRawText: row.drift_raw_text,
    }];
  });
  return {
    snapshots,
    drift,
    consecutiveCleanMonths: first?.consecutive_clean_months ?? 0,
  };
}

export function createAdminHealthService(options: {
  db?: AdminHealthDb;
  endpoint?: string;
  now?: () => Date;
} = {}) {
  const db = options.db ?? (defaultDb as unknown as AdminHealthDb);
  const endpoint = options.endpoint ?? "/api/cron/drift-check";
  const now = options.now ?? (() => new Date());

  return {
    async getDashboard(): Promise<AdminHealthDashboard> {
      const checkedAt = now();
      const result = await db.execute(sql`
        WITH RECURSIVE completed_month AS (
          SELECT
            date_trunc('month', ${checkedAt}::timestamptz AT TIME ZONE 'UTC') - interval '1 month' AS month_start,
            date_trunc('month', ${checkedAt}::timestamptz AT TIME ZONE 'UTC')::date AS current_month_start
        ),
        active_orgs AS (
          SELECT id
          FROM organization
          WHERE status = 'active'
        ),
        reconciled_org_months AS (
          SELECT
            period_close.org_id,
            date_trunc('month', contribution_cycle.closes_on::timestamp) AS month_start,
            reconciliation_cycle.discrepancy_amount
          FROM period_close
          JOIN active_orgs ON active_orgs.id = period_close.org_id
          JOIN contribution_cycle
            ON contribution_cycle.id = period_close.cycle_id
            AND contribution_cycle.org_id = period_close.org_id
          JOIN reconciliation_cycle
            ON reconciliation_cycle.id = period_close.reconciliation_cycle_id
            AND reconciliation_cycle.org_id = period_close.org_id
            AND reconciliation_cycle.cycle_id = period_close.cycle_id
            AND reconciliation_cycle.period_close_id = period_close.id
            AND reconciliation_cycle.closed_at IS NOT NULL
          CROSS JOIN completed_month
          WHERE contribution_cycle.closes_on < completed_month.current_month_start
        ),
        successful_org_months AS (
          SELECT org_id, month_start
          FROM reconciled_org_months
          GROUP BY org_id, month_start
          HAVING bool_and(discrepancy_amount = 0::numeric)
        ),
        clean_months AS (
          SELECT successful_org_months.month_start
          FROM successful_org_months
          GROUP BY successful_org_months.month_start
          HAVING COUNT(DISTINCT successful_org_months.org_id) = (SELECT COUNT(*) FROM active_orgs)
            AND (SELECT COUNT(*) FROM active_orgs) > 0
        ),
        clean_streak(month_start) AS (
          SELECT completed_month.month_start
          FROM completed_month
          JOIN clean_months ON clean_months.month_start = completed_month.month_start
          UNION ALL
          SELECT clean_streak.month_start - interval '1 month'
          FROM clean_streak
          JOIN clean_months ON clean_months.month_start = clean_streak.month_start - interval '1 month'
        ),
        consecutive_clean AS (
          SELECT COUNT(*)::integer AS months FROM clean_streak
        ),
        latest_drift AS (
          SELECT latest.finished_at, latest.summary
          FROM (VALUES (1)) AS anchor(value)
          LEFT JOIN LATERAL (
            SELECT finished_at, summary
            FROM cron_run
            WHERE endpoint = ${endpoint}
            ORDER BY finished_at DESC, id DESC
            LIMIT 1
          ) latest ON true
        )
        SELECT
          organization.id AS org_id,
          organization.display_name,
          organization.status,
          organization.currency_code,
          health.last_activity_at,
          health.last_close_at,
          health.has_pending_reconciliation,
          health.open_loans_count,
          health.ar_total,
          health.refreshed_at,
          CASE
            WHEN jsonb_typeof(latest_drift.summary -> 'exitCode') = 'number'
              THEN (latest_drift.summary ->> 'exitCode')::integer
            ELSE NULL
          END AS drift_exit_code,
          latest_drift.finished_at AS drift_checked_at,
          CASE
            WHEN jsonb_typeof(latest_drift.summary -> 'rawText') = 'string'
              THEN latest_drift.summary ->> 'rawText'
            ELSE NULL
          END AS drift_raw_text,
          consecutive_clean.months AS consecutive_clean_months
        FROM latest_drift
        CROSS JOIN consecutive_clean
        LEFT JOIN organization ON true
        LEFT JOIN mv_org_health_snapshot health ON health.org_id = organization.id
        ORDER BY organization.display_name ASC NULLS FIRST, organization.id ASC NULLS FIRST
      `);

      return adminHealthDashboardFromRows(rowsFromResult(result), checkedAt);
    },
  };
}
