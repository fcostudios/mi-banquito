# US-044: Treasurer enters declared bank balance and sees discrepancy in cierre flow

> **Sprint 5** | **P0** | **3 SP** | **R1** | FEAT-044

## User Story

As a treasurer, I want to enter what my bank app shows and immediately see whether my books agree, so that the system tells me if there is a discrepancy before I try to close the month.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-044 |
| Feature | FEAT-044 — Treasurer enters declared bank balance and sees discrepancy in cierre flow |
| Sprint | Sprint 5 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant reconciliation |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008, US-029, US-036 |
## Acceptance Criteria

- [ ] AC-1: `SCR-monthly-close` step 1 renders a large numeric input for the declared bank balance; on submit the system computes the `pool_balance` derived view for the cycle and displays the declared balance, the computed pool, and their difference (discrepancy).
- [ ] AC-2: The discrepancy is rendered with a green / amber / red text-and-background state driven by the cycle tolerance from `GroupConfig.config` — green when `|discrepancy| ≤ tolerance`, red/amber when outside.
- [ ] AC-3: When the discrepancy is within tolerance, the "Cerrar el mes" CTA is enabled; when outside tolerance, the CTA is disabled and the treasurer is routed to resolution or annotation (see US-045).
- [ ] AC-4: Submitting the declared balance writes/updates the `ReconciliationCycle` row for the current `ContributionCycle` (declared balance, computed pool, discrepancy) idempotently — re-submitting for the same cycle updates the open cycle rather than inserting a duplicate.
- [ ] AC-5: The declared-balance write is rejected if the target cycle's period is already locked (period-lock invariant; see US-046/US-070).
- [ ] AC-6: The write and its `AuditLogEntry` insert occur in a single DB transaction; an injected audit-write failure rolls back the reconciliation write (NFR-SEC-04).

## Technical Notes
- **Data model:** `ReconciliationCycle` (1:1 with `ContributionCycle` via `reconciles_as`) holds declared balance, computed pool, discrepancy, tolerance snapshot, `resolution_kind`, `resolution_note`. `pool_balance` is a derived view over the cycle's ledger entries (`Contribution`, `Withdrawal`, `Repayment`, `InterestAccrual`, `Expense`). No new migration if `ReconciliationCycle` already exists from US-008; otherwise a timestamp-slug migration per HR-25 (`slug=reconciliation_cycle`).
- **API / surface:** server action `executeReconciliation` (P12 ExecuteReconciliation) invoked from `SCR-monthly-close` step 1; reads tolerance from `GroupConfig.config`.
- **Business-rule execution:** tolerance comparison is config-driven via `GroupConfig.config` (reconciliation tolerance key); no numbered BR is declared for this story (Business Rules row = —). Period-lock pre-flight check runs before any write.
- **Multi-tenancy / audit:** org-scoped via RLS (auth session var); every write emits an `AuditLogEntry` (`created_by_kind`) in the same transaction.

## Test Strategy
- Unit: `pool_balance` derivation from a fixed ledger fixture; tolerance threshold boundary cases (just inside / just outside).
- Integration: submit declared balance → assert `ReconciliationCycle` row + green/amber/red state + CTA enable/disable; re-submit asserts idempotent update (no duplicate cycle).
- Integration: injected audit-table failure rolls back the reconciliation write (NFR-SEC-04).

## Dependencies
- `Blocked By` row is `—`; scope prerequisites US-008 (schema + RLS), US-029 (contribution ledger), US-036 (withdrawals/balances) supply the entities and `pool_balance` inputs this story reads.
