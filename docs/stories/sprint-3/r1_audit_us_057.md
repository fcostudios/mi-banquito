# US-057: Treasurer searches Historial by member kind and date range

> **Sprint 3** | **P0** | **3 SP** | **R1** | FEAT-057

## User Story

As a treasurer, I want to filter the Historial by member, action kind, and date range, so that dispute resolution is fast.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-057 |
| Feature | FEAT-057 — Treasurer searches Historial by member kind and date range |
| Sprint | Sprint 3 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant audit |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-056 |
## Acceptance Criteria

- [ ] AC-1: SCR-history exposes three filters: **member** (autocomplete over the org's members), **action kind** (dropdown of human-readable Spanish categories), and a **date range**.
- [ ] AC-2: Filters **compose** (AND) and narrow the narrated `AuditLogEntry` list in place, preserving the date-descending order and narration from US-056.
- [ ] AC-3: Filter state **syncs to the URL** (query params) so a filtered view is **shareable**/bookmarkable; loading the URL re-applies the same filters.
- [ ] AC-4: The **action-kind dropdown** lists human-readable categories (mapping the underlying `action_kind` values to Spanish labels), not raw enum codes.
- [ ] AC-5: Member autocomplete and all filtered queries are **org-scoped** (RLS, US-072) — only the active org's members and audit rows are searchable; an empty result set renders an explicit "sin resultados" state.
- [ ] AC-6: Filtering is **read-only** (no mutation, no audit write for performing a search) and operates on the append-only `AuditLogEntry` table.

## Technical Notes
- **Data model:** queries append-only `AuditLogEntry` filtered by member FK, `action_kind` category, and `created_at` range; reads `Member` for the autocomplete. No migration.
- **API / surface:** extends the SCR-history route with URL-synced search params; server component re-queries on param change; reuses the US-056 narration registry and the human-readable category mapping for the kind dropdown.
- **Business-rule execution:** none — filtered read only.
- **Multi-tenancy / audit:** org-scoped reads (RLS + app predicate); member autocomplete scoped to the active org.

## Test Strategy
- Unit: composed (member + kind + date) filter produces the correct SQL predicate; URL <-> filter-state round-trips losslessly; action-kind labels map to the right categories.
- Integration: seed audit rows across members and two orgs; assert each filter narrows correctly, combined filters AND, org isolation holds, and a no-match query renders the empty state.

## Dependencies
- Blocked By: — (none declared). Depends on US-056 (the Historial narration screen and `action_kind` template/category mapping this story filters) per the scope Prerequisites.
