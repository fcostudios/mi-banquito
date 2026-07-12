DROP TRIGGER IF EXISTS aa_tenant_money_lock ON contribution;
CREATE TRIGGER aa_tenant_money_lock
  BEFORE INSERT OR UPDATE OR DELETE ON contribution
  FOR EACH ROW EXECUTE FUNCTION lock_tenant_money_write();

DROP TRIGGER IF EXISTS aa_tenant_money_lock ON repayment;
CREATE TRIGGER aa_tenant_money_lock
  BEFORE INSERT OR UPDATE OR DELETE ON repayment
  FOR EACH ROW EXECUTE FUNCTION lock_tenant_money_write();

DROP TRIGGER IF EXISTS aa_tenant_money_lock ON expense;
CREATE TRIGGER aa_tenant_money_lock
  BEFORE INSERT OR UPDATE OR DELETE ON expense
  FOR EACH ROW EXECUTE FUNCTION lock_tenant_money_write();

DROP TRIGGER IF EXISTS aa_tenant_money_lock ON transfer;
CREATE TRIGGER aa_tenant_money_lock
  BEFORE INSERT OR UPDATE OR DELETE ON transfer
  FOR EACH ROW EXECUTE FUNCTION lock_tenant_money_write();

DROP TRIGGER IF EXISTS aa_tenant_money_lock ON withdrawal;
CREATE TRIGGER aa_tenant_money_lock
  BEFORE INSERT OR UPDATE OR DELETE ON withdrawal
  FOR EACH ROW EXECUTE FUNCTION lock_tenant_money_write();

DROP TRIGGER IF EXISTS aa_tenant_money_lock ON loan_disbursement;
CREATE TRIGGER aa_tenant_money_lock
  BEFORE INSERT OR UPDATE OR DELETE ON loan_disbursement
  FOR EACH ROW EXECUTE FUNCTION lock_tenant_money_write();
