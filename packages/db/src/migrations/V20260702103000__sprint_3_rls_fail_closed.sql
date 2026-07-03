ALTER TABLE account ENABLE ROW LEVEL SECURITY;
ALTER TABLE account FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_tenant_isolation ON account;
CREATE POLICY account_tenant_isolation ON account
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE alert ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_tenant_isolation ON alert;
CREATE POLICY alert_tenant_isolation ON alert
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE alert_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_action FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_action_tenant_isolation ON alert_action;
CREATE POLICY alert_action_tenant_isolation ON alert_action
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE audit_log_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log_entry FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_entry_tenant_isolation ON audit_log_entry;
CREATE POLICY audit_log_entry_tenant_isolation ON audit_log_entry
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE base_fund_quota_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_fund_quota_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS base_fund_quota_config_tenant_isolation ON base_fund_quota_config;
CREATE POLICY base_fund_quota_config_tenant_isolation ON base_fund_quota_config
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE base_fund_quota_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_fund_quota_payment FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS base_fund_quota_payment_tenant_isolation ON base_fund_quota_payment;
CREATE POLICY base_fund_quota_payment_tenant_isolation ON base_fund_quota_payment
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE contribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contribution_tenant_isolation ON contribution;
CREATE POLICY contribution_tenant_isolation ON contribution
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE contribution_cycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_cycle FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contribution_cycle_tenant_isolation ON contribution_cycle;
CREATE POLICY contribution_cycle_tenant_isolation ON contribution_cycle
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE entity_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_version FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entity_version_tenant_isolation ON entity_version;
CREATE POLICY entity_version_tenant_isolation ON entity_version
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE expense ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_tenant_isolation ON expense;
CREATE POLICY expense_tenant_isolation ON expense
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE extraordinary_collection ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraordinary_collection FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS extraordinary_collection_tenant_isolation ON extraordinary_collection;
CREATE POLICY extraordinary_collection_tenant_isolation ON extraordinary_collection
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE extraordinary_collection_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraordinary_collection_line FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS extraordinary_collection_line_tenant_isolation ON extraordinary_collection_line;
CREATE POLICY extraordinary_collection_line_tenant_isolation ON extraordinary_collection_line
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE group_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS group_config_tenant_isolation ON group_config;
CREATE POLICY group_config_tenant_isolation ON group_config
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE impersonation ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS impersonation_tenant_isolation ON impersonation;
CREATE POLICY impersonation_tenant_isolation ON impersonation
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE interest_accrual ENABLE ROW LEVEL SECURITY;
ALTER TABLE interest_accrual FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS interest_accrual_tenant_isolation ON interest_accrual;
CREATE POLICY interest_accrual_tenant_isolation ON interest_accrual
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE loan ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_tenant_isolation ON loan;
CREATE POLICY loan_tenant_isolation ON loan
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE loan_fee ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_fee FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_fee_tenant_isolation ON loan_fee;
CREATE POLICY loan_fee_tenant_isolation ON loan_fee
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE loan_guarantor ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_guarantor FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_guarantor_tenant_isolation ON loan_guarantor;
CREATE POLICY loan_guarantor_tenant_isolation ON loan_guarantor
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE loan_referral ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_referral FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_referral_tenant_isolation ON loan_referral;
CREATE POLICY loan_referral_tenant_isolation ON loan_referral
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE loan_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_schedule FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_schedule_tenant_isolation ON loan_schedule;
CREATE POLICY loan_schedule_tenant_isolation ON loan_schedule
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE member ENABLE ROW LEVEL SECURITY;
ALTER TABLE member FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_tenant_isolation ON member;
CREATE POLICY member_tenant_isolation ON member
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE non_member_borrower ENABLE ROW LEVEL SECURITY;
ALTER TABLE non_member_borrower FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS non_member_borrower_tenant_isolation ON non_member_borrower;
CREATE POLICY non_member_borrower_tenant_isolation ON non_member_borrower
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE period_close ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_close FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS period_close_tenant_isolation ON period_close;
CREATE POLICY period_close_tenant_isolation ON period_close
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE reconciliation_cycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_cycle FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reconciliation_cycle_tenant_isolation ON reconciliation_cycle;
CREATE POLICY reconciliation_cycle_tenant_isolation ON reconciliation_cycle
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE repayment ENABLE ROW LEVEL SECURITY;
ALTER TABLE repayment FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS repayment_tenant_isolation ON repayment;
CREATE POLICY repayment_tenant_isolation ON repayment
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE slip_photo ENABLE ROW LEVEL SECURITY;
ALTER TABLE slip_photo FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS slip_photo_tenant_isolation ON slip_photo;
CREATE POLICY slip_photo_tenant_isolation ON slip_photo
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE statement_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_archive FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS statement_archive_tenant_isolation ON statement_archive;
CREATE POLICY statement_archive_tenant_isolation ON statement_archive
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE surplus_governance_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE surplus_governance_decision FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS surplus_governance_decision_tenant_isolation ON surplus_governance_decision;
CREATE POLICY surplus_governance_decision_tenant_isolation ON surplus_governance_decision
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE transfer ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transfer_tenant_isolation ON transfer;
CREATE POLICY transfer_tenant_isolation ON transfer
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE user_org_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_org_membership FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_org_membership_tenant_isolation ON user_org_membership;
CREATE POLICY user_org_membership_tenant_isolation ON user_org_membership
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE withdrawal ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS withdrawal_tenant_isolation ON withdrawal;
CREATE POLICY withdrawal_tenant_isolation ON withdrawal
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE year_end_balance_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_end_balance_snapshot FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS year_end_balance_snapshot_tenant_isolation ON year_end_balance_snapshot;
CREATE POLICY year_end_balance_snapshot_tenant_isolation ON year_end_balance_snapshot
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE year_end_balance_snapshot_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_end_balance_snapshot_line FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS year_end_balance_snapshot_line_tenant_isolation ON year_end_balance_snapshot_line;
CREATE POLICY year_end_balance_snapshot_line_tenant_isolation ON year_end_balance_snapshot_line
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE year_end_share_out ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_end_share_out FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS year_end_share_out_tenant_isolation ON year_end_share_out;
CREATE POLICY year_end_share_out_tenant_isolation ON year_end_share_out
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE year_end_share_out_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_end_share_out_line FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS year_end_share_out_line_tenant_isolation ON year_end_share_out_line;
CREATE POLICY year_end_share_out_line_tenant_isolation ON year_end_share_out_line
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
