# US-020: Platform operator starts read-only impersonation with required reason

> **Sprint 8** | **P1** | **3 SP** | **R1** | FEAT-020

## User Story
As a platform operator, I want to start a read-only impersonation session of a tenant with a required reason, so that I can see the treasurer's UI exactly as she sees it and debug support calls without guessing.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-020 |
| Feature | FEAT-020 — Platform operator starts read-only impersonation with required reason |
| Sprint | Sprint 8 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Platform |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-016 |
## Acceptance Criteria
- [ ] AC-1: `/admin/orgs/[id]/impersonate` (SCR-admin-impersonation) requires a non-empty `reason` text before the session can start; submit is disabled until `reason` is provided.
- [ ] AC-2: On submit, the `startImpersonation` Server Action INSERTs an `Impersonation` row with `mode = read_only`, the target `org_id`, the acting `platform_operator_id`, and the `reason`, and sets a short-lived session cookie carrying `impersonation_id` + target `org_id`.
- [ ] AC-3: The auth middleware switches the DB session — sets `app.current_org` to the target `org_id` and a flag that blocks all writes; every read flows through normal RLS so the operator sees exactly the treasurer's surface.
- [ ] AC-4: Any write attempt during impersonation returns 403 with copy "Impersonation is read-only."
- [ ] AC-5: A persistent banner is shown across all treasurer screens while impersonating; "Salir de impersonación" ends the session, sets `Impersonation.ended_at`, and clears the cookie.
- [ ] AC-6: An `AuditLogEntry` is written at both start (`action_kind = impersonation.started`) and end (`impersonation.ended`), each carrying the `reason` (impersonation requires `reason` per the audit invariant).

## Technical Notes
- **Data model:** Append-only `Impersonation` (`id`, `org_id` = target tenant, `platform_operator_id`, `started_at`, `ended_at` nullable, `reason` NOT NULL, `mode` enum `read_only`). Two `AuditLogEntry` rows per session. No schema change beyond the existing entities.
- **API / surface:** `/admin/orgs/[id]/impersonate` → `startImpersonation` / `endImpersonation` Server Actions; SCR-admin-impersonation start screen + impersonation banner component.
- **Business-rule execution:** No new BR. Read-only enforcement is the `comp_auth_middleware_015` write-block invariant (03b §8 invariant 6); the write-block must be enforced server-side, not only by hiding buttons.
- **Multi-tenancy / audit:** Cross-tenant by nature — `Impersonation.org_id` is the *target*. `reason` is mandatory for audit defensibility; both start and end audit entries are required and an audit-write failure rolls back the originating action.

## Test Strategy
- Integration: start impersonation, attempt a write, assert 403 + "read-only" copy; assert reads return the target tenant's data under RLS.
- Audit assertion: exactly two `AuditLogEntry` rows (started/ended) with the supplied `reason`.
- Validation: empty `reason` is rejected before any row is written.

## Dependencies
- `Blocked By` is `—`. Scope prerequisite US-016 (auth middleware / DB-session role switch) supplies the `comp_auth_middleware_015` machinery this story drives; it is the upstream enabler, not a declared Meta blocker.
