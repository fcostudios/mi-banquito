import { sql } from "drizzle-orm";

import { db as defaultDb } from "@mi-banquito/db";
import type { adminHealthSnapshot, organization } from "@mi-banquito/db/schema";

type OrganizationRow = typeof organization.$inferSelect;
type HealthRow = typeof adminHealthSnapshot.$inferSelect;

export type AdminHealthSnapshot = Pick<
  OrganizationRow,
  "id" | "displayName" | "status" | "currencyCode"
> & Omit<HealthRow, "orgId"> & {
  orgId: string;
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
};

type QueryResult<T> = T[] | { rows?: T[] };
type AdminHealthDb = {
  execute(query: unknown): Promise<QueryResult<AdminHealthQueryRow>>;
};

function rowsFromResult<T>(result: QueryResult<T>): T[] {
  return Array.isArray(result) ? result : result.rows ?? [];
}

function dateOrNull(value: Date | string | null): Date | null {
  return value === null ? null : value instanceof Date ? value : new Date(value);
}

export function adminHealthDashboardFromRows(rows: AdminHealthQueryRow[]): AdminHealthDashboard {
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
    if (!row.org_id || !row.display_name || !row.status || !row.currency_code || !refreshedAt) return [];
    return [{
      id: row.org_id,
      orgId: row.org_id,
      displayName: row.display_name,
      status: row.status,
      currencyCode: row.currency_code,
      lastActivityAt: dateOrNull(row.last_activity_at),
      lastCloseAt: dateOrNull(row.last_close_at),
      hasPendingReconciliation: row.has_pending_reconciliation ?? false,
      openLoansCount: row.open_loans_count ?? 0,
      arTotal: row.ar_total ?? "0.0000",
      refreshedAt,
      driftExitCode: row.drift_exit_code,
      driftCheckedAt,
      driftRawText: row.drift_raw_text,
    }];
  });
  return { snapshots, drift };
}

export function createAdminHealthService(options: { db?: AdminHealthDb } = {}) {
  const db = options.db ?? (defaultDb as unknown as AdminHealthDb);

  return {
    async getDashboard(): Promise<AdminHealthDashboard> {
      const result = await db.execute(sql`
        WITH latest_drift AS (
          SELECT latest.finished_at, latest.summary
          FROM (VALUES (1)) AS anchor(value)
          LEFT JOIN LATERAL (
            SELECT finished_at, summary
            FROM cron_run
            WHERE endpoint = '/api/cron/drift-check'
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
          COALESCE(health.has_pending_reconciliation, false) AS has_pending_reconciliation,
          COALESCE(health.open_loans_count, 0)::integer AS open_loans_count,
          COALESCE(health.ar_total, 0)::numeric(18, 4) AS ar_total,
          COALESCE(health.refreshed_at, organization.created_at) AS refreshed_at,
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
          END AS drift_raw_text
        FROM latest_drift
        LEFT JOIN organization ON true
        LEFT JOIN mv_org_health_snapshot health ON health.org_id = organization.id
        ORDER BY organization.display_name ASC NULLS FIRST, organization.id ASC NULLS FIRST
      `);

      return adminHealthDashboardFromRows(rowsFromResult(result));
    },
  };
}
