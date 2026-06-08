# US-105: System writes the immutable year-end balance snapshot at close (CHG-003)

> **Sprint 10** | **P1** | **3 SP** | **R1** | — System writes the immutable year-end balance snapshot at close (CHG-003)

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-105 |
| Feature | — System writes the immutable year-end balance snapshot at close (CHG-003) |
| Sprint | Sprint 10 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | BR-18 |
| Backstage Process | S5 year-end close; P-new SnapshotYearEnd |
| Blocked By | US-046, US-101 |

## User Story
As the year-end close process (BR-18), I want to capture the group's and each member's closing balances at the year-end cut, so that the year is preserved, queryable later, and the next year's surplus has a `cxc_anterior` source.

## Acceptance Criteria
- [ ] AC-1: Post-commit of `PeriodClose(is_year_end)`, the `SnapshotYearEnd` process writes exactly one `YearEndBalanceSnapshot` plus one `YearEndBalanceSnapshotLine` per member, idempotent on `(org_id, year)` — a re-run yields no duplicate snapshot. (BR-18)
- [ ] AC-2: The snapshot captures group + per-member totals — ahorros, cuota acumulada, préstamos por cobrar, interés por cobrar, banco — plus `cxc_anterior` for the next year's surplus base, all `decimal(18,4)`, derived from the append-only ledger at the cut date (preservation, not reseed).
- [ ] AC-3: The snapshot freezes the `group_config_version` in force (governance-snapshot / period-locked temporal mode) and stores a canonical-JSON SHA-256 hash of the cut.
- [ ] AC-4: The snapshot tables are immutable — no `UPDATE` / `DELETE` (Layer 1 enforced); a correction is a new canonical cut, never an edit.

## Technical Notes
- **Data model:** `YearEndBalanceSnapshot` (group totals, `cxc_anterior`, frozen `group_config_version`, canonical-JSON SHA-256, `UNIQUE(org_id, year)`) + `YearEndBalanceSnapshotLine` (per-member balances), all `decimal(18,4)`; append-only / immutable.
- **API / surface:** `SnapshotYearEnd` process (Layer 3) triggered post-`PeriodClose(is_year_end)`; S5 year-end close, new process P-new. No screens (n/a).
- **Business-rule execution:** governance-snapshot temporal mode — reads the `group_config_version` frozen at `PeriodClose`; balances computed point-in-time from the ledger at the cut date (BR-18).
- **Multi-tenancy / audit:** `org_id`-scoped; idempotency key `(org_id, year)`; immutability enforced (no `UPDATE`/`DELETE`); the SHA-256 hash makes the cut verifiable.

## Test Strategy
- Golden file: snapshot totals reconcile to the ledger at the cut date.
- Property test: a closed year's snapshot is immutable; the point-in-time balance as of 31/dic equals the snapshot line.
- Idempotency test: re-running `SnapshotYearEnd` for the same `(org_id, year)` produces no duplicate snapshot.
- Hash test: canonical-JSON SHA-256 is stable for identical inputs.

## Dependencies
- **US-046** (Blocked By) — provides the `PeriodClose(is_year_end)` event this snapshot fires after.
- **US-101** (Blocked By) — provides the formalized `LoanFee`/config substrate; mora + admin fees that feed `cxc_anterior` must exist as typed rows before the cut.
