# US-093: Treasurer records an inter-account transfer (bookkeeping)

> **Sprint 8** | **P1** | **3 SP** | **R1** | FEAT-CHG001-03

## User Story
As a treasurer, I want to move money between the group's own accounts (caja chica ↔ banco), so that the per-account balances match reality without changing the total fund.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-093 |
| Feature | FEAT-CHG001-03 — Treasurer records an inter-account transfer (bookkeeping) |
| Sprint | Sprint 8 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## Acceptance Criteria
- [ ] AC-1: SCR-record-movement exposes a "Transferencia entre cuentas" mode with `from_account_id` and `to_account_id` (both group accounts), amount, date, and optional notes.
- [ ] AC-2: On save it writes a `Transfer` with `purpose = transfer`; both account balances update accordingly.
- [ ] AC-3: The net effect on the total fund is exactly 0 — asserted server-side (a transfer never changes the fund total, only its distribution across accounts).
- [ ] AC-4: Both `from_account_id` and `to_account_id` must resolve to group accounts; selecting the same account for both, or an out-of-group account, is rejected.
- [ ] AC-5: An `AuditLogEntry` is written for the transfer (BR-16).

## Technical Notes
- **Data model:** Writes an append-only `Transfer` (`from_account_id`, `to_account_id`, `amount`, `currency_code`, `dated_on`, `purpose = transfer`). Reuses the `Transfer` entity introduced for BR-12; migration per HR-25 if needed.
- **API / surface:** SCR-record-movement (transfer mode) + record-transfer Server Action. Components: `molecule.currency-input`, `molecule.confirmation-modal`.
- **Business-rule execution:** Implements the ordinary-transfer half of BR-12. The fund-total-invariant (Δtotal = 0) is enforced in the write path, not just displayed.
- **Multi-tenancy / audit:** Both accounts `org_id`-scoped (same tenant); audit log on every transfer (BR-16).

## Test Strategy
- Property: total fund balance before == after for any `purpose = transfer` (Δ = 0).
- Unit: per-account balances move by ±amount; same-account or non-group selection rejected.
- Integration: audit entry written; balances reflected on treasurer home.

## Dependencies
- `Blocked By` is `—`. Scope prerequisite US-091 — group accounts must exist before a transfer between them is possible. Shares the SCR-record-movement surface with US-092.
