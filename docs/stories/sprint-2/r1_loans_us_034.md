# US-034: Treasurer originates a non-member loan with required guarantor picker

> **Sprint 2** | **P0** | **8 SP** | **R1** | FEAT-034

## User Story
As La Tesorera, I want to lend to a non-member who is backed by a member guarantor, so that the group can extend its reach with the risk capped by collateral.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-034 |
| Feature | FEAT-034 — Treasurer originates a non-member loan with required guarantor picker |
| Sprint | Sprint 2 |
| Priority | P0 |
| Size | 8 SP |
| Release | R1 |
| Domain | Tenant loans |
| Business Rules | BR-04, BR-05 |
| Backstage Process | — |
| Blocked By | US-008, US-017 |
## Acceptance Criteria
- [ ] AC-1: Selecting borrower kind `non_member` on `SCR-originate-loan` reveals a non-member borrower mini-form (display name, WhatsApp number, national-id redacted to last 4 digits, notes) plus a required member-guarantor picker (`molecule.guarantor-picker`) listing only members with `status = activo` who are within their loan-to-savings cap.
- [ ] AC-2 (BR-04): The per-period rate auto-switches to `GroupConfig.loan_rate_value_non_member` (the non-member band); a golden/property test asserts the non-member band is applied and never the member band.
- [ ] AC-3 (BR-05): The eligibility pre-flight (Layer 1) rejects any `non_member` origination that has no guarantor selected, writing nothing; an integration test proves the `Loan` row is reachable only after the `LoanGuarantor` row is set.
- [ ] AC-4: A cleared origination writes `NonMemberBorrower` + `Loan` (`borrower_kind='non_member'`, `borrower_non_member_id` set, `borrower_member_id` null — exactly one non-null enforced by CHECK) + `LoanGuarantor` (`guarantor_member_id`, `assumed_at`, `liability_amount` = `Loan.principal_amount` at creation), all in one transaction with the audit-log row.
- [ ] AC-5: A single member may guarantee multiple concurrent non-member loans subject to the same loan-to-savings cap as their own borrowing (OQ-BR5-2 R1 default); money columns are `decimal(18,4)`; writes are append-only (NFR-SEC-02/04).

## Technical Notes
- **Data model:** `NonMemberBorrower` (`id`, `org_id`, `display_name`, `whatsapp_number`, `national_id_redacted`, `notes`), `LoanGuarantor` (`loan_id`, `guarantor_member_id`, `assumed_at`, `released_at?`, `liability_amount`), `Loan` extended with `borrower_kind`, `borrower_non_member_id` + CHECK that exactly one borrower id is non-null. New migration per HR-25 timestamp-slug.
- **API / surface:** `SCR-originate-loan` (extended) Server Action → `OriginateLoan` (P3, extended). Components: `molecule.borrower-picker` (non-member variant), `molecule.guarantor-picker` (NEW), `NonMemberBorrower` sub-form.
- **Business-rule execution:** BR-05 guarantor requirement enforced at Layer 1 eligibility (reject without guarantor); BR-04 non-member rate band resolved from `GroupConfig` (Layers 1–2).
- **Multi-tenancy / audit:** all new rows org-scoped with RLS; audit-log row in the same transaction; national id stored redacted (tail-4 only) for PII minimization.

## Test Strategy
- Golden-file: eligibility rejected when guarantor missing.
- Integration: write reaches `Loan` only after `LoanGuarantor` is set; `NonMemberBorrower` + `Loan` + `LoanGuarantor` + audit committed atomically; non-member rate band applied.
- Unit: CHECK constraint rejects a `Loan` with both/neither borrower id; guarantor list excludes non-activo and over-cap members.

## Dependencies
- Blocked By: — (none declared). Prerequisites from scope: US-008 (loan substrate), US-017 (non-member rate + `GroupConfig` configured).
