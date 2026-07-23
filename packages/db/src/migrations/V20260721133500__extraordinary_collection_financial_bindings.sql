-- CHG-011 reference-binding contract.
-- Returned surplus is represented by exactly one live transfer with:
--   purpose = 'collection_surplus_return'
--   regularizes_kind = 'extraordinary_collection'
--   regularizes_id = extraordinary_collection.id

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM extraordinary_collection_line line
    JOIN extraordinary_collection_line target ON target.id = line.reverses_id
    WHERE line.reverses_id IS NOT NULL
      AND (
        target.org_id IS DISTINCT FROM line.org_id
        OR target.collection_id IS DISTINCT FROM line.collection_id
        OR target.member_id IS DISTINCT FROM line.member_id
        OR target.account_id IS DISTINCT FROM line.account_id
        OR target.reconciliation_status IS DISTINCT FROM line.reconciliation_status
        OR target.amount IS DISTINCT FROM line.amount
        OR target.reverses_id IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'collection_upgrade_reversal_binding_invalid',
      HINT = 'Repair legacy reversal rows so every reversal exactly matches one original row.',
      ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT reverses_id FROM extraordinary_collection_line
    WHERE reverses_id IS NOT NULL
    GROUP BY reverses_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'collection_upgrade_duplicate_line_reversal',
      HINT = 'Retain exactly one reversal row per original globally, then rerun migrations.',
      ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM transfer
    WHERE purpose = 'regularization' AND (regularizes_kind IS NULL OR amount <= 0)
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'collection_upgrade_regularization_transfer_invalid',
      HINT = 'Repair NULL regularizes_kind and nonpositive regularization amounts, then rerun migrations.',
      ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE expense
  ADD CONSTRAINT uq_expense_org_id_id UNIQUE (org_id, id);
ALTER TABLE transfer
  ADD CONSTRAINT uq_transfer_org_id_id UNIQUE (org_id, id);
ALTER TABLE extraordinary_collection
  ADD CONSTRAINT uq_extraordinary_collection_org_id_id UNIQUE (org_id, id);
ALTER TABLE extraordinary_collection_line
  ADD CONSTRAINT uq_extraordinary_collection_line_reversal_target
  UNIQUE (org_id, collection_id, member_id, account_id, reconciliation_status, amount, id);

ALTER TABLE extraordinary_collection
  ADD CONSTRAINT fk_extraordinary_collection_paid_out_expense_org
    FOREIGN KEY (org_id, paid_out_expense_id) REFERENCES expense(org_id, id),
  ADD CONSTRAINT fk_extraordinary_collection_surplus_transfer_org
    FOREIGN KEY (org_id, surplus_transfer_id) REFERENCES transfer(org_id, id);

ALTER TABLE extraordinary_collection_line
  ADD CONSTRAINT fk_extraordinary_collection_line_org_collection
    FOREIGN KEY (org_id, collection_id) REFERENCES extraordinary_collection(org_id, id),
  ADD CONSTRAINT fk_extraordinary_collection_line_reversal_binding
    FOREIGN KEY (
      org_id, collection_id, member_id, account_id, reconciliation_status, amount, reverses_id
    ) REFERENCES extraordinary_collection_line (
      org_id, collection_id, member_id, account_id, reconciliation_status, amount, id
    );

CREATE UNIQUE INDEX uq_extraordinary_collection_line_reverses
  ON extraordinary_collection_line(reverses_id)
  WHERE reverses_id IS NOT NULL;

ALTER TABLE transfer DROP CONSTRAINT IF EXISTS ck_transfer_regularization_amount_positive;
ALTER TABLE transfer ADD CONSTRAINT ck_transfer_regularization_amount_positive CHECK ((
  purpose IS DISTINCT FROM 'regularization' OR amount > 0
) IS TRUE);

CREATE OR REPLACE FUNCTION validate_extraordinary_collection_line_insert() RETURNS trigger AS $$
DECLARE
  target extraordinary_collection_line%ROWTYPE;
BEGIN
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

DROP TRIGGER IF EXISTS extraordinary_collection_line_insert_guard ON extraordinary_collection_line;
CREATE TRIGGER extraordinary_collection_line_insert_guard
  BEFORE INSERT ON extraordinary_collection_line
  FOR EACH ROW EXECUTE FUNCTION validate_extraordinary_collection_line_insert();

CREATE OR REPLACE FUNCTION protect_collection_payout_expense_reversal() RETURNS trigger AS $$
BEGIN
  IF NEW.reverses_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM extraordinary_collection collection
    WHERE collection.org_id = NEW.org_id
      AND collection.paid_out_expense_id = NEW.reverses_id
      AND collection.status IN ('paid_out', 'closed')
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'collection_payout_expense_reversal_forbidden', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

DROP TRIGGER IF EXISTS collection_payout_expense_reversal_guard ON expense;
CREATE TRIGGER collection_payout_expense_reversal_guard
  BEFORE INSERT ON expense
  FOR EACH ROW EXECUTE FUNCTION protect_collection_payout_expense_reversal();

CREATE OR REPLACE FUNCTION protect_collection_surplus_transfer_reversal() RETURNS trigger AS $$
BEGIN
  IF NEW.reverses_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM extraordinary_collection collection
    WHERE collection.org_id = NEW.org_id
      AND collection.surplus_transfer_id = NEW.reverses_id
      AND collection.status IN ('closed', 'cancelled')
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'collection_surplus_transfer_reversal_forbidden', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

DROP TRIGGER IF EXISTS collection_surplus_transfer_reversal_guard ON transfer;
CREATE TRIGGER collection_surplus_transfer_reversal_guard
  BEFORE INSERT ON transfer
  FOR EACH ROW EXECUTE FUNCTION protect_collection_surplus_transfer_reversal();

CREATE OR REPLACE FUNCTION allow_extraordinary_collection_transition() RETURNS trigger AS $$
DECLARE
  regularized_total numeric(18, 4);
  pending_total numeric(18, 4);
  payout_amount numeric(18, 4) := 0;
  payout_beneficiary uuid;
  payout_reverses_id uuid;
  payout_valid boolean := false;
  return_valid boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING MESSAGE = 'append_only_violation', ERRCODE = '55000';
  END IF;
  IF NEW.recognition_fiscal_year IS DISTINCT FROM OLD.recognition_fiscal_year THEN
    RAISE EXCEPTION USING MESSAGE = 'recognition_fiscal_year_immutable', ERRCODE = '55000';
  END IF;

  IF OLD.status = 'open' AND NEW.status = 'collecting'
    AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status')
  THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'collecting' AND NEW.status = 'paid_out'
    AND (to_jsonb(NEW) - ARRAY['status', 'paid_out_expense_id'])
      = (to_jsonb(OLD) - ARRAY['status', 'paid_out_expense_id'])
  THEN
    SELECT
      COALESCE(SUM(CASE WHEN line.reverses_id IS NULL THEN line.amount ELSE -ABS(line.amount) END)
        FILTER (WHERE line.reconciliation_status = 'regularized'), 0),
      COALESCE(SUM(CASE WHEN line.reverses_id IS NULL THEN line.amount ELSE -ABS(line.amount) END)
        FILTER (WHERE line.reconciliation_status = 'pending'), 0)
    INTO regularized_total, pending_total
    FROM extraordinary_collection_line line
    WHERE line.org_id = NEW.org_id AND line.collection_id = NEW.id;

    IF pending_total > 0 THEN
      RAISE EXCEPTION USING MESSAGE = 'collection_pending_regularization', ERRCODE = '23514';
    END IF;

    IF NEW.kind = 'solidarity' THEN
      SELECT e.amount, e.beneficiary_member_id, e.reverses_id
        INTO payout_amount, payout_beneficiary, payout_reverses_id
      FROM expense e
      WHERE e.id = NEW.paid_out_expense_id
        AND e.org_id = NEW.org_id
        AND e.category = 'solidarity_payout'
        AND e.status = 'paid';
      IF payout_amount IS NULL THEN
        RAISE EXCEPTION USING MESSAGE = 'solidarity_payout_expense_required', ERRCODE = '23514';
      END IF;
      IF payout_reverses_id IS NOT NULL OR EXISTS (
        SELECT 1 FROM expense reversal
        WHERE reversal.org_id = NEW.org_id AND reversal.reverses_id = NEW.paid_out_expense_id
      ) THEN
        RAISE EXCEPTION USING MESSAGE = 'solidarity_payout_expense_reversed', ERRCODE = '23514';
      END IF;
      IF payout_beneficiary IS DISTINCT FROM NEW.beneficiary_member_id THEN
        RAISE EXCEPTION USING MESSAGE = 'solidarity_payout_beneficiary_mismatch', ERRCODE = '23514';
      END IF;
      IF payout_amount <= 0 OR payout_amount > regularized_total THEN
        RAISE EXCEPTION USING MESSAGE = 'solidarity_payout_amount_invalid', ERRCODE = '23514';
      END IF;
    ELSIF NEW.kind = 'treasurer_recognition' THEN
      IF NEW.paid_out_expense_id IS NOT NULL THEN
        RAISE EXCEPTION USING MESSAGE = 'recognition_payout_expense_forbidden', ERRCODE = '23514';
      END IF;
    ELSE
      RAISE EXCEPTION USING MESSAGE = 'extraordinary_collection_transition_invalid', ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (
      (OLD.status = 'paid_out' AND NEW.status = 'closed')
      OR (OLD.status IN ('open', 'collecting') AND NEW.status = 'cancelled')
    )
    AND (to_jsonb(NEW) - ARRAY['status', 'surplus_amount', 'disposition', 'disposition_motive', 'surplus_transfer_id'])
      = (to_jsonb(OLD) - ARRAY['status', 'surplus_amount', 'disposition', 'disposition_motive', 'surplus_transfer_id'])
  THEN
    IF NEW.status = 'cancelled' AND NEW.paid_out_expense_id IS NOT NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'cancelled_collection_payout_forbidden', ERRCODE = '23514';
    END IF;
    SELECT
      COALESCE(SUM(CASE WHEN line.reverses_id IS NULL THEN line.amount ELSE -ABS(line.amount) END)
        FILTER (WHERE line.reconciliation_status = 'regularized'), 0),
      COALESCE(SUM(CASE WHEN line.reverses_id IS NULL THEN line.amount ELSE -ABS(line.amount) END)
        FILTER (WHERE line.reconciliation_status = 'pending'), 0)
    INTO regularized_total, pending_total
    FROM extraordinary_collection_line line
    WHERE line.org_id = NEW.org_id AND line.collection_id = NEW.id;
    IF pending_total > 0 THEN
      RAISE EXCEPTION USING MESSAGE = 'collection_pending_regularization', ERRCODE = '23514';
    END IF;
    payout_amount := 0;
    IF NEW.status = 'closed' AND NEW.paid_out_expense_id IS NOT NULL THEN
      SELECT e.amount INTO payout_amount
      FROM expense e
      WHERE e.id = NEW.paid_out_expense_id AND e.org_id = NEW.org_id
        AND e.category = 'solidarity_payout' AND e.status = 'paid';
      IF payout_amount IS NULL THEN
        RAISE EXCEPTION USING MESSAGE = 'solidarity_payout_expense_required', ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.surplus_amount IS DISTINCT FROM regularized_total - payout_amount THEN
      RAISE EXCEPTION USING MESSAGE = 'collection_surplus_mismatch', ERRCODE = '23514';
    END IF;
    IF NOT ((
      (NEW.surplus_amount = 0 AND NEW.disposition IS NULL AND NEW.disposition_motive IS NULL AND NEW.surplus_transfer_id IS NULL)
      OR (NEW.surplus_amount > 0 AND NEW.disposition = 'returned' AND NEW.disposition_motive IS NULL AND NEW.surplus_transfer_id IS NOT NULL)
      OR (NEW.surplus_amount > 0 AND NEW.disposition = 'retained' AND NEW.disposition_motive IS NOT NULL
        AND length(btrim(NEW.disposition_motive)) >= 3 AND NEW.surplus_transfer_id IS NULL)
    ) IS TRUE) THEN
      RAISE EXCEPTION USING MESSAGE = 'collection_disposition_invalid', ERRCODE = '23514';
    END IF;
    IF NEW.disposition = 'returned' THEN
      SELECT EXISTS (
        SELECT 1 FROM transfer t
        JOIN account source ON source.id = t.from_account_id AND source.org_id = t.org_id
        JOIN account destination ON destination.id = t.to_account_id AND destination.org_id = t.org_id
        WHERE t.id = NEW.surplus_transfer_id
          AND t.org_id = NEW.org_id
          AND t.amount = NEW.surplus_amount
          AND t.purpose = 'collection_surplus_return'
          AND t.regularizes_kind = 'extraordinary_collection'
          AND t.regularizes_id = NEW.id
          AND t.reverses_id IS NULL
          AND source.status = 'active' AND source.is_group_fund = true
          AND destination.status = 'active' AND destination.is_group_fund = false
          AND NOT EXISTS (
            SELECT 1 FROM transfer reversal
            WHERE reversal.org_id = t.org_id AND reversal.reverses_id = t.id
          )
      ) INTO return_valid;
      IF NOT return_valid THEN
        RAISE EXCEPTION USING MESSAGE = 'collection_surplus_return_invalid', ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING MESSAGE = 'append_only_violation', ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

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
    SELECT 1 FROM account a WHERE a.id = NEW.to_account_id AND a.org_id = NEW.org_id
      AND a.status = 'active' AND a.is_group_fund = true
  ) INTO target_matches;
  IF NEW.regularizes_kind = 'contribution' THEN
    SELECT c.amount, c.reconciliation_status = 'pending' INTO source_amount, source_pending
    FROM contribution c JOIN account a ON a.id = c.account_id AND a.org_id = c.org_id
    WHERE c.id = NEW.regularizes_id AND c.org_id = NEW.org_id
      AND c.reverses_id IS NULL AND c.account_id = NEW.from_account_id AND a.is_group_fund = false;
  ELSIF NEW.regularizes_kind = 'repayment' THEN
    SELECT r.amount, r.reconciliation_status = 'pending' INTO source_amount, source_pending
    FROM repayment r JOIN account a ON a.id = r.account_id AND a.org_id = r.org_id
    WHERE r.id = NEW.regularizes_id AND r.org_id = NEW.org_id
      AND r.reverses_id IS NULL AND r.account_id = NEW.from_account_id AND a.is_group_fund = false;
  ELSE
    SELECT line.amount, line.reconciliation_status = 'pending' INTO source_amount, source_pending
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
  SELECT COALESCE(SUM(t.amount), 0) INTO covered_amount
  FROM transfer t
  WHERE t.org_id = NEW.org_id AND t.purpose = 'regularization'
    AND t.regularizes_kind = NEW.regularizes_kind AND t.regularizes_id = NEW.regularizes_id
    AND t.reverses_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM transfer reversal WHERE reversal.org_id = t.org_id AND reversal.reverses_id = t.id);
  IF covered_amount + NEW.amount > source_amount THEN
    RAISE EXCEPTION USING MESSAGE = 'regularization_amount_exceeds_remaining', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;
