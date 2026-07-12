CREATE INDEX IF NOT EXISTS idx_cron_run_endpoint_finished_at
  ON cron_run(endpoint, finished_at DESC);

DROP MATERIALIZED VIEW IF EXISTS mv_org_health_snapshot;
CREATE MATERIALIZED VIEW mv_org_health_snapshot AS
WITH activity AS (
  SELECT org_id, MAX(at) AS last_activity_at
  FROM audit_log_entry
  WHERE org_id IS NOT NULL
  GROUP BY org_id
),
last_close AS (
  SELECT org_id, MAX(closed_at) AS last_close_at
  FROM period_close
  GROUP BY org_id
),
pending_reconciliation AS (
  SELECT cycle.org_id, true AS has_pending_reconciliation
  FROM contribution_cycle cycle
  WHERE cycle.status = 'open'
    AND (
      EXISTS (
        SELECT 1
        FROM contribution contribution_row
        WHERE contribution_row.org_id = cycle.org_id
          AND contribution_row.cycle_id = cycle.id
          AND contribution_row.reconciliation_status = 'pending'
      )
      OR EXISTS (
        SELECT 1
        FROM repayment repayment_row
        WHERE repayment_row.org_id = cycle.org_id
          AND repayment_row.dated_on BETWEEN cycle.opens_on AND cycle.closes_on
          AND repayment_row.reconciliation_status = 'pending'
      )
    )
  GROUP BY cycle.org_id
),
open_loans AS (
  SELECT org_id, COUNT(*)::integer AS open_loans_count
  FROM loan
  WHERE status IN ('originated', 'activo', 'en_mora')
  GROUP BY org_id
),
ar AS (
  SELECT org_id, COALESCE(SUM(amount_due), 0)::numeric(18, 4) AS ar_total
  FROM mv_ar_aging
  GROUP BY org_id
)
SELECT
  organization.id AS org_id,
  activity.last_activity_at,
  last_close.last_close_at,
  COALESCE(pending_reconciliation.has_pending_reconciliation, false) AS has_pending_reconciliation,
  COALESCE(open_loans.open_loans_count, 0)::integer AS open_loans_count,
  COALESCE(ar.ar_total, 0)::numeric(18, 4) AS ar_total,
  now() AS refreshed_at
FROM organization
LEFT JOIN activity ON activity.org_id = organization.id
LEFT JOIN last_close ON last_close.org_id = organization.id
LEFT JOIN pending_reconciliation ON pending_reconciliation.org_id = organization.id
LEFT JOIN open_loans ON open_loans.org_id = organization.id
LEFT JOIN ar ON ar.org_id = organization.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_org_health_snapshot_org_id
  ON mv_org_health_snapshot(org_id);

CREATE OR REPLACE FUNCTION refresh_admin_health_snapshot()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_ar_aging;
  REFRESH MATERIALIZED VIEW mv_org_health_snapshot;
END;
$$;
