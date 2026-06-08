# US-067: System emits A7 discrepancia bancaria detectada alert

> **Sprint 5** | **P0** | **2 SP** | **R1** | FEAT-067

## User Story

As the system, I want to emit the A7 *Discrepancia bancaria detectada* alert (Critical) whenever a reconciliation cycle is recorded with a discrepancy beyond tolerance, so that the treasurer cannot overlook a bank-vs-books mismatch.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-067 |
| Feature | FEAT-067 — System emits A7 discrepancia bancaria detectada alert |
| Sprint | Sprint 5 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Backstage alerts |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-044 |
## Acceptance Criteria

- [ ] AC-1: On a `ReconciliationCycle` write where the discrepancy exceeds the `GroupConfig.config` tolerance (US-044), the system emits an `Alert` with `alert_kind = A7`, `severity = critical`, `audience = treasurer`.
- [ ] AC-2: The alert payload cites both balances (declared vs computed pool) and the difference, so the copy is actionable without opening the cycle.
- [ ] AC-3: Deduplication is `per_cycle` — at most one open A7 alert exists per `ReconciliationCycle`; a re-write of the same cycle that is still out of tolerance updates the existing alert rather than emitting a duplicate.
- [ ] AC-4: The alert remains active until the discrepancy is resolved (cycle brought within tolerance, US-044) OR the close completes with an `annotated_acceptance` (US-045); on either it is cleared/auto-dismissed.
- [ ] AC-5: As a Critical-class alert it reappears each session until acted upon (it cannot be silently snoozed away while the cycle is still out of tolerance).
- [ ] AC-6: The alert write occurs in the same transaction as the originating `ReconciliationCycle` write and emits an `AuditLogEntry` (NFR-SEC-04).

## Technical Notes
- **Data model:** `Alert` (`alerts_context`): `org_id`, `alert_kind` (A7), `severity` (critical), `audience` (treasurer), `subject_kind`/`subject_id` (→ `ReconciliationCycle`), `payload` (jsonb: declared, computed, difference), `dedup_window_end`, `dismissed_at`, `snoozed_until`. No new migration if `Alert` exists from US-008.
- **API / surface:** emitted by the reconciliation write path (P17, kind A7), not a screen; surfaced through the alerts bell (US-055).
- **Business-rule execution:** no numbered BR (Business Rules row = —); trigger condition is `discrepancy > GroupConfig.config` tolerance — the same threshold US-044 evaluates. Per-cycle dedup keyed on `subject_id`.
- **Multi-tenancy / audit:** org-scoped via RLS; emission and clear both emit `AuditLogEntry` rows; alert write shares the originating transaction.

## Test Strategy
- Unit: emission predicate (in-tolerance → no alert; out-of-tolerance → A7); payload contents (both balances + difference).
- Integration: out-of-tolerance write emits one A7; re-write keeps a single open alert (per-cycle dedup); resolving to within tolerance or annotating clears it.
- Integration: Critical-class re-surfacing across sessions while unresolved.

## Dependencies
- `Blocked By` row is `—`; scope prerequisite US-044 (the `ReconciliationCycle` write + discrepancy/tolerance evaluation is the emission trigger). Clears via US-044/US-045; rendered by the alerts bell US-055.
