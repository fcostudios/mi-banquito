-- US-099 / BR-16: append-only, tenant-scoped cash projections.
-- Collection money remains earmarked: it is physical cash, but never core/distributable cash.

CREATE OR REPLACE FUNCTION fund_pool_balance(p_org_id UUID, p_through_date DATE DEFAULT NULL)
RETURNS NUMERIC(18, 4)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(SUM(delta), 0)::NUMERIC(18, 4)
  FROM (
    SELECT CASE WHEN c.reverses_id IS NULL THEN c.amount ELSE -ABS(c.amount) END AS delta
    FROM contribution c
    LEFT JOIN contribution original ON original.id = c.reverses_id AND original.org_id = c.org_id
    LEFT JOIN account a ON a.id = COALESCE(original.account_id, c.account_id) AND a.org_id = c.org_id
    WHERE c.org_id = p_org_id
      AND COALESCE(original.reconciliation_status, c.reconciliation_status) = 'regularized'
      AND (COALESCE(original.account_id, c.account_id) IS NULL OR a.is_group_fund = true)
      AND (p_through_date IS NULL OR c.dated_on <= p_through_date)
    UNION ALL
    SELECT CASE WHEN r.reverses_id IS NULL THEN r.amount ELSE -ABS(r.amount) END
    FROM repayment r
    LEFT JOIN repayment original ON original.id = r.reverses_id AND original.org_id = r.org_id
    LEFT JOIN account a ON a.id = COALESCE(original.account_id, r.account_id) AND a.org_id = r.org_id
    WHERE r.org_id = p_org_id
      AND COALESCE(original.reconciliation_status, r.reconciliation_status) = 'regularized'
      AND (COALESCE(original.account_id, r.account_id) IS NULL OR a.is_group_fund = true)
      AND (p_through_date IS NULL OR r.dated_on <= p_through_date)
    UNION ALL
    SELECT CASE
      WHEN destination.is_group_fund AND NOT source.is_group_fund THEN t.amount
      WHEN source.is_group_fund AND NOT destination.is_group_fund THEN -t.amount
      ELSE 0
    END
    FROM transfer t
    JOIN account source ON source.id = t.from_account_id AND source.org_id = t.org_id
    JOIN account destination ON destination.id = t.to_account_id AND destination.org_id = t.org_id
    WHERE t.org_id = p_org_id
      AND t.purpose IS DISTINCT FROM 'collection_surplus_return'
      AND NOT (t.purpose = 'regularization' AND t.regularizes_kind = 'extraordinary_collection')
      AND NOT EXISTS (
        SELECT 1 FROM transfer original
        WHERE original.org_id = t.org_id AND original.id = t.reverses_id
          AND original.purpose = 'regularization'
          AND original.regularizes_kind = 'extraordinary_collection'
      )
      AND (p_through_date IS NULL OR t.dated_on <= p_through_date)
    UNION ALL
    SELECT CASE WHEN w.reverses_id IS NULL THEN -w.amount ELSE ABS(w.amount) END
    FROM withdrawal w
    WHERE w.org_id = p_org_id
      AND (p_through_date IS NULL OR w.dated_on <= p_through_date)
    UNION ALL
    SELECT CASE WHEN e.reverses_id IS NULL THEN -e.amount ELSE ABS(e.amount) END
    FROM expense e
    LEFT JOIN expense original ON original.id = e.reverses_id AND original.org_id = e.org_id
    WHERE e.org_id = p_org_id AND COALESCE(original.status, e.status) = 'paid'
      AND COALESCE(original.category, e.category) <> 'solidarity_payout'
      AND (p_through_date IS NULL OR e.incurred_on <= p_through_date)
    UNION ALL
    SELECT -d.amount
    FROM loan_disbursement d
    WHERE d.org_id = p_org_id
      AND (p_through_date IS NULL OR d.disbursed_on <= p_through_date)
  ) core_delta;
$$;

CREATE OR REPLACE FUNCTION collection_cash_balance(p_org_id UUID, p_through_date DATE DEFAULT NULL)
RETURNS NUMERIC(18, 4)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(SUM(delta), 0)::NUMERIC(18, 4)
  FROM (
    SELECT CASE WHEN line.reverses_id IS NULL THEN line.amount ELSE -ABS(line.amount) END AS delta
    FROM extraordinary_collection_line line
    WHERE line.org_id = p_org_id
      AND line.reconciliation_status = 'regularized'
      AND (p_through_date IS NULL OR line.dated_on <= p_through_date)
    UNION ALL
    SELECT CASE WHEN payout.reverses_id IS NULL THEN -payout.amount ELSE ABS(payout.amount) END
    FROM expense payout
    JOIN extraordinary_collection collection
      ON collection.org_id = payout.org_id
      AND collection.paid_out_expense_id = COALESCE(payout.reverses_id, payout.id)
    WHERE payout.org_id = p_org_id
      AND payout.status = 'paid'
      AND payout.category = 'solidarity_payout'
      AND (p_through_date IS NULL OR payout.incurred_on <= p_through_date)
    UNION ALL
    SELECT -return_transfer.amount
    FROM transfer return_transfer
    JOIN extraordinary_collection collection
      ON collection.org_id = return_transfer.org_id
      AND collection.surplus_transfer_id = return_transfer.id
    WHERE return_transfer.org_id = p_org_id
      AND return_transfer.purpose = 'collection_surplus_return'
      AND (p_through_date IS NULL OR return_transfer.dated_on <= p_through_date)
  ) collection_delta;
$$;

CREATE OR REPLACE FUNCTION physical_cash_balance(p_org_id UUID, p_through_date DATE DEFAULT NULL)
RETURNS NUMERIC(18, 4)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT (fund_pool_balance(p_org_id, p_through_date)
    + collection_cash_balance(p_org_id, p_through_date))::NUMERIC(18, 4);
$$;

-- Fail closed on malformed legacy-style corrections. A correction has the same
-- tenant and economic dimensions as one original and each original is reversed once.
CREATE OR REPLACE FUNCTION validate_core_ledger_reversal() RETURNS trigger AS $$
DECLARE
  original RECORD;
BEGIN
  IF NEW.reverses_id IS NULL THEN RETURN NEW; END IF;

  EXECUTE format('SELECT * FROM %I WHERE id = $1 FOR KEY SHARE', TG_TABLE_NAME)
    INTO original USING NEW.reverses_id;
  IF original.id IS NULL OR original.org_id IS DISTINCT FROM NEW.org_id OR original.reverses_id IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'ledger_reversal_target_invalid', ERRCODE = '23514';
  END IF;
  IF ABS(original.amount) IS DISTINCT FROM ABS(NEW.amount)
    OR original.currency_code IS DISTINCT FROM NEW.currency_code
  THEN
    RAISE EXCEPTION USING MESSAGE = 'ledger_reversal_mismatch', ERRCODE = '23514';
  END IF;
  IF NEW.reverse_reason IS NULL OR length(btrim(NEW.reverse_reason)) < 3 THEN
    RAISE EXCEPTION USING MESSAGE = 'ledger_reversal_mismatch', ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM contribution WHERE TG_TABLE_NAME = 'contribution' AND reverses_id = NEW.reverses_id)
    OR EXISTS (SELECT 1 FROM repayment WHERE TG_TABLE_NAME = 'repayment' AND reverses_id = NEW.reverses_id)
    OR EXISTS (SELECT 1 FROM withdrawal WHERE TG_TABLE_NAME = 'withdrawal' AND reverses_id = NEW.reverses_id)
    OR EXISTS (SELECT 1 FROM expense WHERE TG_TABLE_NAME = 'expense' AND reverses_id = NEW.reverses_id)
  THEN
    RAISE EXCEPTION USING MESSAGE = 'ledger_entry_already_reversed', ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

DROP TRIGGER IF EXISTS contribution_reversal_integrity ON contribution;
CREATE TRIGGER contribution_reversal_integrity BEFORE INSERT ON contribution
  FOR EACH ROW EXECUTE FUNCTION validate_core_ledger_reversal();
DROP TRIGGER IF EXISTS repayment_reversal_integrity ON repayment;
CREATE TRIGGER repayment_reversal_integrity BEFORE INSERT ON repayment
  FOR EACH ROW EXECUTE FUNCTION validate_core_ledger_reversal();
DROP TRIGGER IF EXISTS withdrawal_reversal_integrity ON withdrawal;
CREATE TRIGGER withdrawal_reversal_integrity BEFORE INSERT ON withdrawal
  FOR EACH ROW EXECUTE FUNCTION validate_core_ledger_reversal();
DROP TRIGGER IF EXISTS expense_reversal_integrity ON expense;
CREATE TRIGGER expense_reversal_integrity BEFORE INSERT ON expense
  FOR EACH ROW EXECUTE FUNCTION validate_core_ledger_reversal();

CREATE OR REPLACE FUNCTION validate_transfer_reversal_integrity() RETURNS trigger AS $$
DECLARE original transfer%ROWTYPE;
BEGIN
  IF NEW.reverses_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO original FROM transfer
  WHERE org_id = NEW.org_id AND id = NEW.reverses_id FOR KEY SHARE;
  IF NOT FOUND OR original.reverses_id IS NOT NULL
    OR NEW.from_account_id IS DISTINCT FROM original.to_account_id
    OR NEW.to_account_id IS DISTINCT FROM original.from_account_id
    OR NEW.amount IS DISTINCT FROM original.amount
    OR NEW.currency_code IS DISTINCT FROM original.currency_code
    OR EXISTS (SELECT 1 FROM transfer prior
      WHERE prior.org_id = NEW.org_id AND prior.reverses_id = NEW.reverses_id)
  THEN
    RAISE EXCEPTION USING MESSAGE = 'transfer_reversal_mismatch', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

DROP TRIGGER IF EXISTS transfer_reversal_integrity ON transfer;
CREATE TRIGGER transfer_reversal_integrity BEFORE INSERT ON transfer
  FOR EACH ROW EXECUTE FUNCTION validate_transfer_reversal_integrity();
