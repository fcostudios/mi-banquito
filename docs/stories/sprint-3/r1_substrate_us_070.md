# US-070: System enforces period-lock immutability via Postgres row trigger

> **Sprint 3** | **P0** | **3 SP** | **R1** | FEAT-070

## User Story

As the system, I want to reject inserts into a period that has already been closed, so that NFR-SEC-03 (period-lock immutability) holds.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-070 |
| Feature | FEAT-070 — System enforces period-lock immutability via Postgres row trigger |
| Sprint | Sprint 3 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Substrate |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008 |
## Acceptance Criteria

- [ ] AC-1: A `BEFORE INSERT` row-level trigger on the ledger tables compares the new row's **`dated_on`** against the **most recent `PeriodClose.closed_at::date` for the same cycle/org** and **rejects** the insert when `dated_on` falls inside a closed period.
- [ ] AC-2: Inserts with `dated_on` **after** the last close (i.e. in the open current period) **succeed** normally.
- [ ] AC-3: The one sanctioned exception is an **adjustment-period entry** (US-083): when an adjustment `ReconciliationCycle` window is open for that `PeriodClose`, an insert tagged for that adjustment cycle is permitted; outside an open adjustment window the lock holds.
- [ ] AC-4: The trigger raises a **named, catchable error** so the app surfaces a clear Spanish message ("ese período ya está cerrado") rather than a raw failure.
- [ ] AC-5: An **integration test** writes a `PeriodClose`, then asserts an insert dated on/before `closed_at` is rejected while an insert dated after succeeds; behavior is **documented in the migration** (HR-25 timestamp-slug).
- [ ] AC-6: Enforcement is at the **database layer** and is **org/cycle-scoped** — a close in org-A or cycle-1 never locks org-B or a different cycle.

## Technical Notes
- **Data model:** reads `PeriodClose` (`closed_at`, cycle, `org_id`) and (for the exception) `ReconciliationCycle.kind = adjustment` open windows; adds a trigger function + INSERT trigger on the ledger tables. New migration per HR-25: `V<UTC-timestamp>__period_lock_immutability_trigger.sql` (Meta `slug=period-lock-immutability-trigger`).
- **API / surface:** none (DB-level substrate enforcement).
- **Business-rule execution:** enforces the ER "period-lock immutability" constraint / NFR-SEC-03 — once a `PeriodClose` is written, nothing with `dated_on ≤ closed_at` may be inserted except an explicit adjustment-period entry.
- **Multi-tenancy / audit:** lock evaluated per (org, cycle); composes with append-only triggers (US-069) and the adjustment-window opener (US-083, which lifts the lock for one bounded window).

## Test Strategy
- Integration: close a period, assert insert dated ≤ `closed_at` rejected, insert dated after succeeds; assert an adjustment-cycle insert succeeds only while the US-083 window is open and is rejected after auto-relock.
- Integration: cross-cycle / cross-org — a close in cycle-1 does not block cycle-2; a close in org-A does not block org-B.

## Dependencies
- Blocked By: — (none declared). Builds on US-008 (base schema) per the scope Prerequisites; interacts with US-083 (adjustment window is the sanctioned lock-lift) and US-069 (sibling ledger-integrity trigger).
