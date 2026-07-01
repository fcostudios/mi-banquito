DO $$
BEGIN
  CREATE TYPE contribution_kind_enum AS ENUM ('regular', 'partial');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE contribution_payment_source_enum AS ENUM ('bank_transfer', 'cash_in_meeting', 'petty_cash_deposit');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE loan_borrower_kind_enum AS ENUM ('member', 'non_member');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE withdrawal_kind_enum ADD VALUE IF NOT EXISTS 'referral_commission_credit';

ALTER TABLE contribution
  ADD COLUMN IF NOT EXISTS kind contribution_kind_enum NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS payment_source contribution_payment_source_enum NOT NULL DEFAULT 'bank_transfer';

CREATE TABLE IF NOT EXISTS non_member_borrower (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  org_id               UUID NOT NULL,
  display_name         TEXT NOT NULL,
  whatsapp_number      TEXT,
  national_id_redacted TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL,
  created_by           UUID NOT NULL,
  created_by_kind      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_non_member_borrower_org_id ON non_member_borrower(org_id);

ALTER TABLE loan
  ALTER COLUMN member_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS borrower_kind loan_borrower_kind_enum NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS borrower_member_id UUID,
  ADD COLUMN IF NOT EXISTS borrower_non_member_id UUID,
  ADD COLUMN IF NOT EXISTS group_config_version_at_origination INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS referrer_member_id UUID;

UPDATE loan
SET borrower_member_id = member_id
WHERE borrower_member_id IS NULL
  AND borrower_non_member_id IS NULL
  AND member_id IS NOT NULL;

ALTER TABLE loan
  DROP CONSTRAINT IF EXISTS ck_loan_exactly_one_borrower,
  ADD CONSTRAINT ck_loan_exactly_one_borrower
  CHECK (
    (borrower_kind = 'member' AND borrower_member_id IS NOT NULL AND borrower_non_member_id IS NULL)
    OR
    (borrower_kind = 'non_member' AND borrower_member_id IS NULL AND borrower_non_member_id IS NOT NULL)
  );

ALTER TABLE loan
  DROP CONSTRAINT IF EXISTS fk_loan_borrower_member_id,
  ADD CONSTRAINT fk_loan_borrower_member_id FOREIGN KEY (borrower_member_id) REFERENCES member(id);
ALTER TABLE loan
  DROP CONSTRAINT IF EXISTS fk_loan_borrower_non_member_id,
  ADD CONSTRAINT fk_loan_borrower_non_member_id FOREIGN KEY (borrower_non_member_id) REFERENCES non_member_borrower(id);
ALTER TABLE loan
  DROP CONSTRAINT IF EXISTS fk_loan_referrer_member_id,
  ADD CONSTRAINT fk_loan_referrer_member_id FOREIGN KEY (referrer_member_id) REFERENCES member(id);
CREATE INDEX IF NOT EXISTS idx_loan_borrower_member_id ON loan(borrower_member_id);
CREATE INDEX IF NOT EXISTS idx_loan_borrower_non_member_id ON loan(borrower_non_member_id);
CREATE INDEX IF NOT EXISTS idx_loan_referrer_member_id ON loan(referrer_member_id);

CREATE TABLE IF NOT EXISTS loan_guarantor (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  org_id              UUID NOT NULL,
  loan_id             UUID NOT NULL,
  guarantor_member_id UUID NOT NULL,
  assumed_at          TIMESTAMPTZ NOT NULL,
  released_at         TIMESTAMPTZ,
  liability_amount    NUMERIC(18, 4) NOT NULL,
  currency_code       TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL,
  created_by          UUID NOT NULL,
  created_by_kind     TEXT NOT NULL
);
ALTER TABLE loan_guarantor
  DROP CONSTRAINT IF EXISTS fk_loan_guarantor_loan_id,
  ADD CONSTRAINT fk_loan_guarantor_loan_id FOREIGN KEY (loan_id) REFERENCES loan(id);
ALTER TABLE loan_guarantor
  DROP CONSTRAINT IF EXISTS fk_loan_guarantor_guarantor_member_id,
  ADD CONSTRAINT fk_loan_guarantor_guarantor_member_id FOREIGN KEY (guarantor_member_id) REFERENCES member(id);
ALTER TABLE loan_guarantor
  DROP CONSTRAINT IF EXISTS uq_loan_guarantor_loan_id_guarantor_member_id_assumed_at,
  ADD CONSTRAINT uq_loan_guarantor_loan_id_guarantor_member_id_assumed_at UNIQUE (loan_id, guarantor_member_id, assumed_at);
CREATE INDEX IF NOT EXISTS idx_loan_guarantor_org_id ON loan_guarantor(org_id);
CREATE INDEX IF NOT EXISTS idx_loan_guarantor_loan_id ON loan_guarantor(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_guarantor_guarantor_member_id ON loan_guarantor(guarantor_member_id);

CREATE TABLE IF NOT EXISTS loan_referral (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  org_id              UUID NOT NULL,
  loan_id             UUID NOT NULL,
  referrer_member_id  UUID NOT NULL,
  commission_amount   NUMERIC(18, 4) NOT NULL,
  commission_currency TEXT NOT NULL,
  accrued_at          TIMESTAMPTZ,
  withdrawal_id       UUID,
  created_at          TIMESTAMPTZ NOT NULL,
  created_by          UUID NOT NULL,
  created_by_kind     TEXT NOT NULL
);
ALTER TABLE loan_referral
  DROP CONSTRAINT IF EXISTS fk_loan_referral_loan_id,
  ADD CONSTRAINT fk_loan_referral_loan_id FOREIGN KEY (loan_id) REFERENCES loan(id);
ALTER TABLE loan_referral
  DROP CONSTRAINT IF EXISTS fk_loan_referral_referrer_member_id,
  ADD CONSTRAINT fk_loan_referral_referrer_member_id FOREIGN KEY (referrer_member_id) REFERENCES member(id);
ALTER TABLE loan_referral
  DROP CONSTRAINT IF EXISTS fk_loan_referral_withdrawal_id,
  ADD CONSTRAINT fk_loan_referral_withdrawal_id FOREIGN KEY (withdrawal_id) REFERENCES withdrawal(id);
ALTER TABLE loan_referral
  DROP CONSTRAINT IF EXISTS uq_loan_referral_loan_id,
  ADD CONSTRAINT uq_loan_referral_loan_id UNIQUE (loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_referral_org_id ON loan_referral(org_id);
CREATE INDEX IF NOT EXISTS idx_loan_referral_referrer_member_id ON loan_referral(referrer_member_id);
CREATE INDEX IF NOT EXISTS idx_loan_referral_withdrawal_id ON loan_referral(withdrawal_id);

CREATE TABLE IF NOT EXISTS cron_run (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  endpoint          TEXT NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL,
  finished_at       TIMESTAMPTZ NOT NULL,
  duration_ms       INTEGER NOT NULL,
  orgs_processed    INTEGER NOT NULL,
  failure_count     INTEGER NOT NULL,
  replay_from       DATE,
  replay_to         DATE,
  summary           JSONB NOT NULL,
  triggered_by_kind TEXT NOT NULL,
  triggered_by      UUID,
  created_at        TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cron_run_endpoint_started_at ON cron_run(endpoint, started_at DESC);

DROP MATERIALIZED VIEW IF EXISTS mv_cash_balances;
CREATE MATERIALIZED VIEW mv_cash_balances AS
SELECT
  o.id AS org_id,
  COALESCE(SUM(c.amount) FILTER (WHERE c.payment_source = 'bank_transfer'), 0)::NUMERIC(18, 4) AS bank_balance,
  COALESCE(SUM(c.amount) FILTER (WHERE c.payment_source IN ('cash_in_meeting', 'petty_cash_deposit')), 0)::NUMERIC(18, 4) AS petty_cash_balance,
  now() AS refreshed_at
FROM organization o
LEFT JOIN contribution c ON c.org_id = o.id
GROUP BY o.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_cash_balances_org_id
  ON mv_cash_balances(org_id);

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
    WHEN COALESCE(SUM(c.amount), 0) > 0 THEN 'parcial'
    WHEN CURRENT_DATE > cc.closes_on + COALESCE(gc.mora_threshold_days, 15) THEN 'en_mora'
    WHEN CURRENT_DATE > cc.closes_on + COALESCE(gc.late_threshold_days, 3) THEN 'atrasado'
    ELSE 'atrasado'
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

CREATE OR REPLACE FUNCTION refresh_sprint1_read_models()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_member_compliance_state;
  REFRESH MATERIALIZED VIEW mv_base_fund_pool_per_fiscal_year;
  REFRESH MATERIALIZED VIEW mv_available_capital;
  REFRESH MATERIALIZED VIEW mv_cash_balances;
END;
$$;

ALTER TABLE non_member_borrower ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_guarantor ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_referral ENABLE ROW LEVEL SECURITY;
ALTER TABLE non_member_borrower FORCE ROW LEVEL SECURITY;
ALTER TABLE loan_guarantor FORCE ROW LEVEL SECURITY;
ALTER TABLE loan_referral FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS non_member_borrower_tenant_isolation ON non_member_borrower;
CREATE POLICY non_member_borrower_tenant_isolation ON non_member_borrower
USING (org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS loan_guarantor_tenant_isolation ON loan_guarantor;
CREATE POLICY loan_guarantor_tenant_isolation ON loan_guarantor
USING (org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS loan_referral_tenant_isolation ON loan_referral;
CREATE POLICY loan_referral_tenant_isolation ON loan_referral
USING (org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
