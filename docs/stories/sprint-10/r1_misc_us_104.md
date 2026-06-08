# US-104: Treasurer configures + waives mora (group-config + condonación, O5)

> **Sprint 10** | **P1** | **3 SP** | **R1** | — Treasurer configures + waives mora (group-config + condonación, O5)

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-104 |
| Feature | — Treasurer configures + waives mora (group-config + condonación, O5) |
| Sprint | Sprint 10 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | misc |
| Business Rules | — |
| Backstage Process | S1 group rules; S4 collections |
| Blocked By | US-101, US-102 |

## User Story
As La Tesorera, I want to set this group's mora rule and forgive a charge when justified, so that the penalty fits our group and hardship is handled fairly and auditably.

## Acceptance Criteria
- [ ] AC-1: `SCR-group-config` (`/admin/orgs/[id]/config`) exposes the `config.mora` fields — `mechanic`, `per_day_amount`, `cap` (kind + value), `day_count`, `scope`, `feeds_surplus` — with es-EC copy.
- [ ] AC-2: Save validates via the `RuleConfig` zod schema: `cap.kind` requires a `value` when it is not `overdue_installment` or `none`; `day_count=business` is rejected until a holiday calendar exists. Invalid input fails loud and is not persisted.
- [ ] AC-3: A valid save writes a **new** `GroupConfig` version (HR-1 versioned; never an in-place mutation of an existing version), and the new `config.mora` takes effect via `loadConfig` for subsequent accrual days (per-accrual-day mode).
- [ ] AC-4: A waiver (condonación, O5) creates a reversal `LoanFee` with `reverses_id` set to the target mora row and a **required** `reverse_reason`; it is never a `DELETE`. The reversal is audit-logged as treasurer discretion.
- [ ] AC-5: All amounts are `decimal(18,4)`; a waived mora nets out of the displayed accrued mora (US-103) and the surplus base.

## Technical Notes
- **Data model:** edits `GroupConfig.config.mora` (new HR-1 version per save); waiver inserts a `LoanFee` reversal row (`reverses_id`, `reverse_reason`) — append-only, no `UPDATE`/`DELETE`.
- **API / surface:** `SCR-group-config` config form + a waiver action on `SCR-loan-detail`; S1 group rules / S4 collections.
- **Business-rule execution:** config edits flow through the `RuleConfig` zod validator; resolution via `loadConfig`; mora resolution stays per-accrual-day so a new version applies forward, not retroactively.
- **Multi-tenancy / audit:** `org_id`-scoped; HR-1 `EntityVersion` on every config save; waiver writes an `audit_log_entry` (treasurer discretion) — if the audit write fails, the waiver rolls back (audit-write-failure invariant).

## Test Strategy
- Validation tests: `cap.kind=flat_max` without `value` rejected; `day_count=business` rejected; valid payload accepted.
- Versioning test: a save produces a new `GroupConfig` version; the prior version is unchanged and still resolvable for past accrual days.
- Waiver test: reversal `LoanFee` requires `reverse_reason`, sets `reverses_id`, and nets the accrued mora to zero for that charge.
- Audit test: waiver without a persisted audit entry rolls back.

## Dependencies
- **US-101** (Blocked By) — provides the `config.mora` schema/seed and the `LoanFee` reversal columns (`reverses_id`, `reverse_reason`) this story edits and writes.
- **US-102** (Blocked By) — produces the mora charges that a waiver reverses; configuration changes feed the same accrual path.
