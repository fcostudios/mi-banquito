DROP MATERIALIZED VIEW IF EXISTS mv_member_compliance_state;
CREATE MATERIALIZED VIEW mv_member_compliance_state AS
WITH cycle_contributions AS (
  SELECT
    c.org_id,
    c.member_id,
    c.cycle_id,
    COALESCE(SUM(c.amount), 0)::NUMERIC(18, 4) AS paid_amount
  FROM contribution c
  GROUP BY c.org_id, c.member_id, c.cycle_id
),
member_contributions AS (
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
current_cycle AS (
  SELECT DISTINCT ON (cc.org_id)
    cc.id,
    cc.org_id,
    cc.expected_amount_per_member,
    cc.closes_on
  FROM contribution_cycle cc
  WHERE cc.status = 'open'
  ORDER BY cc.org_id, cc.closes_on DESC, cc.created_at DESC
)
SELECT
  m.org_id,
  m.id AS member_id,
  m.display_name,
  CASE
    WHEN m.status <> 'activo' THEN 'al_dia'
    WHEN cc.id IS NULL THEN 'al_dia'
    WHEN COALESCE(cycle_paid.paid_amount, 0) >= cc.expected_amount_per_member THEN 'al_dia'
    WHEN CURRENT_DATE > cc.closes_on + COALESCE(gc.mora_threshold_days, 15) THEN 'en_mora'
    WHEN CURRENT_DATE > cc.closes_on + COALESCE(gc.late_threshold_days, 3) THEN 'atrasado'
    ELSE 'al_dia'
  END AS state,
  (
    COALESCE(m.initial_savings_balance, 0)
    + COALESCE(member_paid.contribution_total, 0)
    - COALESCE(member_withdrawn.withdrawal_total, 0)
  )::NUMERIC(18, 4) AS current_balance,
  now() AS refreshed_at
FROM member m
LEFT JOIN current_cycle cc
  ON cc.org_id = m.org_id
LEFT JOIN group_config gc
  ON gc.org_id = m.org_id
 AND gc.valid_to IS NULL
LEFT JOIN cycle_contributions cycle_paid
  ON cycle_paid.org_id = m.org_id
 AND cycle_paid.member_id = m.id
 AND cycle_paid.cycle_id = cc.id
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

DROP MATERIALIZED VIEW IF EXISTS mv_member_time_weighted_balance;
CREATE MATERIALIZED VIEW mv_member_time_weighted_balance AS
WITH active_config AS (
  SELECT DISTINCT ON (gc.org_id)
    gc.org_id,
    gc.fiscal_year_start_month,
    gc.fiscal_year_start_day
  FROM group_config gc
  ORDER BY gc.org_id, gc.valid_to NULLS FIRST, gc.valid_from DESC
),
fiscal_window AS (
  SELECT
    pc.org_id,
    CASE
      WHEN make_date(
        EXTRACT(YEAR FROM cc.closes_on)::integer,
        COALESCE(ac.fiscal_year_start_month, 1),
        COALESCE(ac.fiscal_year_start_day, 1)
      ) <= cc.closes_on
        THEN EXTRACT(YEAR FROM cc.closes_on)::integer
      ELSE EXTRACT(YEAR FROM cc.closes_on)::integer - 1
    END AS fiscal_year,
    CASE
      WHEN make_date(
        EXTRACT(YEAR FROM cc.closes_on)::integer,
        COALESCE(ac.fiscal_year_start_month, 1),
        COALESCE(ac.fiscal_year_start_day, 1)
      ) <= cc.closes_on
        THEN make_date(
          EXTRACT(YEAR FROM cc.closes_on)::integer,
          COALESCE(ac.fiscal_year_start_month, 1),
          COALESCE(ac.fiscal_year_start_day, 1)
        )
      ELSE make_date(
          EXTRACT(YEAR FROM cc.closes_on)::integer - 1,
          COALESCE(ac.fiscal_year_start_month, 1),
          COALESCE(ac.fiscal_year_start_day, 1)
        )
    END AS starts_on,
    cc.closes_on AS ends_on
  FROM period_close pc
  JOIN contribution_cycle cc
    ON cc.id = pc.cycle_id
   AND cc.org_id = pc.org_id
  LEFT JOIN active_config ac ON ac.org_id = pc.org_id
  WHERE pc.is_year_end
),
savings_events AS (
  SELECT
    m.org_id,
    m.id AS member_id,
    fw.fiscal_year,
    GREATEST(m.joined_on, fw.starts_on) AS dated_on,
    COALESCE(m.initial_savings_balance, 0)::NUMERIC(18, 4) AS amount
  FROM member m
  JOIN fiscal_window fw ON fw.org_id = m.org_id
  WHERE m.status = 'activo'
  UNION ALL
  SELECT
    c.org_id,
    c.member_id,
    fw.fiscal_year,
    c.dated_on,
    c.amount::NUMERIC(18, 4) AS amount
  FROM contribution c
  JOIN fiscal_window fw ON fw.org_id = c.org_id
  WHERE c.dated_on BETWEEN fw.starts_on AND fw.ends_on
  UNION ALL
  SELECT
    w.org_id,
    w.member_id,
    fw.fiscal_year,
    w.dated_on,
    (-w.amount)::NUMERIC(18, 4) AS amount
  FROM withdrawal w
  JOIN fiscal_window fw ON fw.org_id = w.org_id
  WHERE w.dated_on BETWEEN fw.starts_on AND fw.ends_on
)
SELECT
  m.org_id,
  m.id AS member_id,
  fw.fiscal_year,
  COALESCE(SUM(se.amount), 0)::NUMERIC(18, 4) AS accumulated_savings,
  COALESCE(SUM(
    se.amount * ((fw.ends_on - GREATEST(se.dated_on, fw.starts_on)) + 1)
  ), 0)::NUMERIC(18, 4) AS saldo_ponderado_usd_dias,
  now() AS refreshed_at
FROM member m
JOIN fiscal_window fw ON fw.org_id = m.org_id
LEFT JOIN savings_events se
  ON se.org_id = m.org_id
 AND se.member_id = m.id
 AND se.fiscal_year = fw.fiscal_year
WHERE m.status = 'activo'
GROUP BY m.org_id, m.id, fw.fiscal_year;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_member_time_weighted_balance_member_year
ON mv_member_time_weighted_balance(org_id, member_id, fiscal_year);

DROP MATERIALIZED VIEW IF EXISTS mv_loan_activity_points;
CREATE MATERIALIZED VIEW mv_loan_activity_points AS
WITH active_config AS (
  SELECT DISTINCT ON (gc.org_id)
    gc.org_id,
    gc.fiscal_year_start_month,
    gc.fiscal_year_start_day
  FROM group_config gc
  ORDER BY gc.org_id, gc.valid_to NULLS FIRST, gc.valid_from DESC
),
fiscal_window AS (
  SELECT
    pc.org_id,
    CASE
      WHEN make_date(
        EXTRACT(YEAR FROM cc.closes_on)::integer,
        COALESCE(ac.fiscal_year_start_month, 1),
        COALESCE(ac.fiscal_year_start_day, 1)
      ) <= cc.closes_on
        THEN EXTRACT(YEAR FROM cc.closes_on)::integer
      ELSE EXTRACT(YEAR FROM cc.closes_on)::integer - 1
    END AS fiscal_year,
    CASE
      WHEN make_date(
        EXTRACT(YEAR FROM cc.closes_on)::integer,
        COALESCE(ac.fiscal_year_start_month, 1),
        COALESCE(ac.fiscal_year_start_day, 1)
      ) <= cc.closes_on
        THEN make_date(
          EXTRACT(YEAR FROM cc.closes_on)::integer,
          COALESCE(ac.fiscal_year_start_month, 1),
          COALESCE(ac.fiscal_year_start_day, 1)
        )
      ELSE make_date(
          EXTRACT(YEAR FROM cc.closes_on)::integer - 1,
          COALESCE(ac.fiscal_year_start_month, 1),
          COALESCE(ac.fiscal_year_start_day, 1)
        )
    END AS starts_on,
    cc.closes_on AS ends_on
  FROM period_close pc
  JOIN contribution_cycle cc
    ON cc.id = pc.cycle_id
   AND cc.org_id = pc.org_id
  LEFT JOIN active_config ac ON ac.org_id = pc.org_id
  WHERE pc.is_year_end
),
borrower_activity AS (
  SELECT
    l.org_id,
    l.borrower_member_id AS member_id,
    fw.fiscal_year,
    COALESCE(SUM(r.applied_to_principal), 0)::NUMERIC(18, 4) AS loan_activity_basis
  FROM loan l
  JOIN fiscal_window fw ON fw.org_id = l.org_id
  LEFT JOIN repayment r
    ON r.org_id = l.org_id
   AND r.loan_id = l.id
   AND r.dated_on BETWEEN fw.starts_on AND fw.ends_on
  WHERE l.borrower_kind = 'member'
    AND l.borrower_member_id IS NOT NULL
  GROUP BY l.org_id, l.borrower_member_id, fw.fiscal_year
),
guarantor_activity AS (
  SELECT
    l.org_id,
    lg.guarantor_member_id AS member_id,
    fw.fiscal_year,
    COALESCE(SUM(r.applied_to_principal), 0)::NUMERIC(18, 4) AS loan_activity_basis
  FROM loan l
  JOIN fiscal_window fw ON fw.org_id = l.org_id
  JOIN loan_guarantor lg
    ON lg.org_id = l.org_id
   AND lg.loan_id = l.id
  LEFT JOIN repayment r
    ON r.org_id = l.org_id
   AND r.loan_id = l.id
   AND r.dated_on BETWEEN fw.starts_on AND fw.ends_on
  WHERE l.borrower_kind = 'non_member'
  GROUP BY l.org_id, lg.guarantor_member_id, fw.fiscal_year
),
all_activity AS (
  SELECT * FROM borrower_activity
  UNION ALL
  SELECT * FROM guarantor_activity
)
SELECT
  m.org_id,
  m.id AS member_id,
  fw.fiscal_year,
  COALESCE(SUM(aa.loan_activity_basis), 0)::NUMERIC(18, 4) AS loan_activity_basis,
  now() AS refreshed_at
FROM member m
JOIN fiscal_window fw ON fw.org_id = m.org_id
LEFT JOIN all_activity aa
  ON aa.org_id = m.org_id
 AND aa.member_id = m.id
 AND aa.fiscal_year = fw.fiscal_year
WHERE m.status = 'activo'
GROUP BY m.org_id, m.id, fw.fiscal_year;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_loan_activity_points_member_year
ON mv_loan_activity_points(org_id, member_id, fiscal_year);

DROP MATERIALIZED VIEW IF EXISTS mv_distributable_surplus;
CREATE MATERIALIZED VIEW mv_distributable_surplus AS
WITH active_config AS (
  SELECT DISTINCT ON (gc.org_id)
    gc.org_id,
    gc.fiscal_year_start_month,
    gc.fiscal_year_start_day
  FROM group_config gc
  ORDER BY gc.org_id, gc.valid_to NULLS FIRST, gc.valid_from DESC
),
fiscal_window AS (
  SELECT
    pc.org_id,
    CASE
      WHEN make_date(
        EXTRACT(YEAR FROM cc.closes_on)::integer,
        COALESCE(ac.fiscal_year_start_month, 1),
        COALESCE(ac.fiscal_year_start_day, 1)
      ) <= cc.closes_on
        THEN EXTRACT(YEAR FROM cc.closes_on)::integer
      ELSE EXTRACT(YEAR FROM cc.closes_on)::integer - 1
    END AS fiscal_year,
    CASE
      WHEN make_date(
        EXTRACT(YEAR FROM cc.closes_on)::integer,
        COALESCE(ac.fiscal_year_start_month, 1),
        COALESCE(ac.fiscal_year_start_day, 1)
      ) <= cc.closes_on
        THEN make_date(
          EXTRACT(YEAR FROM cc.closes_on)::integer,
          COALESCE(ac.fiscal_year_start_month, 1),
          COALESCE(ac.fiscal_year_start_day, 1)
        )
      ELSE make_date(
          EXTRACT(YEAR FROM cc.closes_on)::integer - 1,
          COALESCE(ac.fiscal_year_start_month, 1),
          COALESCE(ac.fiscal_year_start_day, 1)
        )
    END AS starts_on,
    cc.closes_on AS ends_on
  FROM period_close pc
  JOIN contribution_cycle cc
    ON cc.id = pc.cycle_id
   AND cc.org_id = pc.org_id
  LEFT JOIN active_config ac ON ac.org_id = pc.org_id
  WHERE pc.is_year_end
),
interest_totals AS (
  SELECT
    ia.org_id,
    fw.fiscal_year,
    COALESCE(SUM(ia.interest_amount), 0)::NUMERIC(18, 4) AS interest_total
  FROM interest_accrual ia
  JOIN fiscal_window fw
    ON fw.org_id = ia.org_id
   AND ia.accrued_on BETWEEN fw.starts_on AND fw.ends_on
  GROUP BY ia.org_id, fw.fiscal_year
),
fee_totals AS (
  SELECT
    lf.org_id,
    fw.fiscal_year,
    COALESCE(SUM(lf.amount), 0)::NUMERIC(18, 4) AS fees_total
  FROM loan_fee lf
  JOIN fiscal_window fw
    ON fw.org_id = lf.org_id
   AND lf.accrued_on BETWEEN fw.starts_on AND fw.ends_on
  WHERE lf.feeds_surplus
  GROUP BY lf.org_id, fw.fiscal_year
),
prior_cxc AS (
  SELECT DISTINCT ON (yebs.org_id)
    yebs.org_id,
    yebs.cxc_anterior::NUMERIC(18, 4) AS cxc_anterior
  FROM year_end_balance_snapshot yebs
  JOIN fiscal_window fw
    ON fw.org_id = yebs.org_id
   AND yebs.year < fw.fiscal_year
  ORDER BY yebs.org_id, yebs.year DESC, yebs.created_at DESC
)
SELECT
  fw.org_id,
  fw.fiscal_year,
  COALESCE(it.interest_total, 0)::NUMERIC(18, 4) AS interest_total,
  COALESCE(ft.fees_total, 0)::NUMERIC(18, 4) AS fees_total,
  COALESCE(pc.cxc_anterior, 0)::NUMERIC(18, 4) AS cxc_anterior,
  (
    COALESCE(it.interest_total, 0)
    + COALESCE(ft.fees_total, 0)
    - COALESCE(pc.cxc_anterior, 0)
  )::NUMERIC(18, 4) AS distributable_surplus,
  now() AS refreshed_at
FROM fiscal_window fw
LEFT JOIN interest_totals it
  ON it.org_id = fw.org_id
 AND it.fiscal_year = fw.fiscal_year
LEFT JOIN fee_totals ft
  ON ft.org_id = fw.org_id
 AND ft.fiscal_year = fw.fiscal_year
LEFT JOIN prior_cxc pc ON pc.org_id = fw.org_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_distributable_surplus_org_year
ON mv_distributable_surplus(org_id, fiscal_year);

CREATE UNIQUE INDEX IF NOT EXISTS uq_statement_archive_org_kind_member_period
ON statement_archive(org_id, kind, member_id, period_label)
WHERE member_id IS NOT NULL;
