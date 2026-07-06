# US-079: Operator bootstraps the FcoStudios platform organization

> **Sprint 5** | **P0** | **3 SP** | **R1** | REVIEW_F18

## User Story

As the platform operator, I want the FcoStudios platform-org in place with my `auth_subject` linked, so that I can sign in to `/admin` on day one.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-079 |
| Feature | REVIEW_F18 — Operator bootstraps the FcoStudios platform organization |
| Sprint | Sprint 5 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |


## Acceptance Criteria

- [x] AC-1: A one-time seed script at `packages/db/seed/platform-bootstrap.ts` creates the FcoStudios platform organization (Auth0 Organization, or the single-tenant fallback per OQ-ARCH-2), the `PlatformOperator` row for Francisco Lomas with his `auth_subject` linked, and the operator role grant.
- [x] AC-2: The script runs once at first deploy and requires manual confirmation before mutating any state (no silent re-seed).
- [x] AC-3: The script is idempotent — re-running it does not create duplicate `Organization`/`PlatformOperator`/role-grant rows; it detects the existing bootstrap and exits cleanly (addresses F29 idempotency for the Auth0 + DB two-write path).
- [x] AC-4: After a successful run, the linked operator can authenticate and reach `/admin` (the platform-scope surface) with operator role.
- [x] AC-5: The bootstrap writes an `AuditLogEntry` (`created_by_kind = platform_operator` / `system`) recording the seed action and the actor.

## Closeout

Closed in Sprint 5. Verified by `packages/db/seed/platform-bootstrap.ts`, live `/admin` access, and platform org presence in production.

## Technical Notes
- **Data model:** seeds platform-scope rows — `Organization` (the FcoStudios platform org), `PlatformOperator` (Francisco Lomas, `auth_subject`), operator role grant, optional initial `GroupConfig`. No tenant ledger data. These are existing entities from US-008/US-016; no new migration expected.
- **API / surface:** not a screen — a deploy-time seed script (`packages/db/seed/platform-bootstrap.ts`) gated by manual confirmation. Auth0 Organization creation (or single-tenant fallback) resolves under OQ-ARCH-2 / US-004.
- **Business-rule execution:** no numbered BR (Business Rules row = —). The governing constraints are idempotency and one-time + manual-confirmation guards. Bootstrap precedes any tenant org creation (US-016).
- **Multi-tenancy / audit:** platform-scope write (not tenant-RLS-scoped); the operator's `auth_subject` is the root of the operator authz chain. Seed emits an `AuditLogEntry`.

## Test Strategy
- Integration: fresh DB → run script → assert exactly one `Organization` + one `PlatformOperator` with `auth_subject` + role grant; re-run asserts no duplicates (idempotent).
- Integration: post-seed, the operator `auth_subject` resolves to operator role and can reach `/admin`.
- Unit: manual-confirmation gate blocks an unconfirmed run.

## Dependencies
- `Blocked By` row is `—`; scope prerequisites US-004 (Auth0 / auth strategy, OQ-ARCH-2 resolution) and US-008 (schema incl. `Organization`/`PlatformOperator`). This story is the upstream of US-080 (lifecycle) and all tenant-org creation (US-016). Addresses review finding F18.
