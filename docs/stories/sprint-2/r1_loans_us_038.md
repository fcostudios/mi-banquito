# US-038: System fires daily interest accrual cron idempotent on loan_id and accrued_on

> **Sprint 2** | **P0** | **3 SP** | **R1** | FEAT-038

## User Story
As the System (P05), I want to post per-period interest accrual entries every day for every active loan, so that the cash-flow projector and reports always reflect accurate, up-to-date state.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-038 |
| Feature | FEAT-038 — System fires daily interest accrual cron idempotent on loan_id and accrued_on |
| Sprint | Sprint 2 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Backstage interest |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008, US-012 |
## Acceptance Criteria
- [ ] AC-1: `/api/cron/accrue-interest` is a bearer-authenticated Route Handler that iterates per org, per active loan, per missing accrual date, INSERTing an `InterestAccrual` row guarded by a `UNIQUE(loan_id, accrued_on)` constraint so a re-run posts no duplicate accruals.
- [ ] AC-2: After accrual the run refreshes `mv_liquidez_proyectada` and emits alert A6 for any loan that transitions to `en_mora` during the run.
- [ ] AC-3 (BR-17 / CHG-002): For any installment past `GroupConfig.mora_threshold_days`, the run also INSERTs an idempotent `LoanFee(fee_kind='mora')` guarded by `UNIQUE(loan_id, fee_kind, accrued_on)`, resolving `GroupConfig.config.mora` **per accrual day** (`asOf=accrued_on`) and stamping `LoanFee.group_config_version`.
- [ ] AC-4 (BR-17): The mora amount follows `config.mora.mechanic` (Mi Banquito: `flat_per_day` × `per_day_amount` = $0.2500/day) bounded by `config.mora.cap` (default `overdue_installment`); `config.mora.scope` gates the fee to loans only; a property test asserts `computed_mora ≤ cap_resolved(...)` and that a span crossing a config-version change splits at `valid_from`.
- [ ] AC-5: The handler accepts `from_date` / `to_date` query params for replay; an idempotency test proves a replay over a date range yields no duplicate `InterestAccrual` or `LoanFee` rows; an end-of-run summary alerts the operator on any per-loan failures (the run does not abort the whole batch on one failure).
- [ ] AC-6: All money columns are `decimal(18,4)`; accrual and mora rows are append-only (NFR-SEC-02/04); a waiver, when used, is a separate reversal `LoanFee` (`reverses_id` + `reverse_reason`, audit-logged), never a destructive update.

## Technical Notes
- **Data model:** `InterestAccrual` (`loan_id`, `accrued_on`, `amount decimal(18,4)`, UNIQUE on `loan_id, accrued_on`); `LoanFee` (`fee_kind='mora'`, `accrued_on`, `amount`, `group_config_version`, UNIQUE on `loan_id, fee_kind, accrued_on`, `reverses_id?`, `reverse_reason?`); materialized view `mv_liquidez_proyectada`. New migration per HR-25 timestamp-slug for the UNIQUE constraints / `LoanFee` mora fields.
- **API / surface:** `/api/cron/accrue-interest` Route Handler (bearer auth, `from_date`/`to_date` replay params); no UI screen. Process `AccrueInterestDaily` (P5).
- **Business-rule execution:** BR-17 mora at Layer 3 inside the cron; `GroupConfig.config.mora` is the typed/zod-validated jsonb lane resolved per accrual day (`asOf=accrued_on`); `day_count='business'` is rejected loudly until an Ecuador holiday calendar lands (OQ-BR17-2). The Meta `Business Rules` row is `—`; BR-17 is the operative rule for the mora sibling per CHG-002.
- **Multi-tenancy / audit:** iterates per org with org-scoped writes + RLS; each accrual/mora row carries the org; failures are collected and summarized rather than silently dropped.

## Test Strategy
- Idempotency: replay over an overlapping `from_date`/`to_date` range produces zero duplicate `InterestAccrual` and zero duplicate `LoanFee(mora)` rows.
- Golden-file: BR-17 `flat_per_day` accrual with `overdue_installment` cap.
- Property: `computed_mora ≤ cap_resolved(...)`; `cap.kind=none ⇒ uncapped`; an accrual span crossing a `GroupConfig` version boundary splits at `valid_from`.
- Integration: a loan crossing the threshold both emits A6 and posts the first mora `LoanFee`; a per-loan failure is summarized without aborting the batch.

## Dependencies
- Blocked By: — (none declared). Prerequisites from scope: US-008 (loan substrate), US-012 (cron/auth substrate). Mora behavior (BR-17) depends on the CHG-002 `GroupConfig.config.mora` lane (US-100/US-101).
