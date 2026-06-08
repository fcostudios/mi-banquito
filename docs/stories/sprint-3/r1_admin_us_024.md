# US-024: Platform operator views per-org business-rules panel

> **Sprint 3** | **P0** | **2 SP** | **R1** | FEAT-024

## User Story

As a platform operator, I want to see which business-rule values are active for each org and who changed them, so that I can audit rule changes without reading code.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-024 |
| Feature | FEAT-024 — Platform operator views per-org business-rules panel |
| Sprint | Sprint 3 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Platform |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-017 |
## Acceptance Criteria

- [ ] AC-1: Route `/admin/orgs/[id]/business-rules` (SCR-admin-business-rules) renders a dense table of the org's **current `GroupConfig`** values keyed by business-rule field (contribution amount, interest-rate model, share-out formula, safety margin, reconciliation tolerance), one row per BR-XX-governed field.
- [ ] AC-2: For each field the panel shows its **`EntityVersion` history** (per HR-1 / IMP-105): the prior value, new value, `valid_from`/`valid_to`, and the operator/treasurer who made the change (`created_by` + `created_by_kind`), most-recent first.
- [ ] AC-3: A **CSV export** action downloads the current values + change history; column headers and values are stable/ordered so the export is diff-able.
- [ ] AC-4: The panel is **read-only** — it never mutates `GroupConfig`; no business-rule math is computed here (it surfaces stored values only).
- [ ] AC-5: All data is **org-scoped**: the panel only reads the `GroupConfig`/`EntityVersion` rows for the `[id]` org and is gated to platform-operator role; a non-operator session is rejected.
- [ ] AC-6: Opening the panel for an org emits an `AuditLogEntry` (platform-operator read action, per P18) so rule-audit views are themselves auditable.

## Technical Notes
- **Data model:** reads `GroupConfig` (current row) + `EntityVersion` (HR-1 sink: snapshots of `GroupConfig`); no new table. No migration required.
- **API / surface:** Next.js route `/admin/orgs/[id]/business-rules` → server component reading via the org-scoped data layer; introduces `organism.business-rules-panel`; CSV export via a server action / route handler. Screen SCR-admin-business-rules.
- **Business-rule execution:** none executed — this is an audit/read surface over BR-XX field values stored in `GroupConfig.config`. Field-to-BR mapping is config-driven from the `GroupConfig.config` keys.
- **Multi-tenancy / audit:** org-scoped reads enforced by RLS (US-072) + app predicate; platform-operator role required; opening the view writes an `AuditLogEntry`.

## Test Strategy
- Unit: BR-field → table-row mapping renders every governed field; CSV serializer produces stable, ordered output (golden-file on a fixture `GroupConfig` + version chain).
- Integration: seed an org with N `EntityVersion` snapshots, assert the history table and CSV reflect every change with correct actor attribution; assert a non-operator session is denied and another org's config is never visible.

## Dependencies
- Blocked By: — (none declared). Functionally builds on US-017 (GroupConfig editing that produces the `EntityVersion` snapshots this panel reads) per the scope Prerequisites; not a hard blocker in the Meta row.
