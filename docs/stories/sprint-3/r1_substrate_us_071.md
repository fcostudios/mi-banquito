# US-071: System enforces audit-write-failure rollback via same-transaction pattern

> **Sprint 3** | **P0** | **3 SP** | **R1** | FEAT-071

## User Story

As the system, I want to roll back the originating action if its audit write fails, so that NFR-SEC-04 holds — no money-touching write ever lands without its audit record.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-071 |
| Feature | FEAT-071 — System enforces audit-write-failure rollback via same-transaction pattern |
| Sprint | Sprint 3 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Substrate |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008 |
## Acceptance Criteria

- [ ] AC-1: **Every Server Action that writes** wraps the originating write **and** its `INSERT AuditLogEntry` in **one `db.transaction()`** so the two commit or roll back atomically.
- [ ] AC-2: If the `AuditLogEntry` insert **fails**, the **originating row is rolled back** — neither the business row nor the audit row persists (no orphan business write without an audit trail).
- [ ] AC-3: If the **originating write fails**, no `AuditLogEntry` is written either (the transaction aborts as a unit).
- [ ] AC-4: An **integration test** injects an audit-table failure (e.g. forced constraint/exception on `AuditLogEntry`) inside a write action and asserts the originating business row was **not** committed.
- [ ] AC-5: The same-transaction pattern is applied consistently — there is **no code path** that writes a money-touching/tenant entity outside a transaction that also writes its audit entry (enforced by convention + the test, and documented).

## Technical Notes
- **Data model:** no schema change; the constraint is a **transaction-composition pattern** over existing tables (any tenant/ledger write + `AuditLogEntry`). No migration.
- **API / surface:** applies to all write Server Actions (e.g. RecordContribution, RecordRepayment, originate loan, etc.); each must use a single `db.transaction()` enclosing the write + audit insert.
- **Business-rule execution:** enforces NFR-SEC-04; complements append-only (US-069) and period-lock (US-070) by guaranteeing the audit row's atomicity with its originating write.
- **Multi-tenancy / audit:** the audit row carries the same `org_id` and is the foundation of dispute resolution (P18); atomicity ensures the `AuditLogEntry` trail is complete and trustworthy.

## Test Strategy
- Integration: inject an `AuditLogEntry` insert failure inside a representative write action; assert the originating row is absent after rollback. Repeat with originating-write failure → assert no audit row.
- Property/convention: a lint or test asserts each write Server Action opens a transaction enclosing both writes (no audit insert outside the originating transaction).

## Dependencies
- Blocked By: — (none declared). Builds on US-008 (write Server Actions + `AuditLogEntry`) per the scope Prerequisites.
