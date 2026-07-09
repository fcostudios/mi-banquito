CREATE OR REPLACE FUNCTION refresh_sprint1_read_models()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_ar_aging;
  REFRESH MATERIALIZED VIEW mv_member_compliance_state;
  REFRESH MATERIALIZED VIEW mv_base_fund_pool_per_fiscal_year;
  REFRESH MATERIALIZED VIEW mv_available_capital;
  REFRESH MATERIALIZED VIEW mv_cash_balances;
  REFRESH MATERIALIZED VIEW mv_liquidez_proyectada;
END;
$$;
