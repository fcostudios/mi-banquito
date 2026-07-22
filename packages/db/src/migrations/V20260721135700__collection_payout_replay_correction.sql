-- US-097 payout correction: bind payout expenses to collection cash holdings
-- and permit only exact, governed reversals of linked closed payouts.

CREATE OR REPLACE FUNCTION collection_holding_amount(
  p_org_id uuid,
  p_collection_id uuid,
  p_account_id uuid
) RETURNS numeric(18, 4) AS $$
  SELECT (
    COALESCE((
      SELECT SUM(line.amount)
      FROM extraordinary_collection_line line
      JOIN account holding ON holding.id = line.account_id AND holding.org_id = line.org_id
      WHERE line.org_id = p_org_id
        AND line.collection_id = p_collection_id
        AND line.reconciliation_status = 'regularized'
        AND line.reverses_id IS NULL
        AND line.amount > 0
        AND holding.id = p_account_id
        AND holding.status = 'active'
        AND holding.is_group_fund = true
        AND NOT EXISTS (
          SELECT 1 FROM extraordinary_collection_line reversal
          WHERE reversal.org_id = line.org_id AND reversal.reverses_id = line.id
        )
    ), 0)
    + COALESCE((
      SELECT SUM(regularization.amount)
      FROM extraordinary_collection_line line
      JOIN account origin ON origin.id = line.account_id AND origin.org_id = line.org_id
      JOIN transfer regularization
        ON regularization.org_id = line.org_id
        AND regularization.purpose = 'regularization'
        AND regularization.regularizes_kind = 'extraordinary_collection'
        AND regularization.regularizes_id = line.id
        AND regularization.reverses_id IS NULL
        AND regularization.amount > 0
        AND regularization.amount <> 'NaN'::numeric
      JOIN account holding
        ON holding.id = regularization.to_account_id
        AND holding.org_id = regularization.org_id
      WHERE line.org_id = p_org_id
        AND line.collection_id = p_collection_id
        AND line.reconciliation_status = 'regularized'
        AND line.reverses_id IS NULL
        AND line.amount > 0
        AND origin.is_group_fund = false
        AND holding.id = p_account_id
        AND holding.status = 'active'
        AND holding.is_group_fund = true
        AND NOT EXISTS (
          SELECT 1 FROM extraordinary_collection_line reversal
          WHERE reversal.org_id = line.org_id AND reversal.reverses_id = line.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM transfer reversal
          WHERE reversal.org_id = regularization.org_id
            AND reversal.reverses_id = regularization.id
        )
    ), 0)
  )::numeric(18, 4);
$$ LANGUAGE sql STABLE SET search_path = pg_catalog, public;

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

    IF payout_account_id IS NOT NULL AND payout_amount IS NOT NULL THEN
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

DROP TRIGGER IF EXISTS zz_collection_payout_holding_guard ON extraordinary_collection;
CREATE TRIGGER zz_collection_payout_holding_guard
  BEFORE UPDATE ON extraordinary_collection
  FOR EACH ROW EXECUTE FUNCTION validate_collection_payout_holding();

CREATE OR REPLACE FUNCTION protect_collection_payout_expense_reversal() RETURNS trigger AS $$
DECLARE
  original expense%ROWTYPE;
  linked_collection extraordinary_collection%ROWTYPE;
BEGIN
  IF NEW.reverses_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.* INTO original
  FROM expense e
  WHERE e.org_id = NEW.org_id AND e.id = NEW.reverses_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT collection.* INTO linked_collection
  FROM extraordinary_collection collection
  WHERE collection.org_id = NEW.org_id
    AND collection.paid_out_expense_id = original.id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF linked_collection.kind IS DISTINCT FROM 'solidarity'
    OR linked_collection.status IS DISTINCT FROM 'closed'
    OR original.category IS DISTINCT FROM 'solidarity_payout'
    OR original.status IS DISTINCT FROM 'paid'
    OR original.reverses_id IS NOT NULL
    OR NEW.account_id IS DISTINCT FROM original.account_id
    OR NEW.amount IS DISTINCT FROM original.amount
    OR NEW.currency_code IS DISTINCT FROM original.currency_code
    OR NEW.beneficiary_member_id IS DISTINCT FROM original.beneficiary_member_id
    OR NEW.beneficiary_text IS DISTINCT FROM original.beneficiary_text
    OR NEW.category IS DISTINCT FROM original.category
    OR NEW.status IS DISTINCT FROM 'paid'
    OR NEW.purpose IS DISTINCT FROM 'reversal: pago solidario'
    OR NEW.reverse_reason IS NULL
    OR length(btrim(NEW.reverse_reason)) < 10
    OR NEW.client_request_id IS NULL
  THEN
    RAISE EXCEPTION USING MESSAGE = 'collection_payout_reversal_mismatch', ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM expense prior
    WHERE prior.org_id = NEW.org_id AND prior.reverses_id = original.id
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'collection_payout_already_reversed', ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

DROP TRIGGER IF EXISTS collection_payout_expense_reversal_guard ON expense;
CREATE TRIGGER collection_payout_expense_reversal_guard
  BEFORE INSERT ON expense
  FOR EACH ROW EXECUTE FUNCTION protect_collection_payout_expense_reversal();
