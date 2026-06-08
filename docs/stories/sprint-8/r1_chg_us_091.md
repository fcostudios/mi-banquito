# US-091: Treasurer sets up and manages the group's accounts

> **Sprint 8** | **P1** | **3 SP** | **R1** | FEAT-CHG001-01

## User Story
As a treasurer, I want to register the group's accounts (cuenta de banco, caja chica, mi cuenta personal cuando recibo depósitos del grupo), so that every movement can say which account it touched and the real fund balance is unambiguous.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-091 |
| Feature | FEAT-CHG001-01 — Treasurer sets up and manages the group's accounts |
| Sprint | Sprint 8 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## Acceptance Criteria
- [ ] AC-1: NEW SCR-accounts lists existing `Account` rows and supports add/edit with fields: `type ∈ {group_bank, cash_box, treasurer_personal, external}`, `name`, optional `last4`, and `is_group_fund` derived from `type` with an explicit override.
- [ ] AC-2: At least one `is_group_fund = true` account must exist before any movement (US-092/093/094) can be recorded; the recording surfaces are blocked until that holds (foundation for BR-12).
- [ ] AC-3: Treasurer-personal (`type = treasurer_personal`, non-group-fund) accounts are clearly labeled "fuera del fondo — requiere regularización" via `atom.status-pill`.
- [ ] AC-4: Account status changes are append-only — no hard delete; a deactivated account is retained for historical movement references.
- [ ] AC-5: Every create/edit/deactivate writes an `AuditLogEntry` (BR-16).

## Technical Notes
- **Data model:** New `Account` entity (`id`, `org_id`, `name`, `type` enum, `is_group_fund` boolean, `last4` nullable, status). New migration follows HR-25 timestamp-slug naming. `is_group_fund` is indexed (drives BR-12 pending detection).
- **API / surface:** NEW route → `SCR-accounts` (list + add/edit Server Actions). Components: `molecule.confirmation-modal`, `atom.status-pill` (fondo / fuera del fondo).
- **Business-rule execution:** Implements BR-12's multi-account foundation — `is_group_fund` is the flag every downstream pending/regularization check keys on. Layer-1 DB `CHECK` on the `type` enum; the "≥1 group-fund account before recording" guard is enforced server-side, not just in UI.
- **Multi-tenancy / audit:** All `Account` rows `org_id`-scoped under RLS; append-only status changes; audit log on every mutation (BR-16).

## Test Strategy
- Property: an attempt to record a movement with zero `is_group_fund` accounts is rejected.
- Unit: `is_group_fund` defaults correctly per `type` and the override persists.
- Integration: deactivation is append-only (historical movements still resolve their account); audit entry written on each mutation.

## Dependencies
- `Blocked By` is `—`. Scope prerequisites US-008 (org foundation) and US-026 (treasurer setup) are upstream enablers. US-091 is itself the foundation for US-092, US-093, US-094, and US-095.
