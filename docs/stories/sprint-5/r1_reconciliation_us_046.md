# US-046: Treasurer locks the monthly close and the period becomes immutable

> **Sprint 5** | **P0** | **3 SP** | **R1** | FEAT-046

## User Story

As a treasurer, I want to confirm the close, so that the period is locked and no further entries can land in it.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-046 |
| Feature | FEAT-046 — Treasurer locks the monthly close and the period becomes immutable |
| Sprint | Sprint 5 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant reconciliation |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-044, US-045 |
## Acceptance Criteria

- [x] AC-1: The `SCR-monthly-close` confirm action writes a `PeriodClose` row for the reconciliation cycle (referencing `reconciliation_cycle_id`); confirm is only available when the cycle is within tolerance (US-044) or has an `annotated_acceptance` resolution (US-045).
- [x] AC-2: After the `PeriodClose` is written, any subsequent insert OR update of a ledger entry (`Contribution`, `Withdrawal`, `Repayment`, `InterestAccrual`, `Expense`) with `dated_on ≤ PeriodClose.closed_at::date` is rejected — including reversal entries, which must instead be entered in the next open cycle (period-lock invariant, A-ER-12).
- [x] AC-3: The lock is enforced both at the application layer (pre-flight check) and via a Postgres row trigger (paired with US-070); the trigger is the authoritative guard.
- [x] AC-4: On success the screen shows the close summary copy — e.g. "Mayo cerrado. Reconciliación: cero discrepancia." for an in-tolerance close, or the annotation summary when the close carried an `annotated_acceptance`.
- [x] AC-5: Confirming close is idempotent per cycle — a second confirm for an already-closed cycle does not insert a duplicate `PeriodClose` and returns the existing close.
- [x] AC-6: The `PeriodClose` write and its `AuditLogEntry` insert occur in one DB transaction; an injected audit-write failure rolls back the close (NFR-SEC-04).

## Closeout

Closed in Sprint 5 monthly-close slice. Verified by reconciliation domain tests, schema tests, build checks, and the live June 2026 close/archive.

## Technical Notes
- **Data model:** `PeriodClose` (1:1 from `ReconciliationCycle` via `results_in`): `reconciliation_cycle_id`, `closed_at`, `closed_by`, summary fields. Append-only (carries `created_by`/`created_by_kind`). Period-lock enforced by the trigger delivered in US-070; if not yet present a timestamp-slug migration per HR-25 (`slug=period_lock_trigger`).
- **API / surface:** confirm action on `SCR-monthly-close` (P13 LockPeriodClose). Post-commit it triggers monthly-close PDF generation (US-047).
- **Business-rule execution:** the period-lock invariant (ER model, A-ER-12) is the governing constraint; no numbered BR is declared (Business Rules row = —). Re-opening a locked period is out of scope here and handled by the operator adjustment-period story (US-083).
- **Multi-tenancy / audit:** org-scoped via RLS; `PeriodClose` write emits an `AuditLogEntry` in the same transaction.

## Test Strategy
- Unit: confirm-availability gating (in-tolerance vs annotated vs unresolved).
- Integration: write `PeriodClose`, then assert insert/update/reversal of an in-period ledger entry is rejected by the trigger; assert a later-dated entry in the next cycle is allowed.
- Integration: double-confirm is idempotent (single `PeriodClose`); injected audit failure rolls back close (NFR-SEC-04).

## Dependencies
- `Blocked By` row is `—`; scope prerequisite is US-044 OR US-045 (a resolved reconciliation cycle must exist to close). The period-lock trigger is co-developed with US-070 (Epic 11 substrate enforcement).
