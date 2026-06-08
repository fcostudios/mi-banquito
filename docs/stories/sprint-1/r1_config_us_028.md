# US-028: Treasurer views and edits group rules read-only first then edits with HR-1 versioning

> **Sprint 1** | **P0** | **2 SP** | **R1** | FEAT-028

## User Story

As a treasurer, I want to see my group's rules and update them when the group votes, so that the system stays aligned with the bylaws.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-028 |
| Feature | FEAT-028 — Treasurer views and edits group rules read-only first then edits with HR-1 versioning |
| Sprint | Sprint 1 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant config |
| Business Rules | BR-02, BR-10 |
| Backstage Process | — |
| Blocked By | US-025 |
## Acceptance Criteria

- [ ] AC-1: `SCR-group-config` (route `/grupo`) shows the **current** `GroupConfig` version's rule values read-only first; an "Editar reglas" action opens an edit form.
- [ ] AC-2: Saving an edit creates a **new `GroupConfig` version** (HR-1): the old version's `valid_to` is set, the new becomes current; no in-place edit of an existing version.
- [ ] AC-3 (BR-02): the editable loan rate value and its period unit are persisted as `GroupConfig.loan_rate_value` / `loan_rate_period_unit`; a rate change applies to NEW loans only — existing loans keep the version stamped at origination (OQ-BR2-1), so the units are never implicitly converted (`monthly × 12 ≠ weekly × 52`).
- [ ] AC-4 (BR-10): the fiscal-year start (`fiscal_year_start_month` 1–12, `fiscal_year_start_day` 1–31; default Jan 1) is editable and validated; downstream fiscal-year binning uses the configured start.
- [ ] AC-5: Every save writes an `AuditLogEntry` (who/when/before-after) and is org-scoped under RLS; existing stamped loans are provably unaffected by the new version.

## Technical Notes
- **Data model:** appends a `GroupConfig` version via the `EntityVersion` sink (HR-1; `requires_versioning: yes`, `audit_required: yes`); each `Loan` retains `group_config_version_at_origination`. Writes `AuditLogEntry`. No `Vxxx` migration.
- **API / surface:** read-only `/grupo` view + "Editar reglas" Server Action on `SCR-group-config`. This is the treasurer-facing twin of the operator `SCR-admin-org-config` (US-017).
- **Business-rule execution:** enforces **BR-02** (configurable rate + period; stamped-at-origination wins per OQ-BR2-1) and **BR-10** (configurable fiscal year; binning computation) at Layer 2 via `comp_business_rule_engine_013` / `loadConfig`. Rule *shape* stays in `packages/domain/rules/*`; this story edits the *values*.
- **Multi-tenancy / audit:** org-scoped under RLS; every edit is HR-1 versioned and audit-logged; runbook R-6 (rule-change rollout) applies — verify `mv_available_capital` / `mv_member_compliance_state` after a change.

## Test Strategy
- Golden file: a rate-change edit produces a new version; an existing loan replays its schedule from the *old* stamped version unchanged.
- Property: `monthly` and `weekly` rates are never implicitly converted; a date spanning Dec 31 → Jan 1 classifies into one fiscal year when `start_month = 1` (BR-10).
- Integration: save creates exactly one new `GroupConfig` version + one `AuditLogEntry`; read-only view shows the current version.

## Dependencies
- US-025 — the first-run wizard (and thus a seeded, confirmed `GroupConfig`) must exist before the treasurer can view/edit group rules.
