-- US-099 follow-up: exact reversal topology, race-safe one-to-one correction,
-- and one-to-one collection financial bindings. V20260721140000 is immutable.

DO $$
BEGIN
  IF EXISTS (
    SELECT reverses_id FROM contribution WHERE reverses_id IS NOT NULL GROUP BY reverses_id HAVING count(*) > 1
    UNION ALL SELECT reverses_id FROM repayment WHERE reverses_id IS NOT NULL GROUP BY reverses_id HAVING count(*) > 1
    UNION ALL SELECT reverses_id FROM withdrawal WHERE reverses_id IS NOT NULL GROUP BY reverses_id HAVING count(*) > 1
    UNION ALL SELECT reverses_id FROM expense WHERE reverses_id IS NOT NULL GROUP BY reverses_id HAVING count(*) > 1
    UNION ALL SELECT reverses_id FROM transfer WHERE reverses_id IS NOT NULL GROUP BY reverses_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'sprint9_reversal_preflight_duplicate',
      HINT = 'Retain exactly one valid reversal per original ledger row before retrying.', ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM contribution reversal LEFT JOIN contribution original ON original.id = reversal.reverses_id
    WHERE reversal.reverses_id IS NOT NULL AND (
      original.id IS NULL OR original.reverses_id IS NOT NULL OR reversal.org_id IS DISTINCT FROM original.org_id
      OR ABS(reversal.amount) IS DISTINCT FROM ABS(original.amount)
      OR reversal.currency_code IS DISTINCT FROM original.currency_code
      OR reversal.cycle_id IS DISTINCT FROM original.cycle_id OR reversal.member_id IS DISTINCT FROM original.member_id
      OR reversal.kind IS DISTINCT FROM original.kind OR reversal.payment_source IS DISTINCT FROM original.payment_source
      OR reversal.account_id IS DISTINCT FROM original.account_id
      OR reversal.reconciliation_status IS DISTINCT FROM original.reconciliation_status
      OR reversal.payment_receipt_id IS DISTINCT FROM original.payment_receipt_id
      OR reversal.dated_on < original.dated_on OR reversal.reverse_reason IS NULL
      OR length(btrim(reversal.reverse_reason)) < 3)
    UNION ALL
    SELECT 1 FROM repayment reversal LEFT JOIN repayment original ON original.id = reversal.reverses_id
    WHERE reversal.reverses_id IS NOT NULL AND (
      original.id IS NULL OR original.reverses_id IS NOT NULL OR reversal.org_id IS DISTINCT FROM original.org_id
      OR ABS(reversal.amount) IS DISTINCT FROM ABS(original.amount)
      OR reversal.currency_code IS DISTINCT FROM original.currency_code
      OR reversal.loan_id IS DISTINCT FROM original.loan_id OR reversal.member_id IS DISTINCT FROM original.member_id
      OR reversal.applied_to_principal IS DISTINCT FROM original.applied_to_principal
      OR reversal.applied_to_interest IS DISTINCT FROM original.applied_to_interest
      OR reversal.applied_to_fee IS DISTINCT FROM original.applied_to_fee
      OR reversal.account_id IS DISTINCT FROM original.account_id
      OR reversal.reconciliation_status IS DISTINCT FROM original.reconciliation_status
      OR reversal.payment_receipt_id IS DISTINCT FROM original.payment_receipt_id
      OR reversal.dated_on < original.dated_on OR reversal.reverse_reason IS NULL
      OR length(btrim(reversal.reverse_reason)) < 3)
    UNION ALL
    SELECT 1 FROM withdrawal reversal LEFT JOIN withdrawal original ON original.id = reversal.reverses_id
    WHERE reversal.reverses_id IS NOT NULL AND (
      original.id IS NULL OR original.reverses_id IS NOT NULL OR reversal.org_id IS DISTINCT FROM original.org_id
      OR ABS(reversal.amount) IS DISTINCT FROM ABS(original.amount)
      OR reversal.currency_code IS DISTINCT FROM original.currency_code
      OR reversal.member_id IS DISTINCT FROM original.member_id
      OR NOT (reversal.kind = original.kind OR (original.kind = 'year_end_share_out' AND reversal.kind = 'year_end_reversal'))
      OR reversal.share_out_id IS DISTINCT FROM original.share_out_id
      OR reversal.year_end_share_out_line_id IS DISTINCT FROM original.year_end_share_out_line_id
      OR reversal.dated_on < original.dated_on OR reversal.reverse_reason IS NULL
      OR length(btrim(reversal.reverse_reason)) < 3)
    UNION ALL
    SELECT 1 FROM expense reversal LEFT JOIN expense original ON original.id = reversal.reverses_id
    WHERE reversal.reverses_id IS NOT NULL AND (
      original.id IS NULL OR original.reverses_id IS NOT NULL OR reversal.org_id IS DISTINCT FROM original.org_id
      OR ABS(reversal.amount) IS DISTINCT FROM ABS(original.amount)
      OR reversal.currency_code IS DISTINCT FROM original.currency_code
      OR reversal.account_id IS DISTINCT FROM original.account_id OR reversal.category IS DISTINCT FROM original.category
      OR reversal.status IS DISTINCT FROM original.status
      OR reversal.beneficiary_member_id IS DISTINCT FROM original.beneficiary_member_id
      OR reversal.beneficiary_text IS DISTINCT FROM original.beneficiary_text
      OR (CASE WHEN original.category = 'solidarity_payout'
        THEN reversal.purpose IS DISTINCT FROM 'reversal: pago solidario'
        ELSE reversal.purpose NOT IN (original.purpose, 'reversal: ' || original.purpose) END)
      OR reversal.incurred_on < original.incurred_on OR reversal.reverse_reason IS NULL
      OR length(btrim(reversal.reverse_reason)) < 3)
    UNION ALL
    SELECT 1 FROM transfer reversal LEFT JOIN transfer original ON original.id = reversal.reverses_id
    WHERE reversal.reverses_id IS NOT NULL AND (
      original.id IS NULL OR original.reverses_id IS NOT NULL OR reversal.org_id IS DISTINCT FROM original.org_id
      OR reversal.from_account_id IS DISTINCT FROM original.to_account_id
      OR reversal.to_account_id IS DISTINCT FROM original.from_account_id
      OR reversal.amount IS DISTINCT FROM original.amount OR reversal.currency_code IS DISTINCT FROM original.currency_code
      OR reversal.purpose IS DISTINCT FROM CASE
        WHEN original.purpose = 'regularization' THEN 'regularization_reversal'
        WHEN original.purpose = 'collection_surplus_return' THEN 'collection_surplus_return_reversal'
        ELSE 'transfer_reversal' END
      OR reversal.regularizes_kind IS DISTINCT FROM original.regularizes_kind
      OR reversal.regularizes_id IS DISTINCT FROM original.regularizes_id
      OR reversal.dated_on < original.dated_on)
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'sprint9_reversal_preflight_mismatch',
      HINT = 'Repair reversal dimensions, reason, and date topology before retrying.', ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT paid_out_expense_id FROM extraordinary_collection WHERE paid_out_expense_id IS NOT NULL
      GROUP BY paid_out_expense_id HAVING count(*) > 1
    UNION ALL
    SELECT surplus_transfer_id FROM extraordinary_collection WHERE surplus_transfer_id IS NOT NULL
      GROUP BY surplus_transfer_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'sprint9_collection_binding_preflight_duplicate',
      HINT = 'Bind each payout expense and surplus transfer to exactly one collection.', ERRCODE = '23514';
  END IF;
END;
$$;

CREATE UNIQUE INDEX uq_contribution_reverses_once ON contribution(reverses_id) WHERE reverses_id IS NOT NULL;
CREATE UNIQUE INDEX uq_repayment_reverses_once ON repayment(reverses_id) WHERE reverses_id IS NOT NULL;
CREATE UNIQUE INDEX uq_withdrawal_reverses_once ON withdrawal(reverses_id) WHERE reverses_id IS NOT NULL;
CREATE UNIQUE INDEX uq_expense_reverses_once ON expense(reverses_id) WHERE reverses_id IS NOT NULL;
CREATE UNIQUE INDEX uq_transfer_reverses_once ON transfer(reverses_id) WHERE reverses_id IS NOT NULL;
CREATE UNIQUE INDEX uq_collection_paid_out_expense_once ON extraordinary_collection(paid_out_expense_id)
  WHERE paid_out_expense_id IS NOT NULL;
CREATE UNIQUE INDEX uq_collection_surplus_transfer_once ON extraordinary_collection(surplus_transfer_id)
  WHERE surplus_transfer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_contribution_reversal_exact() RETURNS trigger AS $$
DECLARE original contribution%ROWTYPE;
BEGIN
  IF NEW.reverses_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO original FROM contribution WHERE id = NEW.reverses_id FOR KEY SHARE;
  IF NOT FOUND OR original.reverses_id IS NOT NULL OR NEW.org_id IS DISTINCT FROM original.org_id
    OR ABS(NEW.amount) IS DISTINCT FROM ABS(original.amount) OR NEW.currency_code IS DISTINCT FROM original.currency_code
    OR NEW.cycle_id IS DISTINCT FROM original.cycle_id OR NEW.member_id IS DISTINCT FROM original.member_id
    OR NEW.kind IS DISTINCT FROM original.kind OR NEW.payment_source IS DISTINCT FROM original.payment_source
    OR NEW.account_id IS DISTINCT FROM original.account_id
    OR NEW.reconciliation_status IS DISTINCT FROM original.reconciliation_status
    OR NEW.payment_receipt_id IS DISTINCT FROM original.payment_receipt_id
    OR NEW.dated_on < original.dated_on OR NEW.reverse_reason IS NULL OR length(btrim(NEW.reverse_reason)) < 3
  THEN RAISE EXCEPTION USING MESSAGE = 'contribution_reversal_mismatch', ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION validate_repayment_reversal_exact() RETURNS trigger AS $$
DECLARE original repayment%ROWTYPE;
BEGIN
  IF NEW.reverses_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO original FROM repayment WHERE id = NEW.reverses_id FOR KEY SHARE;
  IF NOT FOUND OR original.reverses_id IS NOT NULL OR NEW.org_id IS DISTINCT FROM original.org_id
    OR ABS(NEW.amount) IS DISTINCT FROM ABS(original.amount) OR NEW.currency_code IS DISTINCT FROM original.currency_code
    OR NEW.loan_id IS DISTINCT FROM original.loan_id OR NEW.member_id IS DISTINCT FROM original.member_id
    OR NEW.applied_to_principal IS DISTINCT FROM original.applied_to_principal
    OR NEW.applied_to_interest IS DISTINCT FROM original.applied_to_interest OR NEW.applied_to_fee IS DISTINCT FROM original.applied_to_fee
    OR NEW.account_id IS DISTINCT FROM original.account_id
    OR NEW.reconciliation_status IS DISTINCT FROM original.reconciliation_status
    OR NEW.payment_receipt_id IS DISTINCT FROM original.payment_receipt_id
    OR NEW.dated_on < original.dated_on OR NEW.reverse_reason IS NULL OR length(btrim(NEW.reverse_reason)) < 3
  THEN RAISE EXCEPTION USING MESSAGE = 'repayment_reversal_mismatch', ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION validate_withdrawal_reversal_exact() RETURNS trigger AS $$
DECLARE original withdrawal%ROWTYPE;
BEGIN
  IF NEW.reverses_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO original FROM withdrawal WHERE id = NEW.reverses_id FOR KEY SHARE;
  IF NOT FOUND OR original.reverses_id IS NOT NULL OR NEW.org_id IS DISTINCT FROM original.org_id
    OR ABS(NEW.amount) IS DISTINCT FROM ABS(original.amount) OR NEW.currency_code IS DISTINCT FROM original.currency_code
    OR NEW.member_id IS DISTINCT FROM original.member_id
    OR NOT (NEW.kind = original.kind OR (original.kind = 'year_end_share_out' AND NEW.kind = 'year_end_reversal'))
    OR NEW.share_out_id IS DISTINCT FROM original.share_out_id
    OR NEW.year_end_share_out_line_id IS DISTINCT FROM original.year_end_share_out_line_id
    OR NEW.dated_on < original.dated_on OR NEW.reverse_reason IS NULL OR length(btrim(NEW.reverse_reason)) < 3
  THEN RAISE EXCEPTION USING MESSAGE = 'withdrawal_reversal_mismatch', ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION validate_expense_reversal_exact() RETURNS trigger AS $$
DECLARE original expense%ROWTYPE;
BEGIN
  IF NEW.reverses_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO original FROM expense WHERE id = NEW.reverses_id FOR KEY SHARE;
  IF NOT FOUND OR original.reverses_id IS NOT NULL OR NEW.org_id IS DISTINCT FROM original.org_id
    OR ABS(NEW.amount) IS DISTINCT FROM ABS(original.amount) OR NEW.currency_code IS DISTINCT FROM original.currency_code
    OR NEW.account_id IS DISTINCT FROM original.account_id OR NEW.category IS DISTINCT FROM original.category
    OR NEW.status IS DISTINCT FROM original.status OR NEW.beneficiary_member_id IS DISTINCT FROM original.beneficiary_member_id
    OR NEW.beneficiary_text IS DISTINCT FROM original.beneficiary_text
    OR (CASE WHEN original.category = 'solidarity_payout'
      THEN NEW.purpose IS DISTINCT FROM 'reversal: pago solidario'
      ELSE NEW.purpose NOT IN (original.purpose, 'reversal: ' || original.purpose) END)
    OR NEW.incurred_on < original.incurred_on OR NEW.reverse_reason IS NULL OR length(btrim(NEW.reverse_reason)) < 3
  THEN RAISE EXCEPTION USING MESSAGE = 'expense_reversal_mismatch', ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION validate_transfer_reversal_exact() RETURNS trigger AS $$
DECLARE original transfer%ROWTYPE;
BEGIN
  IF NEW.reverses_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO original FROM transfer WHERE id = NEW.reverses_id FOR KEY SHARE;
  IF NOT FOUND OR original.reverses_id IS NOT NULL OR NEW.org_id IS DISTINCT FROM original.org_id
    OR NEW.from_account_id IS DISTINCT FROM original.to_account_id OR NEW.to_account_id IS DISTINCT FROM original.from_account_id
    OR NEW.amount IS DISTINCT FROM original.amount OR NEW.currency_code IS DISTINCT FROM original.currency_code
    OR NEW.purpose IS DISTINCT FROM (CASE
      WHEN original.purpose = 'regularization' THEN 'regularization_reversal'
      WHEN original.purpose = 'collection_surplus_return' THEN 'collection_surplus_return_reversal'
      ELSE 'transfer_reversal' END)
    OR NEW.regularizes_kind IS DISTINCT FROM original.regularizes_kind
    OR NEW.regularizes_id IS DISTINCT FROM original.regularizes_id OR NEW.dated_on < original.dated_on
  THEN RAISE EXCEPTION USING MESSAGE = 'transfer_reversal_mismatch', ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

DROP TRIGGER IF EXISTS contribution_reversal_integrity ON contribution;
CREATE TRIGGER contribution_reversal_integrity BEFORE INSERT ON contribution
  FOR EACH ROW EXECUTE FUNCTION validate_contribution_reversal_exact();
DROP TRIGGER IF EXISTS repayment_reversal_integrity ON repayment;
CREATE TRIGGER repayment_reversal_integrity BEFORE INSERT ON repayment
  FOR EACH ROW EXECUTE FUNCTION validate_repayment_reversal_exact();
DROP TRIGGER IF EXISTS withdrawal_reversal_integrity ON withdrawal;
CREATE TRIGGER withdrawal_reversal_integrity BEFORE INSERT ON withdrawal
  FOR EACH ROW EXECUTE FUNCTION validate_withdrawal_reversal_exact();
DROP TRIGGER IF EXISTS expense_reversal_integrity ON expense;
CREATE TRIGGER expense_reversal_integrity BEFORE INSERT ON expense
  FOR EACH ROW EXECUTE FUNCTION validate_expense_reversal_exact();
DROP TRIGGER IF EXISTS transfer_reversal_integrity ON transfer;
CREATE TRIGGER transfer_reversal_integrity BEFORE INSERT ON transfer
  FOR EACH ROW EXECUTE FUNCTION validate_transfer_reversal_exact();
