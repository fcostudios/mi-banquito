# US-102: System accrues a mora fee on overdue installments (BR-17, flat_per_day)

> **Sprint 10** | **P1** | **3 SP** | **R1** | — System accrues a mora fee on overdue installments (BR-17, flat_per_day)

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-102 |
| Feature | — System accrues a mora fee on overdue installments (BR-17, flat_per_day) |
| Sprint | Sprint 10 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | misc |
| Business Rules | BR-17 |
| Backstage Process | S3/S4 cron; P5 |
| Blocked By | US-038, US-101 |

## User Story
As the daily accrual cron (BR-17), I want to charge mora on overdue loan installments, so that late repayment carries the agreed penalty and feeds the year-end distributable surplus.

## Acceptance Criteria
- [ ] AC-1: Extending US-038, for each loan installment past `GroupConfig.mora_threshold_days`, the cron emits a `LoanFee(fee_kind='mora')` row per overdue period, idempotent on `UNIQUE(loan_id, fee_kind, accrued_on)` (cron replay over a `from/to` window yields no duplicate rows).
- [ ] AC-2: The fee is computed from `config.mora` resolved **per accrual day** (`asOf=accrued_on`; per-accrual-day temporal mode). With `mechanic=flat_per_day`, `fee = days_overdue × config.mora.per_day_amount`, bounded by `config.mora.cap` (default `overdue_installment` — accrued mora for a period never exceeds what is owed for that period). All math `decimal(18,4)`. (BR-17)
- [ ] AC-3: `scope=loans` — overdue **loan** installments only; savings are excluded.
- [ ] AC-4: Each emitted `LoanFee` stamps the `group_config_version` resolved on that `accrued_on`; a span crossing a config-version change splits at the new version's `valid_from`.
- [ ] AC-5: The accrual is replay-safe and the existing A6 overdue alert behavior is unchanged.

## Technical Notes
- **Data model:** writes `LoanFee(fee_kind='mora')` (from US-101): `accrued_on`, `amount decimal(18,4)`, `group_config_version`, `feeds_surplus=true`; `UNIQUE(loan_id, fee_kind, accrued_on)` enforces idempotency.
- **API / surface:** the `AccrueInterestDaily` cron / mora sibling (Layer 3); S3/S4 cron, process P5. No screens (n/a).
- **Business-rule execution:** `loadConfig(orgId, asOf=accrued_on) → RuleContext`; dispatch via registry keyed by `BR-17`; `mechanic=flat_per_day`; cap kind from `config.mora.cap` (default `overdue_installment`); `day_count=calendar`; `scope=loans`. Per-accrual-day temporal mode.
- **Multi-tenancy / audit:** `org_id`-scoped; each `LoanFee` records the producing BR-id + `group_config_version` for audit-by-replay.

## Test Strategy
- Golden file: `flat_per_day` accrual with the `overdue_installment` cap applied.
- Property tests: `computed_mora ≤ cap_resolved(...)`; `cap.kind=none ⇒ uncapped`; a span crossing a config-version change splits at `valid_from`.
- Idempotency test: cron replay over `from/to` dates produces no duplicate `LoanFee` rows.
- Scope test: savings installments accrue no mora (`scope=loans`).

## Dependencies
- **US-038** (Blocked By) — the daily interest/overdue accrual cron this story extends to also emit mora.
- **US-101** (Blocked By) — provides the `LoanFee(fee_kind='mora')` row + `config.mora` seed this accrual writes and reads.
