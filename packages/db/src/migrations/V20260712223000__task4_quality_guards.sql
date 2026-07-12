DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'period_close'::regclass
      AND conname = 'uq_period_close_org_id_cycle_id'
  ) THEN
    ALTER TABLE period_close
      ADD CONSTRAINT uq_period_close_org_id_cycle_id UNIQUE (org_id, cycle_id);
  END IF;
END;
$$;

ALTER TABLE statement_archive
  ADD COLUMN IF NOT EXISTS canonical_payload jsonb;

ALTER TABLE payment_receipt
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES account(id);

CREATE OR REPLACE FUNCTION lock_tenant_money_write() RETURNS trigger AS $$
DECLARE
  tenant_id uuid := COALESCE(NEW.org_id, OLD.org_id);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tenant-money:' || tenant_id::text, 0));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'contribution', 'repayment', 'expense', 'transfer', 'withdrawal', 'loan_disbursement'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS aa_tenant_money_lock ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER aa_tenant_money_lock BEFORE INSERT OR UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION lock_tenant_money_write()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION validate_regularization_transfer() RETURNS trigger AS $$
DECLARE
  source_amount numeric(18, 4);
  source_pending boolean;
  target_matches boolean;
  covered_amount numeric(18, 4);
BEGIN
  IF NEW.purpose IS DISTINCT FROM 'regularization' THEN
    RETURN NEW;
  END IF;
  IF NEW.regularizes_kind NOT IN ('contribution', 'repayment') OR NEW.regularizes_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'regularization_source_unavailable', ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM account a
    WHERE a.id = NEW.to_account_id AND a.org_id = NEW.org_id
      AND a.status = 'active' AND a.is_group_fund = true
  ) INTO target_matches;

  IF NEW.regularizes_kind = 'contribution' THEN
    SELECT c.amount, c.reconciliation_status = 'pending'
      INTO source_amount, source_pending
    FROM contribution c
    JOIN account a ON a.id = c.account_id AND a.org_id = c.org_id
    WHERE c.id = NEW.regularizes_id AND c.org_id = NEW.org_id
      AND c.reverses_id IS NULL AND c.account_id = NEW.from_account_id
      AND a.is_group_fund = false;
  ELSE
    SELECT r.amount, r.reconciliation_status = 'pending'
      INTO source_amount, source_pending
    FROM repayment r
    JOIN account a ON a.id = r.account_id AND a.org_id = r.org_id
    WHERE r.id = NEW.regularizes_id AND r.org_id = NEW.org_id
      AND r.reverses_id IS NULL AND r.account_id = NEW.from_account_id
      AND a.is_group_fund = false;
  END IF;

  IF NOT target_matches THEN
    RAISE EXCEPTION USING MESSAGE = 'regularization_target_unavailable', ERRCODE = '23514';
  END IF;
  IF source_amount IS NULL OR NOT source_pending THEN
    RAISE EXCEPTION USING MESSAGE = 'regularization_source_unavailable', ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(t.amount), 0)
    INTO covered_amount
  FROM transfer t
  WHERE t.org_id = NEW.org_id
    AND t.purpose = 'regularization'
    AND t.regularizes_kind = NEW.regularizes_kind
    AND t.regularizes_id = NEW.regularizes_id
    AND t.reverses_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM transfer reversal
      WHERE reversal.org_id = t.org_id AND reversal.reverses_id = t.id
    );

  IF covered_amount + NEW.amount > source_amount THEN
    RAISE EXCEPTION USING MESSAGE = 'regularization_amount_exceeds_remaining', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS transfer_regularization_guard ON transfer;
CREATE TRIGGER transfer_regularization_guard
  BEFORE INSERT ON transfer
  FOR EACH ROW EXECUTE FUNCTION validate_regularization_transfer();

CREATE OR REPLACE FUNCTION allow_reconciliation_status_regularization() RETURNS trigger AS $$
DECLARE
  covered_amount numeric(18, 4);
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.reconciliation_status = 'pending'
    AND NEW.reconciliation_status = 'regularized'
    AND (to_jsonb(NEW) - 'reconciliation_status') = (to_jsonb(OLD) - 'reconciliation_status')
  THEN
    SELECT COALESCE(SUM(t.amount), 0)
      INTO covered_amount
    FROM transfer t
    WHERE t.org_id = NEW.org_id
      AND t.purpose = 'regularization'
      AND t.regularizes_kind = TG_TABLE_NAME
      AND t.regularizes_id = NEW.id
      AND t.reverses_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM transfer reversal
        WHERE reversal.org_id = t.org_id AND reversal.reverses_id = t.id
      );
    IF covered_amount < NEW.amount THEN
      RAISE EXCEPTION USING MESSAGE = 'regularization_coverage_incomplete', ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING MESSAGE = 'append_only_violation', ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
