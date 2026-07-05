CREATE UNIQUE INDEX IF NOT EXISTS uq_statement_archive_monthly_close_period
  ON statement_archive(org_id, period_close_id, kind)
  WHERE kind = 'monthly_close'
    AND period_close_id IS NOT NULL;

DROP TRIGGER IF EXISTS contribution_period_lock ON contribution;
DROP TRIGGER IF EXISTS withdrawal_period_lock ON withdrawal;
DROP TRIGGER IF EXISTS expense_period_lock ON expense;
DROP TRIGGER IF EXISTS repayment_period_lock ON repayment;
DROP TRIGGER IF EXISTS interest_accrual_period_lock ON interest_accrual;

CREATE TRIGGER contribution_period_lock BEFORE INSERT OR UPDATE ON contribution
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER withdrawal_period_lock BEFORE INSERT OR UPDATE ON withdrawal
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER expense_period_lock BEFORE INSERT OR UPDATE ON expense
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER repayment_period_lock BEFORE INSERT OR UPDATE ON repayment
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER interest_accrual_period_lock BEFORE INSERT OR UPDATE ON interest_accrual
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
