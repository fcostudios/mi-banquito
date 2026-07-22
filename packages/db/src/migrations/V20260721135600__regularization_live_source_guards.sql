-- A reversed deposit original is no longer a live source and cannot receive new coverage.
-- Pin the complete regularization guard so direct SQL and the domain service agree.
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
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'regularization_amount_invalid', ERRCODE = '23514';
  END IF;
  IF NEW.regularizes_kind IS NULL
    OR NEW.regularizes_kind NOT IN ('contribution', 'repayment', 'extraordinary_collection')
    OR NEW.regularizes_id IS NULL
  THEN
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
      AND a.is_group_fund = false
      AND NOT EXISTS (
        SELECT 1 FROM contribution reversal
        WHERE reversal.org_id = c.org_id AND reversal.reverses_id = c.id
      );
  ELSIF NEW.regularizes_kind = 'repayment' THEN
    SELECT r.amount, r.reconciliation_status = 'pending'
      INTO source_amount, source_pending
    FROM repayment r
    JOIN account a ON a.id = r.account_id AND a.org_id = r.org_id
    WHERE r.id = NEW.regularizes_id AND r.org_id = NEW.org_id
      AND r.reverses_id IS NULL AND r.account_id = NEW.from_account_id
      AND a.is_group_fund = false
      AND NOT EXISTS (
        SELECT 1 FROM repayment reversal
        WHERE reversal.org_id = r.org_id AND reversal.reverses_id = r.id
      );
  ELSE
    SELECT line.amount, line.reconciliation_status = 'pending'
      INTO source_amount, source_pending
    FROM extraordinary_collection_line line
    JOIN account a ON a.id = line.account_id AND a.org_id = line.org_id
    WHERE line.id = NEW.regularizes_id AND line.org_id = NEW.org_id
      AND line.reverses_id IS NULL AND line.account_id = NEW.from_account_id
      AND a.status = 'active' AND a.is_group_fund = false
      AND NOT EXISTS (
        SELECT 1 FROM extraordinary_collection_line reversal
        WHERE reversal.org_id = line.org_id AND reversal.reverses_id = line.id
      );
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
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

DROP TRIGGER IF EXISTS transfer_regularization_guard ON transfer;
CREATE TRIGGER transfer_regularization_guard
  BEFORE INSERT ON transfer
  FOR EACH ROW EXECUTE FUNCTION validate_regularization_transfer();
