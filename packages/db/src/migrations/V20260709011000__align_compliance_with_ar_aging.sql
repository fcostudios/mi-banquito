DROP MATERIALIZED VIEW IF EXISTS mv_member_compliance_state;
CREATE MATERIALIZED VIEW mv_member_compliance_state AS
WITH member_contributions AS (
  SELECT
    c.org_id,
    c.member_id,
    COALESCE(SUM(c.amount), 0)::NUMERIC(18, 4) AS contribution_total
  FROM contribution c
  GROUP BY c.org_id, c.member_id
),
member_withdrawals AS (
  SELECT
    w.org_id,
    w.member_id,
    COALESCE(SUM(w.amount), 0)::NUMERIC(18, 4) AS withdrawal_total
  FROM withdrawal w
  GROUP BY w.org_id, w.member_id
),
member_aging AS (
  SELECT
    aging.org_id,
    aging.member_id,
    MAX(aging.days_late)::integer AS max_days_late
  FROM mv_ar_aging aging
  WHERE aging.member_id IS NOT NULL
  GROUP BY aging.org_id, aging.member_id
)
SELECT
  m.org_id,
  m.id AS member_id,
  m.display_name,
  CASE
    WHEN m.status <> 'activo' THEN 'al_dia'
    WHEN COALESCE(member_aging.max_days_late, 0) > COALESCE(gc.mora_threshold_days, 15) THEN 'en_mora'
    WHEN member_aging.max_days_late IS NOT NULL THEN 'atrasado'
    ELSE 'al_dia'
  END AS state,
  (
    COALESCE(m.initial_savings_balance, 0)
    + COALESCE(member_paid.contribution_total, 0)
    - COALESCE(member_withdrawn.withdrawal_total, 0)
  )::NUMERIC(18, 4) AS current_balance,
  now() AS refreshed_at
FROM member m
LEFT JOIN group_config gc
  ON gc.org_id = m.org_id
 AND gc.valid_to IS NULL
LEFT JOIN member_aging
  ON member_aging.org_id = m.org_id
 AND member_aging.member_id = m.id
LEFT JOIN member_contributions member_paid
  ON member_paid.org_id = m.org_id
 AND member_paid.member_id = m.id
LEFT JOIN member_withdrawals member_withdrawn
  ON member_withdrawn.org_id = m.org_id
 AND member_withdrawn.member_id = m.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_member_compliance_state_member_id
ON mv_member_compliance_state(org_id, member_id);

CREATE INDEX IF NOT EXISTS idx_mv_member_compliance_state_display_name
ON mv_member_compliance_state(org_id, lower(display_name));
