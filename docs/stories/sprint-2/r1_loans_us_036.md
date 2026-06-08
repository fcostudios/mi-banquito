# US-036: Treasurer records a loan repayment with auto split interest first

> **Sprint 2** | **P0** | **5 SP** | **R1** | FEAT-036

## User Story
As La Tesorera, I want to record a loan payment in a few taps and have the system split it into interest and principal for me, so that I never do interest-vs-principal math by hand.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-036 |
| Feature | FEAT-036 — Treasurer records a loan repayment with auto split interest first |
| Sprint | Sprint 2 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Tenant loans |
| Business Rules | BR-01, BR-03 |
| Backstage Process | — |
| Blocked By | US-008, US-014, US-033 |
## Acceptance Criteria
- [ ] AC-1: On `SCR-record-repayment` the member picker auto-filters to members with open loans; the loan picker auto-fills when the member has exactly one open loan; the form captures amount (`molecule.currency-input`), date defaulting to today, optional slip photo (`molecule.slip-uploader`), and optional notes.
- [ ] AC-2: The Server Action computes the split with the `interest_first` rule (default per the BR-06 split rule) against the loan's current accrued-interest and outstanding-principal state, writing a `Repayment` row with `applied_to_interest` and `applied_to_principal` (both `decimal(18,4)`); the sum of the two equals the recorded amount.
- [ ] AC-3: A ledger leg is written for the repayment in the same transaction as the `Repayment` row and the audit-log row; ledger is append-only (NFR-SEC-02/04).
- [ ] AC-4: When the repayment brings the loan to fully paid, `Loan.status` transitions to `pagado`, which fires the referral-commission flow (US-039 / FEAT-039) for any attached `LoanReferral`.
- [ ] AC-5: On success the screen shows inline success copy with the split breakdown (interest vs principal vs remaining balance) in es-EC.

## Technical Notes
- **Data model:** `Repayment` (`loan_id`, `amount decimal(18,4)`, `applied_to_interest decimal(18,4)`, `applied_to_principal decimal(18,4)`, `dated_on`, `slip_photo_id?`, `notes?`); reads `LoanSchedule[]` + prior `Repayment[]` + `InterestAccrual[]` to determine current split state; ledger leg row. New migration per HR-25 timestamp-slug if columns added.
- **API / surface:** `SCR-record-repayment` Server Action → `ApplyRepayment` (P6). Components: `molecule.currency-input`, `molecule.slip-uploader`.
- **Business-rule execution:** interest-first split (BR-06 split rule) computed at Layer 2/3 from accrued interest before principal; the schedule the split runs against was produced under BR-01/BR-03 (the Meta-cited rules). Payoff transition fires `AccrueReferralCommissionOnPayoff` (US-039).
- **Multi-tenancy / audit:** org-scoped with RLS; `Repayment` + ledger leg + audit in one transaction; idempotency guarded so a double-submit does not double-post.

## Test Strategy
- Unit: interest_first split — payment ≤ accrued interest applies wholly to interest; surplus spills to principal; sums reconcile.
- Integration: repayment persists with split + ledger leg + audit atomically; final repayment flips `Loan.status` to `pagado` and triggers the referral flow exactly once.
- Property: across a full payment sequence, total `applied_to_interest` + `applied_to_principal` equals total paid and never exceeds amount owed.

## Dependencies
- Blocked By: — (none declared). Prerequisites from scope: US-008 (loan substrate), US-014 (schedule math), US-033 or US-034 (an originated loan to repay).
