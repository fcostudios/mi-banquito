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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;
