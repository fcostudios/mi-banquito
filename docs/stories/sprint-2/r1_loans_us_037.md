# US-037: Treasurer views loan detail with schedule fees repayments accruals referrer guarantor

> **Sprint 2** | **P0** | **5 SP** | **R1** | FEAT-037

## User Story
As La Tesorera, I want to see the full story of a loan in one place, so that I can answer any question about its state, schedule, payments, and parties.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-037 |
| Feature | FEAT-037 — Treasurer views loan detail with schedule fees repayments accruals referrer guarantor |
| Sprint | Sprint 2 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Tenant loans |
| Business Rules | BR-01, BR-03 |
| Backstage Process | — |
| Blocked By | US-033, US-036 |
## Acceptance Criteria
- [ ] AC-1: `SCR-loan-detail` renders a **Resumen** tab showing principal, rate, term, status, member, borrower kind, the guarantor when `borrower_kind = non_member`, and the referrer when one is set.
- [ ] AC-2: A **Cronograma** tab renders the `LoanSchedule[]` rows with paid-to-date per row and the admin fee shown on row 1 (BR-03), matching the declining-balance figures generated under BR-01.
- [ ] AC-3: A **Pagos** tab lists every `Repayment` with its interest/principal split; a **Historial** tab lists `InterestAccrual` entries plus any reversal entries.
- [ ] AC-4: An **Acciones** tab offers "record repayment" and "hacer reversión" (the latter only when a reversible entry exists); actions are role-gated to the treasurer.
- [ ] AC-5: This is a read/compose view — it performs no destructive writes; all monetary figures display at `decimal(18,4)` precision and reconcile with the underlying ledger.

## Technical Notes
- **Data model (read):** `Loan` + `LoanSchedule[]` + `Repayment[]` + `InterestAccrual[]` + `LoanFee[]` + `LoanReferral` + `LoanGuarantor` (see `04_er_model.md`). No new tables; read-only joins org-scoped.
- **API / surface:** `SCR-loan-detail` (extended with the five tabs). Component: extended `organism.loan-card`.
- **Business-rule execution:** display-only surfacing of BR-01 schedule rows and the BR-03 admin fee on installment 1; no rule is evaluated here — figures are read from rows already produced by US-033/US-034/US-036/US-038.
- **Multi-tenancy / audit:** org-scoped reads with RLS; the loan must belong to the operator's org; no audit row is written for a view (reads are not mutations).

## Test Strategy
- Integration: each tab renders the correct projection for a member loan and for a non-member loan (guarantor visible only for non-member; referrer visible only when set).
- Unit: paid-to-date per schedule row equals the sum of repayment principal applied to that period; "hacer reversión" affordance appears only when a reversible entry exists.
- Access: a user from another org receives 403 / not-found for the loan id.

## Dependencies
- Blocked By: — (none declared). Prerequisites from scope: US-033 (an originated loan with schedule), US-036 (repayments to display).
