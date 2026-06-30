ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS first_run_step INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_run_completed_at TIMESTAMPTZ;

ALTER TABLE group_config
  ADD COLUMN IF NOT EXISTS loan_rate_period_unit TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fiscal_year_start_day INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS base_fund_quota_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  org_id            UUID NOT NULL,
  fiscal_year       INTEGER NOT NULL,
  per_member_amount NUMERIC(18, 4) NOT NULL,
  currency_code     TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL,
  created_by        UUID NOT NULL,
  created_by_kind   TEXT NOT NULL,
  CONSTRAINT uq_base_fund_quota_config_org_id_fiscal_year UNIQUE (org_id, fiscal_year)
);
CREATE INDEX IF NOT EXISTS idx_base_fund_quota_config_org_id ON base_fund_quota_config(org_id);

CREATE TABLE IF NOT EXISTS base_fund_quota_payment (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  org_id                   UUID NOT NULL,
  member_id                UUID NOT NULL REFERENCES member(id),
  fiscal_year              INTEGER NOT NULL,
  amount                   NUMERIC(18, 4) NOT NULL,
  currency_code            TEXT NOT NULL,
  paid_on                  DATE NOT NULL,
  slip_photo_id            UUID REFERENCES slip_photo(id),
  paid_via_contribution_id UUID REFERENCES contribution(id),
  created_at               TIMESTAMPTZ NOT NULL,
  created_by               UUID NOT NULL,
  created_by_kind          TEXT NOT NULL,
  CONSTRAINT uq_base_fund_quota_payment_org_id_member_id_fiscal_year UNIQUE (org_id, member_id, fiscal_year)
);
CREATE INDEX IF NOT EXISTS idx_base_fund_quota_payment_org_id ON base_fund_quota_payment(org_id);
CREATE INDEX IF NOT EXISTS idx_base_fund_quota_payment_member_id ON base_fund_quota_payment(member_id);

ALTER TABLE base_fund_quota_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_fund_quota_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_fund_quota_config FORCE ROW LEVEL SECURITY;
ALTER TABLE base_fund_quota_payment FORCE ROW LEVEL SECURITY;

CREATE POLICY base_fund_quota_config_tenant_isolation ON base_fund_quota_config
USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY base_fund_quota_payment_tenant_isolation ON base_fund_quota_payment
USING (org_id = current_setting('app.current_org_id', true)::uuid);

DROP MATERIALIZED VIEW IF EXISTS mv_available_capital;
DROP MATERIALIZED VIEW IF EXISTS mv_base_fund_pool_per_fiscal_year;
DROP MATERIALIZED VIEW IF EXISTS mv_member_compliance_state;

CREATE MATERIALIZED VIEW mv_member_compliance_state AS
SELECT
  m.org_id,
  m.id AS member_id,
  m.display_name,
  CASE
    WHEN m.status <> 'activo' THEN 'al_dia'
    WHEN cc.id IS NULL THEN 'al_dia'
    WHEN COALESCE(SUM(c.amount), 0) >= cc.expected_amount_per_member THEN 'al_dia'
    WHEN CURRENT_DATE > cc.closes_on + COALESCE(gc.mora_threshold_days, 15) THEN 'en_mora'
    WHEN CURRENT_DATE > cc.closes_on + COALESCE(gc.late_threshold_days, 3) THEN 'atrasado'
    ELSE 'al_dia'
  END AS state,
  now() AS refreshed_at
FROM member m
LEFT JOIN contribution_cycle cc
  ON cc.org_id = m.org_id
 AND cc.status = 'open'
LEFT JOIN group_config gc
  ON gc.org_id = m.org_id
 AND gc.valid_to IS NULL
LEFT JOIN contribution c
  ON c.org_id = m.org_id
 AND c.member_id = m.id
 AND c.cycle_id = cc.id
GROUP BY
  m.org_id,
  m.id,
  m.display_name,
  m.status,
  cc.id,
  cc.expected_amount_per_member,
  cc.closes_on,
  gc.late_threshold_days,
  gc.mora_threshold_days;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_member_compliance_state_member_id
  ON mv_member_compliance_state(org_id, member_id);

CREATE MATERIALIZED VIEW mv_base_fund_pool_per_fiscal_year AS
SELECT
  org_id,
  fiscal_year,
  COALESCE(SUM(amount), 0)::NUMERIC(18, 4) AS base_fund_pool,
  now() AS refreshed_at
FROM base_fund_quota_payment
GROUP BY org_id, fiscal_year;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_base_fund_pool_per_fiscal_year
  ON mv_base_fund_pool_per_fiscal_year(org_id, fiscal_year);

CREATE MATERIALIZED VIEW mv_available_capital AS
WITH contribution_pool AS (
  SELECT
    org_id,
    COALESCE(SUM(amount), 0)::NUMERIC(18, 4) AS pool_balance
  FROM contribution
  GROUP BY org_id
),
latest_base_fund AS (
  SELECT DISTINCT ON (org_id)
    org_id,
    base_fund_pool
  FROM mv_base_fund_pool_per_fiscal_year
  ORDER BY org_id, fiscal_year DESC
)
SELECT
  cp.org_id,
  cp.pool_balance,
  COALESCE(lbf.base_fund_pool, 0)::NUMERIC(18, 4) AS base_fund_pool,
  (cp.pool_balance - COALESCE(lbf.base_fund_pool, 0))::NUMERIC(18, 4) AS available_capital,
  now() AS refreshed_at
FROM contribution_pool cp
LEFT JOIN latest_base_fund lbf ON lbf.org_id = cp.org_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_available_capital_org_id
  ON mv_available_capital(org_id);

CREATE OR REPLACE FUNCTION refresh_sprint1_read_models()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_member_compliance_state;
  REFRESH MATERIALIZED VIEW mv_base_fund_pool_per_fiscal_year;
  REFRESH MATERIALIZED VIEW mv_available_capital;
END;
$$;
