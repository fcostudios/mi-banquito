# US-050: System awards treasurer compensation per cron with idempotency

> **Sprint 4** | **P0** | **3 SP** | **R1** | FEAT-050

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-050 |
| Feature | FEAT-050 — System awards treasurer compensation per cron with idempotency |
| Sprint | Sprint 4 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Backstage reporting |
| Business Rules | BR-07 |
| Backstage Process | — |
| Blocked By | US-012, US-017 |
## User Story
As the system, I want to pay the treasurer on the configured cadence deterministically, so that BR-07 (treasurer compensation) is honored without manual intervention or double-payment.

## Acceptance Criteria
- [ ] AC-1: A daily cron `/api/cron/award-treasurer-compensation` scans every org whose `GroupConfig.treasurer_compensation.next_due_on ≤ today`.
- [ ] AC-2: For each due org it writes one `TreasurerCompensationDisbursement` (with `kind_at_disbursement` snapshot, `amount`, `currency`, `period_label`, `member_id` = the treasurer) plus a `Withdrawal` of `kind = treasurer_compensation_disbursement`, then advances `next_due_on` by the configured period (monthly/yearly). [BR-07]
- [ ] AC-3: Idempotent on `(org_id, period_label)` UNIQUE — re-running the cron the same day, or a duplicate trigger, never produces a second disbursement for an already-paid period. [BR-07]
- [ ] AC-4: Each award writes an audit-log entry (BR-16) and surfaces a low-severity alert in es-EC: "Compensación de tesorera de {period} acreditada — {currency} {amount}".
- [ ] AC-5: Only the `fixed_periodic` R1 shape (`amount`, `currency`, `period ∈ {monthly, yearly}`) is paid; other `kind` values (R2-designed: `pct_of_interest`, etc.) are skipped without error. The disbursement is visible on SCR-history and the monthly close PDF. [BR-07]

## Technical Notes
- **Data model:** `TreasurerCompensationDisbursement` (`id, org_id, member_id, period_label, amount, currency, kind_at_disbursement, withdrawal_id, disbursed_on`) with UNIQUE `(org_id, period_label)`; creates a `Withdrawal` row. Add via HR-25 timestamp-slug migration (`slug=treasurer_compensation_disbursement`) if not already present.
- **API / surface:** platform-agnostic daily cron route; no UI of its own. Results appear on SCR-history and the monthly close PDF line "Gastos del grupo" (per OQ-BR7-2 default = yes).
- **Business-rule execution:** BR-07 enforced at Layer 3 (the cron) per `09b_business_rules.md`; `next_due_on` advance + idempotency are the rule's verified behaviors. Config-driven via `GroupConfig.treasurer_compensation` JSONB (kind/amount/currency/period/next_due_on).
- **Multi-tenancy / audit:** iterate orgs, each write `org_id`-scoped to the treasurer member (`role = 'tesorera'`); append-only + audited (BR-16). Mid-period role change handled per OQ-BR7-1 default (active treasurer at `disbursed_on`).

## Test Strategy
- Golden-file: one month of compensation equals the configured `amount`; the year-over-year transition correctly advances `next_due_on` (the BR-07 verification harness).
- Integration: a second same-day cron run inserts zero rows (UNIQUE `(org_id, period_label)`); the alert + audit entry are emitted exactly once.
- Unit: `next_due_on` advance for monthly vs yearly; non-`fixed_periodic` kinds are skipped.

## Dependencies
- Blocked By: — (no story-level blocker declared). Functional prerequisites per scope: US-012 (GroupConfig with `treasurer_compensation`) and US-017 (treasurer member identity).
