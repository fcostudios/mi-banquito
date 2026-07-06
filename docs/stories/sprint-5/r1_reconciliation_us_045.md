# US-045: Treasurer annotates a discrepancy outside tolerance with required reason

> **Sprint 5** | **P0** | **3 SP** | **R1** | FEAT-045

## User Story

As a treasurer, I want to accept a known difference by annotating it with a required reason, so that I can close the month with a documented explanation rather than being blocked.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-045 |
| Feature | FEAT-045 — Treasurer annotates a discrepancy outside tolerance with required reason |
| Sprint | Sprint 5 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant reconciliation |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-044 |
## Acceptance Criteria

- [x] AC-1: On `SCR-monthly-close` step 2, when the discrepancy is outside tolerance, the treasurer is offered two paths: (a) resolve by recording a missing or reversing transaction (returns to the contribution/withdrawal flow, S2), or (b) annotate the discrepancy with a reason.
- [x] AC-2: The annotation reason is required and must be at least 10 characters; submission with a shorter/blank reason is rejected with an inline validation message.
- [x] AC-3: On annotation, the `ReconciliationCycle` row is updated with `resolution_kind = annotated_acceptance` and `resolution_note` set to the entered reason.
- [x] AC-4: After a valid annotation the "Cerrar el mes" CTA becomes enabled (the documented difference no longer blocks close), and the A7 critical alert (US-067) is allowed to clear once close completes.
- [x] AC-5: Annotation against an already-locked period is rejected (period-lock invariant; see US-046/US-070).
- [x] AC-6: The annotation write and its `AuditLogEntry` insert occur in one DB transaction; an injected audit-write failure rolls back the annotation (NFR-SEC-04).

## Closeout

Closed in Sprint 5 monthly-close slice. Verified by reconciliation domain tests and cierre page tests.

## Technical Notes
- **Data model:** updates `ReconciliationCycle.resolution_kind` (enum incl. `annotated_acceptance`) and `resolution_note` (text). No new migration if these columns exist from US-008; otherwise timestamp-slug migration per HR-25 (`slug=reconciliation_resolution`).
- **API / surface:** annotation modal on `SCR-monthly-close` step 2; server action extends `executeReconciliation` (P12) with an `annotate` branch.
- **Business-rule execution:** `≥ 10` character minimum is a validation rule of this story (no numbered BR; Business Rules row = —). Tolerance comparison reuses the `GroupConfig.config` tolerance from US-044. Period-lock pre-flight runs before write.
- **Multi-tenancy / audit:** org-scoped via RLS; annotation emits an `AuditLogEntry` capturing actor, prior/new `resolution_kind`, and the note, in the same transaction as the update.

## Test Strategy
- Unit: reason-length validation (9 vs 10 chars boundary); `resolution_kind` transition to `annotated_acceptance`.
- Integration: annotate an out-of-tolerance cycle → assert `resolution_note` persisted, CTA enabled; assert annotation on a locked period is rejected.
- Integration: injected audit-table failure rolls back the annotation (NFR-SEC-04).

## Dependencies
- `Blocked By` row is `—`; scope prerequisite US-044 (declared-balance entry + discrepancy detection) creates the `ReconciliationCycle` this story annotates and is the functional upstream.
