DO $$
BEGIN
  CREATE TYPE expense_category_enum AS ENUM (
    'bank_fee',
    'supplies',
    'shared_expense',
    'operating',
    'solidarity_payout',
    'treasurer_comp_payout'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE expense
  ADD COLUMN IF NOT EXISTS account_id uuid,
  ADD COLUMN IF NOT EXISTS category expense_category_enum NOT NULL DEFAULT 'operating',
  ADD COLUMN IF NOT EXISTS slip_photo_id uuid;

ALTER TABLE expense
  ALTER COLUMN category DROP DEFAULT,
  ADD CONSTRAINT fk_expense_account_id FOREIGN KEY (account_id) REFERENCES account(id),
  ADD CONSTRAINT fk_expense_slip_photo_id FOREIGN KEY (slip_photo_id) REFERENCES slip_photo(id);

ALTER TABLE contribution
  ADD COLUMN IF NOT EXISTS account_id uuid,
  ADD COLUMN IF NOT EXISTS reconciliation_status extraordinary_collection_line_reconciliation_status_enum NOT NULL DEFAULT 'regularized',
  ADD CONSTRAINT fk_contribution_account_id FOREIGN KEY (account_id) REFERENCES account(id);

ALTER TABLE repayment
  ADD COLUMN IF NOT EXISTS account_id uuid,
  ADD COLUMN IF NOT EXISTS reconciliation_status extraordinary_collection_line_reconciliation_status_enum NOT NULL DEFAULT 'regularized',
  ADD CONSTRAINT fk_repayment_account_id FOREIGN KEY (account_id) REFERENCES account(id);

ALTER TABLE transfer
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_transfer_distinct_accounts'
  ) THEN
    ALTER TABLE transfer ADD CONSTRAINT ck_transfer_distinct_accounts
      CHECK (from_account_id <> to_account_id) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_account_org_group_fund
  ON account(org_id, is_group_fund, status);

CREATE INDEX IF NOT EXISTS idx_expense_org_account_date
  ON expense(org_id, account_id, incurred_on);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_org_client_request
  ON transfer(org_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contribution_org_reconciliation
  ON contribution(org_id, reconciliation_status, dated_on);

CREATE INDEX IF NOT EXISTS idx_repayment_org_reconciliation
  ON repayment(org_id, reconciliation_status, dated_on);
