ALTER TABLE contribution
  ADD COLUMN IF NOT EXISTS payment_receipt_id UUID;

ALTER TABLE repayment
  ADD COLUMN IF NOT EXISTS payment_receipt_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_payment_receipt_org_member_id'
      AND conrelid = 'payment_receipt'::regclass
  ) THEN
    ALTER TABLE payment_receipt
      ADD CONSTRAINT uq_payment_receipt_org_member_id UNIQUE (org_id, member_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_payment_allocation_receipt_org_member'
      AND conrelid = 'payment_allocation'::regclass
  ) THEN
    ALTER TABLE payment_allocation
      ADD CONSTRAINT fk_payment_allocation_receipt_org_member
      FOREIGN KEY (org_id, member_id, receipt_id)
      REFERENCES payment_receipt(org_id, member_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_contribution_payment_receipt_org_member'
      AND conrelid = 'contribution'::regclass
  ) THEN
    ALTER TABLE contribution
      ADD CONSTRAINT fk_contribution_payment_receipt_org_member
      FOREIGN KEY (org_id, member_id, payment_receipt_id)
      REFERENCES payment_receipt(org_id, member_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_repayment_payment_receipt_org_member'
      AND conrelid = 'repayment'::regclass
  ) THEN
    ALTER TABLE repayment
      ADD CONSTRAINT fk_repayment_payment_receipt_org_member
      FOREIGN KEY (org_id, member_id, payment_receipt_id)
      REFERENCES payment_receipt(org_id, member_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_contribution_org_member_receipt_id'
      AND conrelid = 'contribution'::regclass
  ) THEN
    ALTER TABLE contribution
      ADD CONSTRAINT uq_contribution_org_member_receipt_id
      UNIQUE (org_id, member_id, payment_receipt_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_repayment_org_member_receipt_id'
      AND conrelid = 'repayment'::regclass
  ) THEN
    ALTER TABLE repayment
      ADD CONSTRAINT uq_repayment_org_member_receipt_id
      UNIQUE (org_id, member_id, payment_receipt_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_payment_allocation_contribution_org_member_receipt'
      AND conrelid = 'payment_allocation'::regclass
  ) THEN
    ALTER TABLE payment_allocation
      ADD CONSTRAINT fk_payment_allocation_contribution_org_member_receipt
      FOREIGN KEY (org_id, member_id, receipt_id, contribution_id)
      REFERENCES contribution(org_id, member_id, payment_receipt_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_payment_allocation_repayment_org_member_receipt'
      AND conrelid = 'payment_allocation'::regclass
  ) THEN
    ALTER TABLE payment_allocation
      ADD CONSTRAINT fk_payment_allocation_repayment_org_member_receipt
      FOREIGN KEY (org_id, member_id, receipt_id, repayment_id)
      REFERENCES repayment(org_id, member_id, payment_receipt_id, id);
  END IF;
END $$;

ALTER TABLE contribution
  DROP CONSTRAINT IF EXISTS contribution_payment_receipt_id_payment_receipt_id_fk;

ALTER TABLE repayment
  DROP CONSTRAINT IF EXISTS repayment_payment_receipt_id_payment_receipt_id_fk;

ALTER TABLE payment_allocation
  DROP CONSTRAINT IF EXISTS payment_allocation_receipt_id_payment_receipt_id_fk,
  DROP CONSTRAINT IF EXISTS payment_allocation_contribution_id_contribution_id_fk,
  DROP CONSTRAINT IF EXISTS payment_allocation_repayment_id_repayment_id_fk;

ALTER TABLE payment_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipt FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_receipt_tenant_isolation ON payment_receipt;
CREATE POLICY payment_receipt_tenant_isolation ON payment_receipt
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE payment_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_allocation_tenant_isolation ON payment_allocation;
CREATE POLICY payment_allocation_tenant_isolation ON payment_allocation
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
