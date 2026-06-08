# US-076: Treasurer declares loan disbursement source (bank vs cash) at origination

> **Sprint 4** | **P0** | **5 SP** | **R1** | REVIEW_F7

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-076 |
| Feature | REVIEW_F7 — Treasurer declares loan disbursement source (bank vs cash) at origination |
| Sprint | Sprint 4 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## User Story
As a treasurer, I want to declare how I handed the loan to the borrower (bank transfer vs petty cash) at origination, so that the pool and petty-cash balances match reality.

## Acceptance Criteria
- [ ] AC-1: SCR-originate-loan gains a `disbursement_source` field with values `bank_transfer` (default) and `petty_cash`.
- [ ] AC-2: On loan origination the system writes a virtual `LoanDisbursement` event tying the loan to the chosen source — `(loan_id, source, amount, disbursed_on)`.
- [ ] AC-3: The declared source drives the correct ledger movement: a `bank_transfer` disbursement reduces the bank/pool balance lane, a `petty_cash` disbursement reduces the petty-cash lane, so the two pools stay consistent (composes with BR-12 multi-account regularization).
- [ ] AC-4: The reconciliation flow consumes `LoanDisbursement` to verify against bank-app data (the source declared at origination is the expected counterpart of the bank movement).
- [ ] AC-5: `disbursement_source` is required at origination (no null); the event is org-scoped, append-only, and audited (BR-16).

## Technical Notes
- **Data model:** add `disbursement_source` to the loan origination payload; introduce a `LoanDisbursement` event/record `(id, org_id, loan_id, source ∈ {bank_transfer, petty_cash}, amount, disbursed_on)`. Add via HR-25 timestamp-slug migration (`slug=loan_disbursement`).
- **API / surface:** extend the origination server action + SCR-originate-loan form with the `disbursement_source` field (default `bank_transfer`). Reconciliation flow reads `LoanDisbursement`.
- **Business-rule execution:** no new locked BR; composes with BR-12 (multi-account regularization) and BR-13 (movement categorization) so the disbursement lands in the right account pool. Addresses review finding F7.
- **Multi-tenancy / audit:** `org_id`-scoped; the `LoanDisbursement` event is append-only and audited per BR-16 (trust spine).

## Test Strategy
- Unit: field default = `bank_transfer`; required-field validation; event payload shape.
- Integration: originating a `petty_cash` loan reduces petty cash and not the bank lane (and vice versa); the reconciliation flow matches the declared source to bank-app data.
- Golden-file: a fixture of mixed-source originations produces consistent per-pool balances.

## Dependencies
- Blocked By: — (no story-level blocker declared). Functional prerequisites per scope: US-033 (loan origination flow) and US-074 (the review-pass foundation this extends).
