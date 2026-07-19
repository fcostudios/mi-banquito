CREATE MATERIALIZED VIEW IF NOT EXISTS mv_interest_gains_per_fiscal_year AS
WITH active_config AS (
  SELECT DISTINCT ON (gc.org_id)
    gc.org_id,
    gc.fiscal_year_start_month,
    gc.fiscal_year_start_day
  FROM group_config gc
  WHERE gc.valid_to IS NULL
  ORDER BY gc.org_id, gc.valid_from DESC
)
SELECT
  ia.org_id,
  CASE
    WHEN ia.accrued_on >= make_date(
      EXTRACT(YEAR FROM ia.accrued_on)::integer,
      COALESCE(ac.fiscal_year_start_month, 1),
      COALESCE(ac.fiscal_year_start_day, 1)
    ) THEN EXTRACT(YEAR FROM ia.accrued_on)::integer
    ELSE EXTRACT(YEAR FROM ia.accrued_on)::integer - 1
  END AS fiscal_year,
  SUM(ia.interest_amount)::NUMERIC(18, 4) AS interest_gains,
  o.currency_code,
  now() AS refreshed_at
FROM interest_accrual ia
JOIN organization o
  ON o.id = ia.org_id
LEFT JOIN active_config ac
  ON ac.org_id = ia.org_id
GROUP BY ia.org_id, fiscal_year, o.currency_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_interest_gains_per_fiscal_year_org_year
  ON mv_interest_gains_per_fiscal_year(org_id, fiscal_year);
