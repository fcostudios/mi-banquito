CREATE OR REPLACE FUNCTION fund_pool_balance(p_org_id UUID, p_through_date DATE DEFAULT NULL)
RETURNS NUMERIC(18, 4)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(delta), 0)::NUMERIC(18, 4)
  FROM (
    SELECT c.amount AS delta
    FROM contribution c
    LEFT JOIN account a ON a.id = c.account_id AND a.org_id = c.org_id
    WHERE c.org_id = p_org_id
      AND c.reverses_id IS NULL
      AND c.reconciliation_status = 'regularized'
      AND (c.account_id IS NULL OR a.is_group_fund = true)
      AND (p_through_date IS NULL OR c.dated_on <= p_through_date)
    UNION ALL
    SELECT r.amount
    FROM repayment r
    LEFT JOIN account a ON a.id = r.account_id AND a.org_id = r.org_id
    WHERE r.org_id = p_org_id
      AND r.reverses_id IS NULL
      AND r.reconciliation_status = 'regularized'
      AND (r.account_id IS NULL OR a.is_group_fund = true)
      AND (p_through_date IS NULL OR r.dated_on <= p_through_date)
    UNION ALL
    SELECT CASE
      WHEN COALESCE(destination.is_group_fund, false) AND NOT COALESCE(source.is_group_fund, false) THEN t.amount
      WHEN COALESCE(source.is_group_fund, false) AND NOT COALESCE(destination.is_group_fund, false) THEN -t.amount
      ELSE 0
    END
    FROM transfer t
    JOIN account source ON source.id = t.from_account_id AND source.org_id = t.org_id
    JOIN account destination ON destination.id = t.to_account_id AND destination.org_id = t.org_id
    WHERE t.org_id = p_org_id
      AND t.reverses_id IS NULL
      AND (p_through_date IS NULL OR t.dated_on <= p_through_date)
    UNION ALL
    SELECT -w.amount FROM withdrawal w
    WHERE w.org_id = p_org_id AND w.reverses_id IS NULL
      AND (p_through_date IS NULL OR w.dated_on <= p_through_date)
    UNION ALL
    SELECT -e.amount FROM expense e
    WHERE e.org_id = p_org_id AND e.reverses_id IS NULL AND e.status = 'paid'
      AND (p_through_date IS NULL OR e.incurred_on <= p_through_date)
    UNION ALL
    SELECT -d.amount FROM loan_disbursement d
    WHERE d.org_id = p_org_id
      AND (p_through_date IS NULL OR d.disbursed_on <= p_through_date)
  ) fund_delta;
$$;

DROP MATERIALIZED VIEW IF EXISTS mv_liquidez_proyectada;
DROP MATERIALIZED VIEW IF EXISTS mv_available_capital;

CREATE MATERIALIZED VIEW mv_available_capital AS
WITH latest_base_fund AS (
  SELECT DISTINCT ON (org_id) org_id, base_fund_pool
  FROM mv_base_fund_pool_per_fiscal_year
  ORDER BY org_id, fiscal_year DESC
)
SELECT o.id AS org_id,
       fund_pool_balance(o.id) AS pool_balance,
       COALESCE(base.base_fund_pool, 0)::NUMERIC(18, 4) AS base_fund_pool,
       (fund_pool_balance(o.id) - COALESCE(base.base_fund_pool, 0))::NUMERIC(18, 4) AS available_capital,
       now() AS refreshed_at
FROM organization o
LEFT JOIN latest_base_fund base ON base.org_id = o.id;

CREATE UNIQUE INDEX idx_mv_available_capital_org_id ON mv_available_capital(org_id);

CREATE MATERIALIZED VIEW mv_liquidez_proyectada AS
WITH current_config AS (
  SELECT DISTINCT ON (org_id) org_id, currency_code, year_end_share_out_formula
  FROM group_config WHERE valid_to IS NULL
  ORDER BY org_id, valid_from DESC
), projected_months AS (
  SELECT ac.org_id,
         (date_trunc('month', CURRENT_DATE)::date + (month_offset.n || ' months')::interval)::date AS month_on,
         ac.pool_balance, ac.base_fund_pool, ac.available_capital
  FROM mv_available_capital ac CROSS JOIN generate_series(0, 11) AS month_offset(n)
), scheduled_collections AS (
  SELECT ls.org_id,
         GREATEST(date_trunc('month', ls.due_on)::date, date_trunc('month', CURRENT_DATE)::date) AS month_on,
         COALESCE(SUM(GREATEST(0, ls.principal_due - ls.paid_principal_to_date)
           + GREATEST(0, ls.interest_due - ls.paid_interest_to_date)), 0)::NUMERIC(18, 4) AS amount
  FROM loan_schedule ls
  JOIN loan l ON l.org_id = ls.org_id AND l.id = ls.loan_id
  WHERE l.status IN ('originated', 'activo', 'en_mora') AND ls.status <> 'pagado'
  GROUP BY ls.org_id, GREATEST(date_trunc('month', ls.due_on)::date, date_trunc('month', CURRENT_DATE)::date)
)
SELECT pm.org_id, pm.month_on,
       (pm.pool_balance + COALESCE((SELECT SUM(sc.amount) FROM scheduled_collections sc
         WHERE sc.org_id = pm.org_id AND sc.month_on <= pm.month_on), 0))::NUMERIC(18, 4) AS projected_balance,
       pm.base_fund_pool::NUMERIC(18, 4) AS base_fund_pool,
       pm.available_capital::NUMERIC(18, 4) AS available_capital,
       config.year_end_share_out_formula,
       COALESCE(config.currency_code, 'USD') AS currency_code,
       now() AS refreshed_at
FROM projected_months pm
LEFT JOIN current_config config ON config.org_id = pm.org_id;

CREATE UNIQUE INDEX idx_mv_liquidez_proyectada_org_month ON mv_liquidez_proyectada(org_id, month_on);

REFRESH MATERIALIZED VIEW mv_available_capital;
REFRESH MATERIALIZED VIEW mv_liquidez_proyectada;
