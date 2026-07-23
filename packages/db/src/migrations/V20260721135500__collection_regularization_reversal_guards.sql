DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM extraordinary_collection_line
    WHERE amount = 0 AND reconciliation_status = 'pending'
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'collection_upgrade_zero_pending_line',
      HINT = 'Regularize or reverse every legacy zero-valued pending collection line, then rerun migrations.',
      ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE extraordinary_collection_line
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_line_zero_regularized;
ALTER TABLE extraordinary_collection_line
  ADD CONSTRAINT ck_extraordinary_collection_line_zero_regularized CHECK (
    amount <> 0 OR reconciliation_status = 'regularized'
  );

CREATE INDEX IF NOT EXISTS idx_collection_line_pending_page
  ON extraordinary_collection_line(org_id, reconciliation_status, dated_on, id)
  WHERE reconciliation_status = 'pending' AND reverses_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_transfer_live_regularization_coverage
  ON transfer(org_id, purpose, regularizes_kind, regularizes_id)
  WHERE purpose = 'regularization' AND reverses_id IS NULL AND amount > 0;

CREATE OR REPLACE FUNCTION validate_extraordinary_collection_line_insert() RETURNS trigger AS $$
DECLARE
  collection extraordinary_collection%ROWTYPE;
  target extraordinary_collection_line%ROWTYPE;
BEGIN
  SELECT header.* INTO collection
  FROM extraordinary_collection header
  WHERE header.id = NEW.collection_id AND header.org_id = NEW.org_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'collection_not_found', ERRCODE = '23514';
  END IF;
  IF collection.status NOT IN ('open', 'collecting') THEN
    RAISE EXCEPTION USING MESSAGE = 'collection_not_collecting', ERRCODE = '23514';
  END IF;

  IF NEW.reverses_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT line.* INTO target
  FROM extraordinary_collection_line line
  WHERE line.id = NEW.reverses_id AND line.org_id = NEW.org_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'collection_line_reversal_target_unavailable', ERRCODE = '23514';
  END IF;
  IF target.collection_id IS DISTINCT FROM NEW.collection_id
    OR target.member_id IS DISTINCT FROM NEW.member_id
    OR target.account_id IS DISTINCT FROM NEW.account_id
    OR target.reconciliation_status IS DISTINCT FROM NEW.reconciliation_status
    OR target.amount IS DISTINCT FROM NEW.amount
  THEN
    RAISE EXCEPTION USING MESSAGE = 'collection_line_reversal_mismatch', ERRCODE = '23514';
  END IF;
  IF target.reverses_id IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'collection_line_reversal_target_invalid', ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM extraordinary_collection_line reversal
    WHERE reversal.reverses_id = NEW.reverses_id
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'collection_line_already_reversed', ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM transfer original
    WHERE original.org_id = NEW.org_id
      AND original.purpose = 'regularization'
      AND original.regularizes_kind = 'extraordinary_collection'
      AND original.regularizes_id = target.id
      AND original.amount > 0
      AND original.amount <> 'NaN'::numeric
      AND original.reverses_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM transfer reversal
        WHERE reversal.org_id = original.org_id AND reversal.reverses_id = original.id
      )
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'collection_line_regularization_active', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION validate_regularization_transfer_reversal() RETURNS trigger AS $$
DECLARE
  original transfer%ROWTYPE;
  collection_line_status text;
BEGIN
  IF NEW.reverses_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT candidate.* INTO original
  FROM transfer candidate
  WHERE candidate.id = NEW.reverses_id AND candidate.org_id = NEW.org_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    IF NEW.purpose = 'regularization_reversal' THEN
      RAISE EXCEPTION USING MESSAGE = 'regularization_reversal_invalid', ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF original.purpose IS DISTINCT FROM 'regularization' THEN
    IF NEW.purpose = 'regularization_reversal' THEN
      RAISE EXCEPTION USING MESSAGE = 'regularization_reversal_invalid', ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF original.reverses_id IS NOT NULL
    OR NEW.purpose IS DISTINCT FROM 'regularization_reversal'
    OR NEW.from_account_id IS DISTINCT FROM original.to_account_id
    OR NEW.to_account_id IS DISTINCT FROM original.from_account_id
    OR NEW.amount IS DISTINCT FROM original.amount
    OR NEW.currency_code IS DISTINCT FROM original.currency_code
    OR NEW.regularizes_kind IS DISTINCT FROM original.regularizes_kind
    OR NEW.regularizes_id IS DISTINCT FROM original.regularizes_id
    OR EXISTS (
      SELECT 1 FROM transfer prior_reversal
      WHERE prior_reversal.org_id = original.org_id AND prior_reversal.reverses_id = original.id
    )
  THEN
    RAISE EXCEPTION USING MESSAGE = 'regularization_reversal_invalid', ERRCODE = '23514';
  END IF;

  IF original.regularizes_kind = 'extraordinary_collection' THEN
    SELECT line.reconciliation_status INTO collection_line_status
    FROM extraordinary_collection_line line
    WHERE line.id = original.regularizes_id AND line.org_id = original.org_id
    FOR KEY SHARE;
    IF collection_line_status IS NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'regularization_reversal_invalid', ERRCODE = '23514';
    END IF;
    IF collection_line_status = 'regularized' THEN
      RAISE EXCEPTION USING MESSAGE = 'regularization_reversal_requires_reopen', ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

DROP TRIGGER IF EXISTS collection_regularization_transfer_reversal_guard ON transfer;
CREATE TRIGGER collection_regularization_transfer_reversal_guard
  BEFORE INSERT ON transfer
  FOR EACH ROW EXECUTE FUNCTION validate_regularization_transfer_reversal();
