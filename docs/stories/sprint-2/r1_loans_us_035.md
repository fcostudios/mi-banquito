# US-035: Treasurer optionally designates a referrer member on origination

> **Sprint 2** | **P0** | **5 SP** | **R1** | FEAT-035

## User Story
As La Tesorera, I want to record who referred the borrower at origination, so that the referral commission is credited to that member when the loan is fully paid.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-035 |
| Feature | FEAT-035 — Treasurer optionally designates a referrer member on origination |
| Sprint | Sprint 2 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Tenant loans |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-017, US-033, US-034 |
## Acceptance Criteria
- [ ] AC-1: `SCR-originate-loan` exposes an optional `molecule.referrer-picker` listing only members with `status = activo`; leaving it unset is valid and starts no commission flow.
- [ ] AC-2 (BR-06): When a referrer is set, origination records `Loan.referrer_member_id` and creates one `LoanReferral` row whose `commission_amount` is stamped from `GroupConfig.referral_commission_amount` at origination time (so a later config change does not alter this loan's commission).
- [ ] AC-3 (BR-06): `LoanReferral.commission_currency` is denormalized from the org currency at stamp time; `accrued_at` and `withdrawal_id` are left null at origination (the credit fires later, on payoff, in US-039).
- [ ] AC-4: The referrer-picker rejects a non-`activo` member; the treasurer may be selected as referrer (OQ-BR6-1 R1 default: yes); `commission_amount` is `decimal(18,4)`.
- [ ] AC-5: `LoanReferral` writes occur in the same transaction as the `Loan` write, with an audit-log row; ledger remains append-only (NFR-SEC-02/04).

## Technical Notes
- **Data model:** `LoanReferral` (`loan_id`, `referrer_member_id`, `commission_amount decimal(18,4)`, `commission_currency`, `accrued_at?`, `withdrawal_id?`); `Loan.referrer_member_id` (nullable). New migration per HR-25 timestamp-slug.
- **API / surface:** `SCR-originate-loan` Server Action (origination side). Component: `molecule.referrer-picker` (NEW).
- **Business-rule execution:** BR-06 origination side — Layer 1 records `referrer_member_id` (referrer must be `activo`); the stamped `commission_amount` is captured from `GroupConfig.referral_commission_amount`. The payoff-side credit is out of scope here (US-039).
- **Multi-tenancy / audit:** rows org-scoped with RLS; stamping `commission_amount`/`commission_currency` at origination pins the value against config drift; audit row in the same transaction.

## Test Strategy
- Integration: referrer set → exactly one `LoanReferral` with stamped amount and null `accrued_at`/`withdrawal_id`; referrer unset → no `LoanReferral` row.
- Unit: referrer-picker excludes non-activo members; a later change to `GroupConfig.referral_commission_amount` does not change an already-stamped `LoanReferral`.

## Dependencies
- Blocked By: — (none declared). Prerequisites from scope: US-017 (`GroupConfig.referral_commission_amount` set), US-033 or US-034 (a loan to attach the referral to).
