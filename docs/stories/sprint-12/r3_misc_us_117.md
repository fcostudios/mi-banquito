# US-117: (R3+) Admin maintains Country/Institution reference data

> **Sprint 12** | **P1** | **3 SP** | **R3** | — (R3+) Admin maintains Country/Institution reference data

## User Story

As a Platform Operator, I want to add/edit countries + institutions, so that new banks/coops onboard without a migration.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-117 |
| Feature | — (R3+) Admin maintains Country/Institution reference data |
| Sprint | Sprint 12 |
| Priority | P1 |
| Size | 3 SP |
| Release | R3 |
| Domain | misc |
| Business Rules | — |
| Backstage Process | platform admin (R3+) |
| Blocked By | US-116 |

## Acceptance Criteria

- [ ] AC-1: (R3+, deferred) Platform-operator admin screens expose CRUD over `Country` and `Institution` reference tables — create/edit/deactivate a country (name, currency code) and an institution (name, kind, owning country).
- [ ] AC-2: A new institution added via the admin screen becomes immediately selectable on `SCR-accounts` (US-116) without any code change or migration.
- [ ] AC-3: There is **no** treasurer-facing surface for this story — the screens are platform-admin only; treasurers continue to consume the reference data read-only.
- [ ] AC-4: This story is explicitly scoped as R3+ — the data model + Ecuador seed already land in US-116, so US-117 adds only the editing UI; nothing here changes the R1 data model.
- [ ] AC-5: Edits are non-destructive to existing `Account.institution_id` references (an in-use institution cannot be hard-deleted; deactivate hides it from new selection while preserving historical links).

## Technical Notes
- **Data model:** no new entities — reuses `Country` + `Institution` created in US-116; may add a `is_active`/soft-delete flag to `Institution` if not already present (HR-25 timestamp-slug migration, deferred to R3+).
- **API / surface:** platform-admin CRUD endpoints + admin screens for `Country`/`Institution` (R3+ admin shell, not in the R1 treasurer nav map). No nav-map route in R1.
- **Business-rule execution:** none (Business Rules row `—`).
- **Multi-tenancy / audit:** reference data is org-agnostic platform data; edits are operator-scoped and audited; soft-delete/deactivate preserves referential integrity with org-scoped `Account` rows.

## Test Strategy
- Integration test (R3+): operator can create/edit a country + institution; the new institution appears in the `SCR-accounts` selector.
- Referential-integrity test: an in-use institution cannot be hard-deleted; deactivation hides it from new selection but leaves existing `Account.institution_id` intact.
- Authorization test: a treasurer role receives 403 on the admin CRUD endpoints.

## Dependencies
- **US-116** (Blocked By) — defines the `Country`/`Institution` tables and the Ecuador seed; this story only adds the operator editing UI on top, so the reference schema must exist first.
