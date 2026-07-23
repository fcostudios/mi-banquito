DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'extraordinary_collection_disposition_enum') THEN
    CREATE TYPE extraordinary_collection_disposition_enum AS ENUM ('returned', 'retained');
  END IF;
END;
$$;

ALTER TABLE extraordinary_collection
  ADD COLUMN IF NOT EXISTS surplus_amount numeric(18, 4),
  ADD COLUMN IF NOT EXISTS disposition extraordinary_collection_disposition_enum,
  ADD COLUMN IF NOT EXISTS disposition_motive text,
  ADD COLUMN IF NOT EXISTS surplus_transfer_id uuid,
  ADD COLUMN IF NOT EXISTS recognition_fiscal_year integer;

ALTER TABLE extraordinary_collection_line
  ADD COLUMN IF NOT EXISTS reverses_id uuid,
  ADD COLUMN IF NOT EXISTS reverse_reason text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM extraordinary_collection_line WHERE account_id IS NULL) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'extraordinary_collection_line_account_backfill_required',
      ERRCODE = '23502';
  END IF;
END;
$$;

ALTER TABLE extraordinary_collection_line ALTER COLUMN account_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'extraordinary_collection'::regclass
      AND conname = 'fk_extraordinary_collection_surplus_transfer_id'
  ) THEN
    ALTER TABLE extraordinary_collection
      ADD CONSTRAINT fk_extraordinary_collection_surplus_transfer_id
      FOREIGN KEY (surplus_transfer_id) REFERENCES transfer(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'extraordinary_collection_line'::regclass
      AND conname = 'fk_extraordinary_collection_line_reverses_id'
  ) THEN
    ALTER TABLE extraordinary_collection_line
      ADD CONSTRAINT fk_extraordinary_collection_line_reverses_id
      FOREIGN KEY (reverses_id) REFERENCES extraordinary_collection_line(id);
  END IF;
END;
$$;

ALTER TABLE extraordinary_collection
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_kind,
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_status,
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_target_nonnegative,
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_recognition_year,
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_disposition;

ALTER TABLE extraordinary_collection
  ADD CONSTRAINT ck_extraordinary_collection_kind
    CHECK (kind IN ('solidarity', 'treasurer_recognition')),
  ADD CONSTRAINT ck_extraordinary_collection_status
    CHECK (status IN ('open', 'collecting', 'paid_out', 'closed', 'cancelled')),
  ADD CONSTRAINT ck_extraordinary_collection_target_nonnegative
    CHECK (target_amount IS NULL OR target_amount >= 0),
  ADD CONSTRAINT ck_extraordinary_collection_recognition_year
    CHECK (
      (kind = 'treasurer_recognition' AND recognition_fiscal_year IS NOT NULL)
      OR (kind = 'solidarity' AND recognition_fiscal_year IS NULL)
    ),
  ADD CONSTRAINT ck_extraordinary_collection_disposition
    CHECK (
      (surplus_amount IS NULL AND disposition IS NULL AND disposition_motive IS NULL AND surplus_transfer_id IS NULL)
      OR (surplus_amount = 0 AND disposition IS NULL AND disposition_motive IS NULL AND surplus_transfer_id IS NULL)
      OR (surplus_amount > 0 AND disposition = 'returned' AND disposition_motive IS NULL AND surplus_transfer_id IS NOT NULL)
      OR (surplus_amount > 0 AND disposition = 'retained' AND length(btrim(disposition_motive)) >= 3 AND surplus_transfer_id IS NULL)
    );

ALTER TABLE extraordinary_collection_line
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_line_amount_nonnegative,
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_line_reversal_pair;

ALTER TABLE extraordinary_collection_line
  ADD CONSTRAINT ck_extraordinary_collection_line_amount_nonnegative CHECK (amount >= 0),
  ADD CONSTRAINT ck_extraordinary_collection_line_reversal_pair CHECK (
    (reverses_id IS NULL AND reverse_reason IS NULL)
    OR (reverses_id IS NOT NULL AND length(btrim(reverse_reason)) >= 3)
  );

CREATE INDEX IF NOT EXISTS idx_extraordinary_collection_org_status_opened
  ON extraordinary_collection(org_id, status, opened_on);
CREATE INDEX IF NOT EXISTS idx_extraordinary_collection_org_recognition_year
  ON extraordinary_collection(org_id, recognition_fiscal_year)
  WHERE kind = 'treasurer_recognition';
CREATE INDEX IF NOT EXISTS idx_extraordinary_collection_line_org_collection_date
  ON extraordinary_collection_line(org_id, collection_id, dated_on);
CREATE UNIQUE INDEX IF NOT EXISTS uq_extraordinary_collection_line_org_reverses
  ON extraordinary_collection_line(org_id, reverses_id)
  WHERE reverses_id IS NOT NULL;

DROP TRIGGER IF EXISTS extraordinary_collection_no_mutate ON extraordinary_collection;
DROP TRIGGER IF EXISTS extraordinary_collection_transition_guard ON extraordinary_collection;
DROP FUNCTION IF EXISTS allow_extraordinary_collection_transition();

CREATE FUNCTION allow_extraordinary_collection_transition() RETURNS trigger AS $$
DECLARE
  regularized_total numeric(18, 4);
  pending_total numeric(18, 4);
  payout_amount numeric(18, 4) := 0;
  payout_valid boolean := false;
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
    IF NEW.kind = 'solidarity' THEN
      SELECT EXISTS (
        SELECT 1 FROM expense e
        WHERE e.id = NEW.paid_out_expense_id
          AND e.org_id = NEW.org_id
          AND e.category = 'solidarity_payout'
          AND e.status = 'paid'
      ) INTO payout_valid;
      IF NEW.paid_out_expense_id IS NULL OR NOT payout_valid THEN
        RAISE EXCEPTION USING MESSAGE = 'solidarity_payout_expense_required', ERRCODE = '23514';
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

    IF NEW.paid_out_expense_id IS NOT NULL THEN
      SELECT e.amount INTO payout_amount
      FROM expense e
      WHERE e.id = NEW.paid_out_expense_id
        AND e.org_id = NEW.org_id
        AND e.category = 'solidarity_payout'
        AND e.status = 'paid';
      IF payout_amount IS NULL THEN
        RAISE EXCEPTION USING MESSAGE = 'solidarity_payout_expense_required', ERRCODE = '23514';
      END IF;
    END IF;

    IF NEW.surplus_amount IS DISTINCT FROM regularized_total - payout_amount THEN
      RAISE EXCEPTION USING MESSAGE = 'collection_surplus_mismatch', ERRCODE = '23514';
    END IF;
    IF NOT (
      (NEW.surplus_amount = 0 AND NEW.disposition IS NULL AND NEW.disposition_motive IS NULL AND NEW.surplus_transfer_id IS NULL)
      OR (NEW.surplus_amount > 0 AND NEW.disposition = 'returned' AND NEW.disposition_motive IS NULL AND NEW.surplus_transfer_id IS NOT NULL)
      OR (NEW.surplus_amount > 0 AND NEW.disposition = 'retained' AND length(btrim(NEW.disposition_motive)) >= 3 AND NEW.surplus_transfer_id IS NULL)
    ) THEN
      RAISE EXCEPTION USING MESSAGE = 'collection_disposition_invalid', ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING MESSAGE = 'append_only_violation', ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER extraordinary_collection_transition_guard
  BEFORE UPDATE OR DELETE ON extraordinary_collection
  FOR EACH ROW EXECUTE FUNCTION allow_extraordinary_collection_transition();

DROP TRIGGER IF EXISTS extraordinary_collection_line_no_mutate ON extraordinary_collection_line;
DROP TRIGGER IF EXISTS extraordinary_collection_line_regularization_guard ON extraordinary_collection_line;
DROP FUNCTION IF EXISTS allow_extraordinary_collection_line_regularization();

CREATE FUNCTION allow_extraordinary_collection_line_regularization() RETURNS trigger AS $$
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
      AND t.regularizes_kind = 'extraordinary_collection'
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

CREATE TRIGGER extraordinary_collection_line_regularization_guard
  BEFORE UPDATE OR DELETE ON extraordinary_collection_line
  FOR EACH ROW EXECUTE FUNCTION allow_extraordinary_collection_line_regularization();

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
  IF NEW.regularizes_kind NOT IN ('contribution', 'repayment', 'extraordinary_collection')
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
      AND a.is_group_fund = false;
  ELSIF NEW.regularizes_kind = 'repayment' THEN
    SELECT r.amount, r.reconciliation_status = 'pending'
      INTO source_amount, source_pending
    FROM repayment r
    JOIN account a ON a.id = r.account_id AND a.org_id = r.org_id
    WHERE r.id = NEW.regularizes_id AND r.org_id = NEW.org_id
      AND r.reverses_id IS NULL AND r.account_id = NEW.from_account_id
      AND a.is_group_fund = false;
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS transfer_regularization_guard ON transfer;
CREATE TRIGGER transfer_regularization_guard
  BEFORE INSERT ON transfer
  FOR EACH ROW EXECUTE FUNCTION validate_regularization_transfer();

DROP TRIGGER IF EXISTS aa_tenant_money_lock ON extraordinary_collection;
CREATE TRIGGER aa_tenant_money_lock
  BEFORE INSERT OR UPDATE OR DELETE ON extraordinary_collection
  FOR EACH ROW EXECUTE FUNCTION lock_tenant_money_write();

DROP TRIGGER IF EXISTS aa_tenant_money_lock ON extraordinary_collection_line;
CREATE TRIGGER aa_tenant_money_lock
  BEFORE INSERT OR UPDATE OR DELETE ON extraordinary_collection_line
  FOR EACH ROW EXECUTE FUNCTION lock_tenant_money_write();
