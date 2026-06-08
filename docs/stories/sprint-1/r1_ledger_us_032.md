# US-032: Treasurer records the annual base fund quota payment for a member

> **Sprint 1** | **P0** | **3 SP** | **R1** | FEAT-032

## User Story

As a treasurer, I want to capture the annual base-fund cuota separately from regular aportes, so that the base-fund pool is correctly built and "available capital" is correctly derived.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-032 |
| Feature | FEAT-032 — Treasurer records the annual base fund quota payment for a member |
| Sprint | Sprint 1 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant ledger |
| Business Rules | BR-08 |
| Backstage Process | — |
| Blocked By | US-008, US-017, US-026 |
## Acceptance Criteria

- [ ] AC-1: `SCR-record-base-fund-quota` (NEW, per OQ-BR8-1 option (a)) presents a member picker, an amount field defaulting to `BaseFundQuotaConfig.per_member_amount` for the current fiscal year, a date defaulting to today, and an optional slip photo.
- [ ] AC-2: On submit a `BaseFundQuotaPayment` row is written for the member and current fiscal year; refreshes `mv_base_fund_pool_per_fiscal_year` and `mv_available_capital`; the write is audit-logged.
- [ ] AC-3 (BR-08): the payment is recorded as a base-fund quota — **distinct from a regular `aporte`** — so it does NOT join the savings base or earn time-weighted interest (OQ-BR9-1); `available_capital = current_pool_balance − base_fund_pool(active_fiscal_year)`.
- [ ] AC-4 (BR-08): once-per-member-per-fiscal-year is enforced via the `BaseFundQuotaPayment` UNIQUE(`org_id`, `member_id`, `fiscal_year`) constraint; a second attempt for the same year is rejected.
- [ ] AC-5: the flow requires a `BaseFundQuotaConfig` for the current fiscal year to exist (set in US-017); org-scoped under RLS.

## Technical Notes
- **Data model:** inserts `BaseFundQuotaPayment` (`org_id`, `member_id`, `fiscal_year`, `amount decimal(18,4)`, `paid_on`, optional slip, `paid_via_contribution_id?` NULL for direct payments) with UNIQUE(`org_id`, `member_id`, `fiscal_year`). Reads `BaseFundQuotaConfig.per_member_amount` (HR-1 versioned). Writes `AuditLogEntry`. No `Vxxx` migration introduced.
- **API / surface:** Server Action behind the NEW `SCR-record-base-fund-quota`; components `molecule.member-picker`, `molecule.currency-input`, `molecule.slip-uploader`. Process `P24 CollectBaseFundQuota` (SYS_Ledger).
- **Business-rule execution:** enforces **BR-08** at Layer 1 (UNIQUE once-per-member-per-year) + Layer 3 (the quota feeds `base_fund_pool`; `EvaluateLoanEligibility` uses *available capital* = pool − base fund). The fiscal year is computed per BR-10's fiscal-year config.
- **Multi-tenancy / audit:** org-scoped under RLS; quota separate from savings (untouchable for lending); audit-logged; refreshes the base-fund pool + available-capital materialized views on commit.

## Test Strategy
- Golden file: base-fund pool computation across a year-over-year quota variation; `available_capital = pool − base_fund` after a quota payment.
- Property: every active member has either a `BaseFundQuotaPayment` for the current fiscal year or is flagged past-due on quota; a quota payment never enters the time-weighted savings base (OQ-BR9-1).
- Integration: a duplicate (`member`, `fiscal_year`) submit is rejected by the UNIQUE constraint; a successful submit refreshes `mv_base_fund_pool_per_fiscal_year` + `mv_available_capital` and writes one `AuditLogEntry`.

## Dependencies
- US-017 — a `BaseFundQuotaConfig` for the current fiscal year (set by the operator) must exist to default the amount and bind the payment.
- US-026 — the member paying the quota must already exist in the ledger.
- US-008 — the contribution/cycle ledger foundation the quota pool is derived alongside must be in place.
