# US-039: System fires referral commission credit on Loan status pagado

> **Sprint 2** | **P0** | **5 SP** | **R1** | FEAT-039

## User Story
As the System (BR-06), I want to credit the referrer when a loan reaches fully-paid status, so that BR-06 referral commissions are honored deterministically and exactly once.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-039 |
| Feature | FEAT-039 — System fires referral commission credit on Loan status pagado |
| Sprint | Sprint 2 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Backstage loans |
| Business Rules | BR-06 |
| Backstage Process | — |
| Blocked By | US-035, US-036 |
## Acceptance Criteria
- [ ] AC-1 (BR-06): A post-commit hook on a `Loan.status` transition to `pagado` checks for a set `referrer_member_id` with `LoanReferral.accrued_at IS NULL`; only then does it credit the referrer.
- [ ] AC-2 (BR-06): The credit INSERTs one `Withdrawal` row with `kind = 'referral_commission_credit'`, `member_id = referrer_member_id`, `amount = LoanReferral.commission_amount` (the value stamped at origination, `decimal(18,4)`), then sets `LoanReferral.accrued_at = now()` and `LoanReferral.withdrawal_id` to the new row.
- [ ] AC-3 (idempotency): The `accrued_at IS NULL` guard makes the credit fire exactly once — a re-run, a second payoff event, or a replay creates no second `Withdrawal`; a golden file asserts exactly one `referral_commission_credit` row on payoff.
- [ ] AC-4 (BR-06): A loan that reaches `cancelado` (or any non-`pagado` terminal state) produces no commission row; a partial repayment never triggers the credit.
- [ ] AC-5: The hook writes an audit-log entry and emits an informational (low-severity) alert: "Préstamo de {borrower} pagado — comisión de {currency} {amount} acreditada a {referrer}"; the `Withdrawal` write + `LoanReferral` update + audit row commit in one transaction (NFR-SEC-02/04, append-only).

## Technical Notes
- **Data model:** `Withdrawal` (`kind='referral_commission_credit'`, `member_id`, `amount decimal(18,4)`, `recorded_at`); `LoanReferral.accrued_at`, `LoanReferral.withdrawal_id` set on credit. No new table (modelled as a `Withdrawal` per BR-06 naming note); migration per HR-25 only if columns are added.
- **API / surface:** no screen — a post-commit hook on the `Loan.status → pagado` transition (fired from `ApplyRepayment`, US-036). Process `AccrueReferralCommissionOnPayoff` (P22).
- **Business-rule execution:** BR-06 at Layer 3; commission amount/currency are read from the already-stamped `LoanReferral` (set in US-035), not re-resolved from current `GroupConfig`; the `accrued_at IS NULL` predicate is the idempotency key.
- **Multi-tenancy / audit:** org-scoped write with RLS; audit-log row + informational alert in the same transaction as the `Withdrawal` and `LoanReferral` update.

## Test Strategy
- Golden-file: loan reaches payoff → exactly one `Withdrawal` of `kind='referral_commission_credit'` with the stamped amount; loan canceled before payoff → no commission row.
- Unit: `accrued_at IS NULL` guard blocks a second credit on a repeated payoff event.
- Integration: payoff via final repayment fires the credit, sets `accrued_at`/`withdrawal_id`, writes audit, and emits the es-EC alert atomically.

## Dependencies
- Blocked By: — (none declared). Prerequisites from scope: US-035 (referrer + `LoanReferral` stamped at origination), US-036 (repayment that drives the loan to `pagado`).
