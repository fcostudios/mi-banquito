# US-101: Formalize `LoanFee` + `GroupConfig.config.mora` (migration, CHG-002)

> **Sprint 10** | **P1** | **3 SP** | **R1** | — Formalize `LoanFee` + `GroupConfig.config.mora` (migration, CHG-002)

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-101 |
| Feature | — Formalize `LoanFee` + `GroupConfig.config.mora` (migration, CHG-002) |
| Sprint | Sprint 10 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | BR-03, BR-17 |
| Backstage Process | P4 schedule gen (admin) / P5 cron (mora) |
| Blocked By | US-008, US-100 |

## User Story
As the loan-domain substrate, I want a first-class `LoanFee` entity plus a per-group mora config block, so that the admin fee (BR-03) and the mora fee (BR-17) have a typed home that feeds the distributable-surplus base.

## Acceptance Criteria
- [ ] AC-1: An HR-25 timestamp-slug migration creates `LoanFee` with `fee_kind ∈ {admin, late, mora}`, `UNIQUE(loan_id, fee_kind, accrued_on)`, `group_config_version`, `feeds_surplus`, `reverses_id` + `reverse_reason`, and `account_id`. The story Meta declares the migration `slug` (no raw `Vxxx`).
- [ ] AC-2: The existing admin-fee write is re-pointed to emit a `LoanFee(fee_kind='admin')` row (BR-03 — 1% on installment 1) with **no behavior change**; amounts stay `decimal(18,4)` and `feeds_surplus=true`.
- [ ] AC-3: Mi Banquito's `config.mora` is seeded (HR-1 versioned `GroupConfig`) as `{mechanic: flat_per_day, per_day_amount: 0.2500, cap: {kind: overdue_installment}, day_count: calendar, scope: loans, feeds_surplus: true}`, validated by the `RuleConfig` zod schema (BR-17).
- [ ] AC-4: The `config.mora` block is loadable through `loadConfig(orgId, asOf)` into a `RuleContext`; the seed round-trips through zod write+read validation and resolves under per-accrual-day mode for downstream mora accrual (US-102).

## Technical Notes
- **Data model:** new `LoanFee` (append-only; waivers are reversal rows, never `DELETE`): `fee_kind`, `accrued_on`, `amount decimal(18,4)`, `group_config_version`, `feeds_surplus bool`, `reverses_id` (self-FK), `reverse_reason`, `account_id`, with `UNIQUE(loan_id, fee_kind, accrued_on)`. `GroupConfig.config.mora` lives in the typed jsonb lane from US-100. HR-25 timestamp-slug migration.
- **API / surface:** none directly — migration + seed; admin-fee writer re-point at P4 schedule generation; mora consumed at P5 cron. No screens (n/a).
- **Business-rule execution:** `config.mora` parsed by the `RuleConfig` zod schema; consumed via `loadConfig` per-accrual-day for BR-17. Admin fee (BR-03) emitted post-commit of `OriginateLoan` as `fee_kind='admin'`.
- **Multi-tenancy / audit:** `org_id`-scoped; `config.mora` is a per-group override stamped with HR-1 `EntityVersion`; every `LoanFee` carries `group_config_version`.

## Test Strategy
- Migration check: no version/CREATE-TABLE conflict; `UNIQUE(loan_id, fee_kind, accrued_on)` present.
- Golden file: admin-fee row unchanged after re-point (BR-01/BR-03 table shows the fee only on installment 1).
- Validation test: seeded `config.mora` passes `RuleConfig` zod write+read.
- Property test: `feeds_surplus=true` for both `admin` and `mora` kinds.

## Dependencies
- **US-008** (Blocked By) — provides the `GroupConfig` + versioning substrate the `config.mora` seed extends.
- **US-100** (Blocked By) — provides the typed config lane, `RuleConfig` zod schema, and `loadConfig` resolver this story's seed must validate and resolve through.
