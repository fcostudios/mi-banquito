# US-069: System enforces append-only ledger via Postgres row triggers

> **Sprint 3** | **P0** | **3 SP** | **R1** | FEAT-069

## User Story

As the system, I want to reject any UPDATE or DELETE on the five ledger tables, so that NFR-SEC-02 (append-only ledger) holds even if an app-layer guard is forgotten.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-069 |
| Feature | FEAT-069 — System enforces append-only ledger via Postgres row triggers |
| Sprint | Sprint 3 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Substrate |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008 |
## Acceptance Criteria

- [ ] AC-1: A `BEFORE UPDATE OR DELETE` row-level trigger exists on **each of the five ledger tables — `Contribution`, `Withdrawal`, `Repayment`, `Expense`, `InterestAccrual`** — and **raises `append_only_violation`** on any UPDATE or DELETE, aborting the statement.
- [ ] AC-2: INSERT is **unaffected** — appending new rows (including reversal/correction rows with `reverses_id`) continues to succeed; corrections are expressed as new reversal entries, never as edits/deletes (per the ER append-only constraint).
- [ ] AC-3: The trigger raises a **named, catchable error** (`append_only_violation`) so the app layer can surface a clear Spanish message rather than a generic 500.
- [ ] AC-4: An **integration test** attempts UPDATE and DELETE on each of the five tables and asserts the statement is rejected with `append_only_violation`, and asserts a normal INSERT still succeeds.
- [ ] AC-5: The trigger/function is defined and **documented in the migration** (HR-25 timestamp-slug filename); enforcement is at the **database layer**, independent of any app-layer predicate.

## Technical Notes
- **Data model:** no schema change to the ledger tables themselves; adds a shared trigger function (e.g. `raise_append_only_violation()`) + one trigger per table on `Contribution, Withdrawal, Repayment, Expense, InterestAccrual`. New migration per HR-25: `V<UTC-timestamp>__append_only_ledger_triggers.sql` (story Meta declares `slug=append-only-ledger-triggers`); never allocate a `Vxxx`.
- **API / surface:** none (DB-level substrate enforcement, no screen).
- **Business-rule execution:** enforces the ER non-negotiable "append-only ledger semantics" / NFR-SEC-02 at the storage layer; the app catches `append_only_violation` and maps it to user-facing copy.
- **Multi-tenancy / audit:** trigger is tenant-agnostic (applies to all rows regardless of `org_id`); complements RLS (US-072) and period-lock (US-070). Append-only is the substrate guarantee the `AuditLogEntry` trail relies on.

## Test Strategy
- Integration: for each of the five tables, assert UPDATE → `append_only_violation`, DELETE → `append_only_violation`, INSERT → success (including a reversal-row INSERT with `reverses_id`).
- Migration test: applying the migration creates exactly five triggers + the function; idempotent re-apply / rollback behaves per migration tooling.

## Dependencies
- Blocked By: — (none declared). Builds on US-008 (base schema / migration substrate) per the scope Prerequisites.
