-- US-097 additive repair: a governed solidarity payout must name the holding
-- account. The existing zz_collection_payout_holding_guard invokes this
-- replacement after the lifecycle trigger has preserved its prior error order.

CREATE OR REPLACE FUNCTION validate_collection_payout_holding() RETURNS trigger AS $$
DECLARE
  payout_account_id uuid;
  payout_amount numeric(18, 4);
  holding_amount numeric(18, 4);
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.status = 'collecting'
    AND NEW.status = 'paid_out'
    AND NEW.kind = 'solidarity'
  THEN
    SELECT e.account_id, e.amount INTO payout_account_id, payout_amount
    FROM expense e
    WHERE e.org_id = NEW.org_id AND e.id = NEW.paid_out_expense_id;

    IF payout_account_id IS NULL THEN
      RAISE EXCEPTION USING
        MESSAGE = 'collection_payout_account_required',
        ERRCODE = '23514';
    END IF;

    IF payout_amount IS NOT NULL THEN
      holding_amount := collection_holding_amount(NEW.org_id, NEW.id, payout_account_id);
      IF holding_amount < payout_amount THEN
        RAISE EXCEPTION USING
          MESSAGE = 'collection_payout_holding_insufficient',
          ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;
