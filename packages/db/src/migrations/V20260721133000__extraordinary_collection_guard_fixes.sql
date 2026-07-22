ALTER TABLE extraordinary_collection
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_disposition,
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_status_expense;

ALTER TABLE extraordinary_collection
  ADD CONSTRAINT ck_extraordinary_collection_disposition CHECK ((
    (surplus_amount IS NULL AND disposition IS NULL AND disposition_motive IS NULL AND surplus_transfer_id IS NULL)
    OR (surplus_amount = 0 AND disposition IS NULL AND disposition_motive IS NULL AND surplus_transfer_id IS NULL)
    OR (surplus_amount > 0 AND disposition = 'returned' AND disposition_motive IS NULL AND surplus_transfer_id IS NOT NULL)
    OR (surplus_amount > 0 AND disposition = 'retained' AND disposition_motive IS NOT NULL
      AND length(btrim(disposition_motive)) >= 3 AND surplus_transfer_id IS NULL)
  ) IS TRUE),
  ADD CONSTRAINT ck_extraordinary_collection_status_expense CHECK ((
    (kind = 'treasurer_recognition' AND paid_out_expense_id IS NULL)
    OR (
      kind = 'solidarity'
      AND (
        (status IN ('open', 'collecting', 'cancelled') AND paid_out_expense_id IS NULL)
        OR (status IN ('paid_out', 'closed') AND paid_out_expense_id IS NOT NULL)
      )
    )
  ) IS TRUE);

ALTER TABLE extraordinary_collection_line
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_line_reversal_pair;

ALTER TABLE extraordinary_collection_line
  ADD CONSTRAINT ck_extraordinary_collection_line_reversal_pair CHECK ((
    (reverses_id IS NULL AND reverse_reason IS NULL)
    OR (
      reverses_id IS NOT NULL
      AND reverse_reason IS NOT NULL
      AND length(btrim(reverse_reason)) >= 3
    )
  ) IS TRUE);

CREATE OR REPLACE FUNCTION allow_extraordinary_collection_transition() RETURNS trigger AS $$
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

    IF NEW.status = 'closed' AND NEW.paid_out_expense_id IS NOT NULL THEN
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
    IF NOT ((
      (NEW.surplus_amount = 0 AND NEW.disposition IS NULL AND NEW.disposition_motive IS NULL AND NEW.surplus_transfer_id IS NULL)
      OR (NEW.surplus_amount > 0 AND NEW.disposition = 'returned' AND NEW.disposition_motive IS NULL AND NEW.surplus_transfer_id IS NOT NULL)
      OR (NEW.surplus_amount > 0 AND NEW.disposition = 'retained' AND NEW.disposition_motive IS NOT NULL
        AND length(btrim(NEW.disposition_motive)) >= 3 AND NEW.surplus_transfer_id IS NULL)
    ) IS TRUE) THEN
      RAISE EXCEPTION USING MESSAGE = 'collection_disposition_invalid', ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING MESSAGE = 'append_only_violation', ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
