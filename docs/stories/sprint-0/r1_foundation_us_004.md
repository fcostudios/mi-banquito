# US-004: Provision Auth0 tenant with Organizations and FcoStudios org

> **Sprint 0** | **P0** | **5 SP** | **R1** | FEAT-004

## User Story
As an operator, I want an Auth0 tenant with the Organizations feature and a seeded FcoStudios org, so that treasurers can log in and tenants are isolated at the identity provider.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-004 |
| Feature | FEAT-004 — Provision Auth0 tenant with Organizations and FcoStudios org |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-002 |
## Acceptance Criteria
- [ ] AC-1: An Auth0 tenant is created.
- [ ] AC-2: The Organizations feature is verified as available on the selected plan; if not free, the OQ-ARCH-2 fallback (single-tenant + app-level org scoping) is documented in the story before build proceeds.
- [ ] AC-3: A FcoStudios Auth0 organization is seeded.
- [ ] AC-4: A passwordless email connection is enabled on the tenant (consumed by US-015's magic-link flow).
- [ ] AC-5: An Auth0 Application (regular web app) is registered with the Vercel production + preview callback URLs allow-listed.
- [ ] AC-6: The `org_id` claim is configured to be emitted in the session/token so middleware (US-011) can extract it.

## Technical Notes
- **Data model / infra:** Auth0 tenant + Organizations + FcoStudios org. No app DB rows; the `org_id` from Auth0 maps to the Postgres RLS session variable in US-011.
- **API / surface:** Auth0 Application config (client id/secret, callback/logout URLs). Secrets land in env config (US-006). No app routes here (US-015 adds the catch-all route).
- **Business-rule execution:** None.
- **Multi-tenancy / audit:** Auth0 Organizations is the IdP-side tenant boundary. OQ-ARCH-2 open question must be resolved (free-tier availability) before depending on it; fallback path documented.

## Test Strategy
- Confirm a test login against the FcoStudios org issues a session carrying the `org_id` claim.
- Verify the passwordless email connection is enabled.
- Document the OQ-ARCH-2 verification result (free-tier confirmed or fallback selected).

## Dependencies
- US-002 — Vercel production/preview URLs are needed to register Auth0 callback allow-list (scope Prerequisite: US-002). Depends on resolving OQ-ARCH-2 (Auth0 Organizations free-tier verification).
