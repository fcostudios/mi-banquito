DROP MATERIALIZED VIEW IF EXISTS mv_liquidez_proyectada;
DROP MATERIALIZED VIEW IF EXISTS mv_available_capital;

CREATE MATERIALIZED VIEW mv_available_capital AS
WITH contribution_pool AS (
  SELECT
    org_id,
    COALESCE(SUM(amount), 0)::NUMERIC(18, 4) AS amount
  FROM contribution
  GROUP BY org_id
),
repayment_pool AS (
  SELECT
    org_id,
    COALESCE(SUM(amount), 0)::NUMERIC(18, 4) AS amount
  FROM repayment
  WHERE reverses_id IS NULL
  GROUP BY org_id
),
withdrawal_pool AS (
  SELECT
    org_id,
    COALESCE(SUM(amount), 0)::NUMERIC(18, 4) AS amount
  FROM withdrawal
  WHERE reverses_id IS NULL
  GROUP BY org_id
),
expense_pool AS (
  SELECT
    org_id,
    COALESCE(SUM(amount), 0)::NUMERIC(18, 4) AS amount
  FROM expense
  WHERE reverses_id IS NULL
  GROUP BY org_id
),
loan_disbursement_pool AS (
  SELECT
    org_id,
    COALESCE(SUM(amount), 0)::NUMERIC(18, 4) AS amount
  FROM loan_disbursement
  GROUP BY org_id
),
latest_base_fund AS (
  SELECT DISTINCT ON (org_id)
    org_id,
    base_fund_pool
  FROM mv_base_fund_pool_per_fiscal_year
  ORDER BY org_id, fiscal_year DESC
),
cash_pool AS (
  SELECT
    o.id AS org_id,
    (
      COALESCE(cp.amount, 0)
      + COALESCE(rp.amount, 0)
      - COALESCE(wp.amount, 0)
      - COALESCE(ep.amount, 0)
      - COALESCE(ldp.amount, 0)
    )::NUMERIC(18, 4) AS pool_balance
  FROM organization o
  LEFT JOIN contribution_pool cp ON cp.org_id = o.id
  LEFT JOIN repayment_pool rp ON rp.org_id = o.id
  LEFT JOIN withdrawal_pool wp ON wp.org_id = o.id
  LEFT JOIN expense_pool ep ON ep.org_id = o.id
  LEFT JOIN loan_disbursement_pool ldp ON ldp.org_id = o.id
)
SELECT
  cash_pool.org_id,
  cash_pool.pool_balance,
  COALESCE(lbf.base_fund_pool, 0)::NUMERIC(18, 4) AS base_fund_pool,
  (cash_pool.pool_balance - COALESCE(lbf.base_fund_pool, 0))::NUMERIC(18, 4) AS available_capital,
  now() AS refreshed_at
FROM cash_pool
LEFT JOIN latest_base_fund lbf ON lbf.org_id = cash_pool.org_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_available_capital_org_id
  ON mv_available_capital(org_id);

CREATE MATERIALIZED VIEW mv_liquidez_proyectada AS
WITH current_config AS (
  SELECT DISTINCT ON (org_id)
    org_id,
    currency_code,
    year_end_share_out_formula
  FROM group_config
  WHERE valid_to IS NULL
  ORDER BY org_id, valid_from DESC
),
projected_months AS (
  SELECT
    ac.org_id,
    (date_trunc('month', CURRENT_DATE)::date + (month_offset.n || ' months')::interval)::date AS month_on,
    ac.pool_balance,
    ac.base_fund_pool,
    ac.available_capital
  FROM mv_available_capital ac
  CROSS JOIN generate_series(0, 11) AS month_offset(n)
),
scheduled_collections AS (
  SELECT
    ls.org_id,
    GREATEST(
      date_trunc('month', ls.due_on)::date,
      date_trunc('month', CURRENT_DATE)::date
    ) AS month_on,
    COALESCE(SUM(
      GREATEST(0, ls.principal_due - ls.paid_principal_to_date)
      + GREATEST(0, ls.interest_due - ls.paid_interest_to_date)
    ), 0)::NUMERIC(18, 4) AS amount
  FROM loan_schedule ls
  JOIN loan l
    ON l.org_id = ls.org_id
   AND l.id = ls.loan_id
  WHERE l.status IN ('originated', 'activo', 'en_mora')
    AND ls.status <> 'pagado'
  GROUP BY ls.org_id, GREATEST(
    date_trunc('month', ls.due_on)::date,
    date_trunc('month', CURRENT_DATE)::date
  )
)
SELECT
  pm.org_id,
  pm.month_on,
  (
    pm.pool_balance
    + COALESCE((
      SELECT SUM(sc.amount)
      FROM scheduled_collections sc
      WHERE sc.org_id = pm.org_id
        AND sc.month_on <= pm.month_on
    ), 0)
  )::NUMERIC(18, 4) AS projected_balance,
  pm.base_fund_pool::NUMERIC(18, 4) AS base_fund_pool,
  pm.available_capital::NUMERIC(18, 4) AS available_capital,
  cc.year_end_share_out_formula,
  COALESCE(cc.currency_code, 'USD') AS currency_code,
  now() AS refreshed_at
FROM projected_months pm
LEFT JOIN current_config cc
  ON cc.org_id = pm.org_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_liquidez_proyectada_org_month
  ON mv_liquidez_proyectada(org_id, month_on);

CREATE OR REPLACE FUNCTION refresh_sprint1_read_models()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_member_compliance_state;
  REFRESH MATERIALIZED VIEW mv_base_fund_pool_per_fiscal_year;
  REFRESH MATERIALIZED VIEW mv_available_capital;
  REFRESH MATERIALIZED VIEW mv_cash_balances;
  REFRESH MATERIALIZED VIEW mv_liquidez_proyectada;
END;
$$;
