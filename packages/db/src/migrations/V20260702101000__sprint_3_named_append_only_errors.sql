CREATE OR REPLACE FUNCTION raise_append_only_violation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'append_only_violation',
    DETAIL = TG_TABLE_NAME || ' rejects ' || TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contribution_no_mutate ON contribution;
DROP TRIGGER IF EXISTS withdrawal_no_mutate ON withdrawal;
DROP TRIGGER IF EXISTS expense_no_mutate ON expense;
DROP TRIGGER IF EXISTS repayment_no_mutate ON repayment;
DROP TRIGGER IF EXISTS interest_accrual_no_mutate ON interest_accrual;

CREATE TRIGGER contribution_no_mutate BEFORE UPDATE OR DELETE ON contribution
  FOR EACH ROW EXECUTE FUNCTION raise_append_only_violation();
CREATE TRIGGER withdrawal_no_mutate BEFORE UPDATE OR DELETE ON withdrawal
  FOR EACH ROW EXECUTE FUNCTION raise_append_only_violation();
CREATE TRIGGER expense_no_mutate BEFORE UPDATE OR DELETE ON expense
  FOR EACH ROW EXECUTE FUNCTION raise_append_only_violation();
CREATE TRIGGER repayment_no_mutate BEFORE UPDATE OR DELETE ON repayment
  FOR EACH ROW EXECUTE FUNCTION raise_append_only_violation();
CREATE TRIGGER interest_accrual_no_mutate BEFORE UPDATE OR DELETE ON interest_accrual
  FOR EACH ROW EXECUTE FUNCTION raise_append_only_violation();
