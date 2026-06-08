# US-011: Set up auth middleware Auth0 session extraction and Postgres RLS session var

> **Sprint 0** | **P0** | **8 SP** | **R1** | FEAT-011

## User Story
As an operator, I want multi-tenant safety as a substrate behavior, so that no Server Action or Server Component can leak data across tenants.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-011 |
| Feature | FEAT-011 — Set up auth middleware Auth0 session extraction and Postgres RLS session var |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-004, US-008 |
## Acceptance Criteria
- [ ] AC-1: `middleware.ts` extracts `org_id` from the Auth0 session.
- [ ] AC-2: The Postgres session variable `app.current_org` is set before any DB query runs in a request.
- [ ] AC-3: The admin role is handled via a separate role/path (documented bypass) rather than silently widening tenant scope.
- [ ] AC-4: An integration test verifies RLS rejects a cross-tenant query (org A's session cannot read org B's rows).
- [ ] AC-5: A request with no valid session is rejected before any tenant-scoped query executes.
- [ ] AC-6: The session variable is set per-connection/transaction so pooled connections cannot leak one tenant's scope into another's query.

## Technical Notes
- **Data model / infra:** No new tables. Consumes the RLS policies and `app.current_org` convention established in US-008; sets the variable via the DB client wrapper so every query inherits the org scope.
- **API / surface:** `middleware.ts`, a DB-client wrapper/helper that runs `SET LOCAL app.current_org = …` (or equivalent) at the start of each scoped transaction. Applies across both `(treasurer)` and `(admin)` route groups (US-007).
- **Business-rule execution:** None directly; this is the enforcement plumbing other rules trust.
- **Multi-tenancy / audit:** This is the core tenant-isolation seam — Auth0 `org_id` → `app.current_org` → RLS. Admin bypass is explicit and auditable.

## Test Strategy
- Integration test: seed two orgs, authenticate as org A, assert queries return only org A rows and that an explicit org-B read returns nothing.
- No-session request is rejected before DB access.
- Pooled-connection test: interleaved requests for different orgs never bleed scope.

## Dependencies
- US-004 — Auth0 must emit the `org_id` claim the middleware extracts (scope Prerequisite: US-004).
- US-008 — RLS policies and the `app.current_org` convention must exist for the session var to enforce anything (scope Prerequisite: US-008).
