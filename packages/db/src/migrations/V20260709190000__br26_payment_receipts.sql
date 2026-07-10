DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_extra_decision_enum') THEN
    CREATE TYPE payment_extra_decision_enum AS ENUM ('extra_savings', 'future_contribution', 'loan_principal');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_allocation_kind_enum') THEN
    CREATE TYPE payment_allocation_kind_enum AS ENUM (
      'loan_fee',
      'loan_interest',
      'loan_principal',
      'contribution_overdue',
      'contribution_current',
      'contribution_future',
      'extra_savings'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payment_receipt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  member_id UUID NOT NULL REFERENCES member(id),
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  currency_code TEXT NOT NULL,
  dated_on DATE NOT NULL,
  received_via TEXT NOT NULL,
  slip_photo_id UUID REFERENCES slip_photo(id),
  notes TEXT,
  extra_decision payment_extra_decision_enum,
  client_request_id UUID NOT NULL,
  created_at TIMESTAMP NOT NULL,
  created_by UUID NOT NULL,
  created_by_kind TEXT NOT NULL,
  CONSTRAINT uq_payment_receipt_org_client_request UNIQUE (org_id, client_request_id)
);

CREATE TABLE IF NOT EXISTS payment_allocation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  receipt_id UUID NOT NULL REFERENCES payment_receipt(id),
  member_id UUID NOT NULL REFERENCES member(id),
  sort_order INTEGER NOT NULL CHECK (sort_order > 0),
  allocation_kind payment_allocation_kind_enum NOT NULL,
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  currency_code TEXT NOT NULL,
  loan_id UUID REFERENCES loan(id),
  loan_schedule_id UUID REFERENCES loan_schedule(id),
  loan_fee_id UUID REFERENCES loan_fee(id),
  cycle_id UUID REFERENCES contribution_cycle(id),
  repayment_id UUID REFERENCES repayment(id),
  contribution_id UUID REFERENCES contribution(id),
  br_id TEXT NOT NULL,
  group_config_version INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL,
  CONSTRAINT uq_payment_allocation_receipt_order UNIQUE (org_id, receipt_id, sort_order),
  CONSTRAINT ck_payment_allocation_br26 CHECK (br_id = 'BR-26')
);

ALTER TABLE contribution
  ADD COLUMN IF NOT EXISTS payment_receipt_id UUID REFERENCES payment_receipt(id);

ALTER TABLE repayment
  ADD COLUMN IF NOT EXISTS payment_receipt_id UUID REFERENCES payment_receipt(id);

CREATE INDEX IF NOT EXISTS idx_payment_receipt_org_member_date
  ON payment_receipt(org_id, member_id, dated_on DESC);

CREATE INDEX IF NOT EXISTS idx_payment_allocation_org_receipt
  ON payment_allocation(org_id, receipt_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_contribution_payment_receipt
  ON contribution(org_id, payment_receipt_id);

CREATE INDEX IF NOT EXISTS idx_repayment_payment_receipt
  ON repayment(org_id, payment_receipt_id);

ALTER TABLE payment_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipt FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_receipt_tenant_isolation ON payment_receipt;
CREATE POLICY payment_receipt_tenant_isolation ON payment_receipt
  USING (org_id = current_setting('app.current_org')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org')::uuid);

ALTER TABLE payment_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_allocation_tenant_isolation ON payment_allocation;
CREATE POLICY payment_allocation_tenant_isolation ON payment_allocation
  USING (org_id = current_setting('app.current_org')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org')::uuid);
