# US-016: Platform operator creates a new tenant organization

> **Sprint 1** | **P0** | **3 SP** | **R1** | FEAT-016

## User Story

As a platform operator, I want to spin up a new banquito tenant in under an hour, so that the < 1-day onboarding KPI is met.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-016 |
| Feature | FEAT-016 — Platform operator creates a new tenant organization |
| Sprint | Sprint 1 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Platform |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-011, US-015 |
## Acceptance Criteria

- [ ] AC-1: `SCR-admin-orgs-new` (route `/admin/orgs/new`) presents a form capturing display name (required), country (default `es-EC`), currency (default `USD`), timezone (default `America/Guayaquil`), default language (`es-EC`), and an optional branding logo upload.
- [ ] AC-2: On submit, a Server Action creates a new `Organization` row, provisions the corresponding Auth0 Organization via the Auth0 Management API (or the single-tenant fallback per OQ-ARCH-2), and seeds `GroupConfig` v1 from platform defaults — all within one transaction so a partial create cannot leave an org without config.
- [ ] AC-3: An `AuditLogEntry` is written for the org-creation action, attributed to the acting `PlatformOperator` (`created_by`), before/with the write (audit-before-action coupling).
- [ ] AC-4: On success the operator is redirected to `SCR-admin-org-detail` for the new org; the new org appears in the `SCR-admin-orgs` list.
- [ ] AC-5: Creation is restricted to the platform-operator role; a tenant treasurer/member cannot reach this surface. The new org's `Organization.id` is a system-generated per-group `uuid` (uuid v4, opaque tenant key — per CHG-010 / ER rule A-ER-2; the Nous project key `fcostudios__mi-banquito` is a build-time substrate identifier held in `nous.db` only, never on the runtime tenant row) and is unique.

## Technical Notes
- **Data model:** writes `Organization` (tenant root; `audit_required: yes`, `has_soft_delete: yes`), one `GroupConfig` v1 row (`org_id` FK, `created_by_kind = platform_operator`), and one `AuditLogEntry`. `created_by` FK → `PlatformOperator.id`. No new migration beyond existing org/config tables.
- **API / surface:** Next.js App Router Server Action behind `/admin/orgs/new`; screens `SCR-admin-orgs` (list), `SCR-admin-orgs-new` (form), `SCR-admin-org-detail`. Auth0 Management API call provisions the Organization (passwordless-ready); fallback to single-tenant org per OQ-ARCH-2.
- **Business-rule execution:** no BR enforced at create time (Meta Business Rules `—`); `GroupConfig` v1 is seeded from defaults and later refined in US-017.
- **Multi-tenancy / audit:** the `Organization` row is the RLS scope root; downstream tenant rows key on its id (`org_id = current_setting('app.current_org')`). Org creation + config seed are audit-logged; `GroupConfig` is HR-1 versioned from v1.

## Test Strategy
- Integration: posting the form creates exactly one `Organization`, one `GroupConfig` v1, one `AuditLogEntry`, and one Auth0 Organization; a forced Auth0 failure rolls back the DB write (no orphan org).
- Unit: form validation (required display name; currency/timezone defaults) and RBAC guard (non-operator rejected).
- Property: created org id is a unique `uuid` (v4) — never a slug/composite string.

## Dependencies
- US-011 — platform operator authentication/identity must exist before an operator can create an org.
- US-015 — platform admin shell / org-list surface (`SCR-admin-orgs`) is the entry point this story redirects from and into.
