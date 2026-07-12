CREATE OR REPLACE FUNCTION derive_deposit_reconciliation_status() RETURNS trigger AS $$
DECLARE
  account_is_group_fund boolean;
BEGIN
  IF NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.is_group_fund
  INTO account_is_group_fund
  FROM account a
  WHERE a.id = NEW.account_id
    AND a.org_id = NEW.org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'deposit_account_unavailable', ERRCODE = '23503';
  END IF;

  IF NEW.reverses_id IS NULL THEN
    NEW.reconciliation_status := CASE WHEN account_is_group_fund THEN 'regularized' ELSE 'pending' END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contribution_deposit_reconciliation ON contribution;
CREATE TRIGGER contribution_deposit_reconciliation
  BEFORE INSERT ON contribution
  FOR EACH ROW EXECUTE FUNCTION derive_deposit_reconciliation_status();

DROP TRIGGER IF EXISTS repayment_deposit_reconciliation ON repayment;
CREATE TRIGGER repayment_deposit_reconciliation
  BEFORE INSERT ON repayment
  FOR EACH ROW EXECUTE FUNCTION derive_deposit_reconciliation_status();

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
      AND t.reverses_id IS NULL;

    IF covered_amount < NEW.amount THEN
      RAISE EXCEPTION USING
        MESSAGE = 'regularization_coverage_incomplete',
        ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    MESSAGE = 'append_only_violation',
    ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contribution_no_mutate ON contribution;
CREATE TRIGGER contribution_no_mutate
  BEFORE UPDATE OR DELETE ON contribution
  FOR EACH ROW EXECUTE FUNCTION allow_reconciliation_status_regularization();

DROP TRIGGER IF EXISTS repayment_no_mutate ON repayment;
CREATE TRIGGER repayment_no_mutate
  BEFORE UPDATE OR DELETE ON repayment
  FOR EACH ROW EXECUTE FUNCTION allow_reconciliation_status_regularization();

CREATE OR REPLACE FUNCTION validate_regularization_transfer() RETURNS trigger AS $$
DECLARE
  source_matches boolean;
  target_matches boolean;
BEGIN
  IF NEW.purpose IS DISTINCT FROM 'regularization' THEN
    RETURN NEW;
  END IF;

  IF NEW.regularizes_kind NOT IN ('contribution', 'repayment') OR NEW.regularizes_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'regularization_source_unavailable', ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM account a
    WHERE a.id = NEW.to_account_id
      AND a.org_id = NEW.org_id
      AND a.status = 'active'
      AND a.is_group_fund = true
  ) INTO target_matches;

  IF NEW.regularizes_kind = 'contribution' THEN
    SELECT EXISTS (
      SELECT 1
      FROM contribution c
      JOIN account a ON a.id = c.account_id AND a.org_id = c.org_id
      WHERE c.id = NEW.regularizes_id
        AND c.org_id = NEW.org_id
        AND c.reconciliation_status = 'pending'
        AND c.reverses_id IS NULL
        AND c.account_id = NEW.from_account_id
        AND a.is_group_fund = false
    ) INTO source_matches;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM repayment r
      JOIN account a ON a.id = r.account_id AND a.org_id = r.org_id
      WHERE r.id = NEW.regularizes_id
        AND r.org_id = NEW.org_id
        AND r.reconciliation_status = 'pending'
        AND r.reverses_id IS NULL
        AND r.account_id = NEW.from_account_id
        AND a.is_group_fund = false
    ) INTO source_matches;
  END IF;

  IF NOT target_matches THEN
    RAISE EXCEPTION USING MESSAGE = 'regularization_target_unavailable', ERRCODE = '23514';
  END IF;
  IF NOT source_matches THEN
    RAISE EXCEPTION USING MESSAGE = 'regularization_source_unavailable', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS transfer_regularization_guard ON transfer;
CREATE TRIGGER transfer_regularization_guard
  BEFORE INSERT ON transfer
  FOR EACH ROW EXECUTE FUNCTION validate_regularization_transfer();
