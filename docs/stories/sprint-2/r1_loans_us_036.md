# US-036: Treasurer records a loan repayment with an understandable split

> **Sprint 2** | **P0** | **5 SP** | **R1** | FEAT-036

## User Story
As La Tesorera, I want to record a loan payment in a few taps and have the system apply it to the right cuota for me, so that I never do fee-vs-interest-vs-principal math by hand.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-036 |
| Feature | FEAT-036 — Treasurer records a loan repayment with quota-aware split |
| Sprint | Sprint 2 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Tenant loans |
| Business Rules | BR-01, BR-03 |
| Backstage Process | — |
| Blocked By | US-008, US-014, US-033 |
## Acceptance Criteria
- [x] AC-1: On `SCR-record-repayment` the member picker auto-filters to members with open loans; the loan picker auto-fills when the member has exactly one open loan; the form captures amount (`molecule.currency-input`), date defaulting to today, optional slip photo (`molecule.slip-uploader`), and optional notes.
- [x] AC-2: The Server Action defaults to `Pagar próxima cuota`, applying the payment to scheduled fee, interest, and principal in cuota order. It also exposes `Abonar a capital` for the older principal-forward behavior. The persisted `Repayment` row records `applied_to_fee`, `applied_to_interest`, and `applied_to_principal` (`decimal(18,4)`), and the net split equals the recorded amount.
- [x] AC-3: Repayment rows are append-only and audit-backed. Corrections use compensating repayment rows rather than mutating the original `Repayment` row.
- [x] AC-4: When the repayment brings the loan to fully paid, `Loan.status` transitions to `pagado`, which fires the referral-commission flow (US-039 / FEAT-039) for any attached `LoanReferral`.
- [x] AC-5: On success and on loan detail, the screen shows plain-Spanish split copy with fee, interest, principal, and remaining balance in es-EC formatting.

## Technical Notes
- **Data model:** `Repayment` (`loan_id`, `amount decimal(18,4)`, `applied_to_fee decimal(18,4)`, `applied_to_interest decimal(18,4)`, `applied_to_principal decimal(18,4)`, `dated_on`, `slip_photo_id?`, `notes?`); reads `LoanSchedule[]` + `LoanFee[]` + prior `Repayment[]` + `InterestAccrual[]` to determine current split state. `applied_to_fee` was added in `V20260702083000__repayment_fee_split.sql` so reports can separate collected principal, interest, and fees.
- **API / surface:** `SCR-record-repayment` Server Action → `ApplyRepayment` (P6). Components: `molecule.currency-input`, `molecule.slip-uploader`.
- **Business-rule execution:** default cuota-aware split pays the next scheduled admin fee, interest, then principal so early payments close the next cuota instead of creating confusing partial principal across future rows. `Abonar a capital` remains available for intentional principal-only reduction. Payoff transition fires `AccrueReferralCommissionOnPayoff` (US-039).
- **Multi-tenancy / audit:** org-scoped with RLS; `Repayment` + ledger leg + audit in one transaction; idempotency guarded so a double-submit does not double-post.

## Test Strategy
- Unit: next-cuota split — an early `$16.00` payment closes cuota 1 as `$1.00` fee, `$5.00` interest, and `$10.00` principal; principal-payment mode remains covered by the interest/principal split tests.
- Integration: repayment persists fee/interest/principal split + audit atomically; final repayment flips `Loan.status` to `pagado` and triggers the referral flow exactly once.
- Property: across a full payment sequence, total `applied_to_fee` + `applied_to_interest` + `applied_to_principal` equals net paid and never exceeds amount owed.

## Dependencies
- Blocked By: — (none declared). Prerequisites from scope: US-008 (loan substrate), US-014 (schedule math), US-033 or US-034 (an originated loan to repay).
