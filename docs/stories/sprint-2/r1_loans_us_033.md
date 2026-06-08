# US-033: Treasurer originates a member loan declining-balance schedule auto-generated

> **Sprint 2** | **P0** | **8 SP** | **R1** | FEAT-033

## User Story
As La Tesorera, I want to originate a loan to a member with the full schedule computed automatically, so that I never compute interest or fees by hand and the resulting ledger matches the locked business rules.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-033 |
| Feature | FEAT-033 — Treasurer originates a member loan declining-balance schedule auto-generated |
| Sprint | Sprint 2 |
| Priority | P0 |
| Size | 8 SP |
| Release | R1 |
| Domain | Tenant loans |
| Business Rules | BR-01, BR-02, BR-04 |
| Backstage Process | — |
| Blocked By | US-008, US-014, US-017, US-026 |
## Acceptance Criteria
- [ ] AC-1: On `SCR-originate-loan` the borrower-kind selector defaults to `member`; the form captures member (via `molecule.borrower-picker`), principal amount (`molecule.currency-input`), term periods, and optional purpose; the per-period rate is read from the member band of `GroupConfig` (BR-04) and is not hand-entered.
- [ ] AC-2: An eligibility pre-flight (`EvaluateLoanEligibility`, P10) runs before any write — it checks pool capacity minus the protected base fund and the borrower's loan-to-savings cap; if it fails, the Server Action writes nothing and renders an explanatory message in es-EC; if it clears, origination proceeds.
- [ ] AC-3 (BR-01): A cleared origination generates `LoanSchedule` rows by the declining-balance method — `principal_due[p] = principal / term_periods` (constant), `interest_due[p] = remaining_principal_before[p] × rate_per_period`; a golden-file test reproduces `BR-01__1000_4pct_10mo_with_admin_fee.json` bit-for-bit and a property test asserts `interest_due` is monotonically non-increasing.
- [ ] AC-4 (BR-03): A single `LoanFee` row (admin fee = `GroupConfig.admin_fee_pct × principal`, default 1 %) is written against installment #1 only; no admin fee appears on any later installment.
- [ ] AC-5: The `Loan` row stamps `group_config_version_at_origination` so the schedule is reproducible against the config in force at origination; on success the treasurer is redirected to `SCR-loan-detail`.
- [ ] AC-6: All money columns are `decimal(18,4)`; ledger writes are append-only and the audit-log row is written in the same transaction as the `Loan`/`LoanSchedule`/`LoanFee` writes (NFR-SEC-02/04).

## Technical Notes
- **Data model:** `Loan` (`principal_amount`, `term_periods`, `rate_value`, `borrower_kind='member'`, `borrower_member_id`, `group_config_version_at_origination`, `status`), `LoanSchedule[]` (per-period principal/interest/fee/total), `LoanFee` (admin fee on installment 1). All decimals `decimal(18,4)`. New migration per HR-25 timestamp-slug if columns are added.
- **API / surface:** `SCR-originate-loan` Server Action → `OriginateLoan` (P3) + `GenerateLoanSchedule` (P4); redirect to `SCR-loan-detail`. Components: `molecule.borrower-picker`, `molecule.currency-input`, `molecule.fee-row`, `organism.schedule-table`.
- **Business-rule execution:** BR-01 declining-balance in `packages/domain/rules/loans/declining-balance.ts` (Layer 2); BR-03 admin fee emitted with `LoanSchedule[1]` (Layer 2); BR-04 member rate band resolved from `GroupConfig` (Layers 1–2); eligibility (P10) at Layer 1.
- **Multi-tenancy / audit:** all rows org-scoped (`org_id`) with RLS; audit-log row in the same transaction; `group_config_version_at_origination` pins the config snapshot for reproducibility.

## Test Strategy
- Golden-file: `BR-01__1000_4pct_10mo_with_admin_fee.json` matched bit-for-bit (10 rows + totals 1000/220/10/1230).
- Property: `interest_due[p]` monotonically non-increasing; `principal_due` constant; sum of principal portions equals principal.
- Integration: cleared origination persists `Loan` + `LoanSchedule[]` + one `LoanFee` + audit in one transaction; failed eligibility writes nothing and renders es-EC copy; wrong role → 403.

## Dependencies
- Blocked By: — (none declared). Prerequisites from scope: US-008 (loan substrate), US-014 (BR-01 + BR-03 golden files passing), US-017 (rates configured in `GroupConfig`), US-026.
