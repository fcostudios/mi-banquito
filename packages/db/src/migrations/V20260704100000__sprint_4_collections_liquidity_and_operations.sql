DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promise_status_enum') THEN
    CREATE TYPE promise_status_enum AS ENUM ('open', 'kept', 'broken', 'closed');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loan_disbursement_source_enum') THEN
    CREATE TYPE loan_disbursement_source_enum AS ENUM ('bank_transfer', 'petty_cash');
  END IF;
END $$;

ALTER TYPE withdrawal_kind_enum ADD VALUE IF NOT EXISTS 'treasurer_compensation_disbursement';

CREATE TABLE IF NOT EXISTS promise (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  member_id UUID NOT NULL REFERENCES member(id),
  loan_id UUID REFERENCES loan(id),
  cycle_id UUID REFERENCES contribution_cycle(id),
  promised_on DATE NOT NULL,
  note TEXT,
  status promise_status_enum NOT NULL DEFAULT 'open',
  superseded_by_id UUID REFERENCES promise(id),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT ck_promise_exactly_one_source CHECK (
    (loan_id IS NOT NULL AND cycle_id IS NULL)
    OR (loan_id IS NULL AND cycle_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_promise_open_obligation
  ON promise(
    org_id,
    member_id,
    COALESCE(loan_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(cycle_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_promise_org_member_status
  ON promise(org_id, member_id, status);

CREATE TABLE IF NOT EXISTS promise_reminder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  promise_id UUID NOT NULL REFERENCES promise(id),
  reminder_date DATE NOT NULL,
  alert_id UUID REFERENCES alert(id),
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_promise_reminder_org_promise_date UNIQUE (org_id, promise_id, reminder_date)
);

CREATE INDEX IF NOT EXISTS idx_promise_reminder_org_date
  ON promise_reminder(org_id, reminder_date);

CREATE TABLE IF NOT EXISTS loan_disbursement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  loan_id UUID NOT NULL REFERENCES loan(id),
  disbursement_source loan_disbursement_source_enum NOT NULL,
  amount NUMERIC(18, 4) NOT NULL,
  currency_code TEXT NOT NULL,
  disbursed_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL,
  created_by_kind TEXT NOT NULL,
  CONSTRAINT uq_loan_disbursement_org_loan UNIQUE (org_id, loan_id),
  CONSTRAINT ck_loan_disbursement_amount_positive CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS treasurer_compensation_disbursement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  member_id UUID NOT NULL REFERENCES member(id),
  period_label TEXT NOT NULL,
  amount NUMERIC(18, 4) NOT NULL,
  currency_code TEXT NOT NULL,
  kind_at_disbursement JSONB NOT NULL,
  withdrawal_id UUID REFERENCES withdrawal(id),
  disbursed_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_treasurer_compensation_disbursement_org_period_label UNIQUE (org_id, period_label),
  CONSTRAINT ck_treasurer_compensation_disbursement_amount_positive CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS pilot_log_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  observed_on DATE NOT NULL,
  vocabulary_answer TEXT NOT NULL,
  paper_value NUMERIC(18, 4) NOT NULL,
  system_value NUMERIC(18, 4) NOT NULL,
  discrepancy NUMERIC(18, 4) NOT NULL,
  would_not_return_to_paper BOOLEAN NOT NULL DEFAULT false,
  clean_month BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  logged_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pilot_log_entry_org_observed
  ON pilot_log_entry(org_id, observed_on DESC);

CREATE INDEX IF NOT EXISTS idx_statement_archive_hash_public_verify
  ON statement_archive(canonical_payload_hash);

DROP MATERIALIZED VIEW IF EXISTS mv_ar_aging;
CREATE MATERIALIZED VIEW mv_ar_aging AS
WITH contribution_obligations AS (
  SELECT
    cc.org_id,
    m.id AS member_id,
    m.display_name AS member_name,
    m.whatsapp_number,
    'aporte'::text AS reason_kind,
    cc.id AS cycle_id,
    NULL::uuid AS loan_id,
    cc.cycle_label AS period_label,
    cc.closes_on AS due_date,
    GREATEST((CURRENT_DATE - cc.closes_on), 0)::integer AS days_late,
    GREATEST(
      cc.expected_amount_per_member - COALESCE(SUM(c.amount), 0),
      0
    )::NUMERIC(18, 4) AS amount_due,
    MAX(c.recorded_at) AS last_action_at
  FROM contribution_cycle cc
  JOIN member m
    ON m.org_id = cc.org_id
  LEFT JOIN contribution c
    ON c.org_id = cc.org_id
   AND c.cycle_id = cc.id
   AND c.member_id = m.id
  WHERE cc.closes_on < CURRENT_DATE
  GROUP BY
    cc.org_id,
    m.id,
    m.display_name,
    m.whatsapp_number,
    cc.id,
    cc.cycle_label,
    cc.closes_on,
    cc.expected_amount_per_member
  HAVING GREATEST(cc.expected_amount_per_member - COALESCE(SUM(c.amount), 0), 0) > 0
),
loan_obligations AS (
  SELECT
    ls.org_id,
    m.id AS member_id,
    m.display_name AS member_name,
    m.whatsapp_number,
    'cuota'::text AS reason_kind,
    NULL::uuid AS cycle_id,
    l.id AS loan_id,
    ls.period_index::text AS period_label,
    ls.due_on AS due_date,
    GREATEST((CURRENT_DATE - ls.due_on), 0)::integer AS days_late,
    GREATEST(
      (ls.principal_due + ls.interest_due) - (ls.paid_principal_to_date + ls.paid_interest_to_date),
      0
    )::NUMERIC(18, 4) AS amount_due,
    MAX(r.recorded_at) AS last_action_at
  FROM loan_schedule ls
  JOIN loan l
    ON l.id = ls.loan_id
   AND l.org_id = ls.org_id
  JOIN member m
    ON m.id = COALESCE(l.borrower_member_id, l.member_id)
   AND m.org_id = ls.org_id
  LEFT JOIN repayment r
    ON r.org_id = ls.org_id
   AND r.loan_id = l.id
   AND r.member_id = m.id
  WHERE ls.due_on < CURRENT_DATE
    AND ls.status IN ('pendiente', 'parcial', 'atrasado', 'en_mora')
  GROUP BY
    ls.org_id,
    m.id,
    m.display_name,
    m.whatsapp_number,
    l.id,
    ls.period_index,
    ls.due_on,
    ls.principal_due,
    ls.interest_due,
    ls.paid_principal_to_date,
    ls.paid_interest_to_date
  HAVING GREATEST(
    (ls.principal_due + ls.interest_due) - (ls.paid_principal_to_date + ls.paid_interest_to_date),
    0
  ) > 0
)
SELECT * FROM contribution_obligations
UNION ALL
SELECT * FROM loan_obligations;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ar_aging_unique_obligation
  ON mv_ar_aging(
    org_id,
    reason_kind,
    member_id,
    COALESCE(cycle_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(loan_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_label
  );

DROP MATERIALIZED VIEW IF EXISTS mv_liquidez_proyectada;
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
)
SELECT
  pm.org_id,
  pm.month_on,
  pm.pool_balance::NUMERIC(18, 4) AS projected_balance,
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

ALTER TABLE promise ENABLE ROW LEVEL SECURITY;
ALTER TABLE promise FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promise_tenant_isolation ON promise;
CREATE POLICY promise_tenant_isolation ON promise
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE promise_reminder ENABLE ROW LEVEL SECURITY;
ALTER TABLE promise_reminder FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promise_reminder_tenant_isolation ON promise_reminder;
CREATE POLICY promise_reminder_tenant_isolation ON promise_reminder
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE loan_disbursement ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_disbursement FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_disbursement_tenant_isolation ON loan_disbursement;
CREATE POLICY loan_disbursement_tenant_isolation ON loan_disbursement
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE treasurer_compensation_disbursement ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasurer_compensation_disbursement FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS treasurer_compensation_disbursement_tenant_isolation ON treasurer_compensation_disbursement;
CREATE POLICY treasurer_compensation_disbursement_tenant_isolation ON treasurer_compensation_disbursement
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE pilot_log_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_log_entry FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pilot_log_entry_tenant_isolation ON pilot_log_entry;
CREATE POLICY pilot_log_entry_tenant_isolation ON pilot_log_entry
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
