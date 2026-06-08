# US-022: Platform operator views audit bitácora across orgs with dense filters

> **Sprint 8** | **P1** | **2 SP** | **R1** | FEAT-022

## User Story
As a platform operator, I want to view the audit bitácora across all orgs with dense filters, so that I can investigate a dispute or anomaly across tenants and keep a queryable forensic trail.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-022 |
| Feature | FEAT-022 — Platform operator views audit bitacora across orgs with dense filters |
| Sprint | Sprint 8 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Platform |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008 |
## Acceptance Criteria
- [ ] AC-1: `/admin/audit` (SCR-admin-audit) renders a dense table of `AuditLogEntry` rows across all orgs.
- [ ] AC-2: The table supports filters on org, `actor_kind` (`member / platform_operator / system`), `action_kind`, and date range, applied server-side and combinable.
- [ ] AC-3: Each row exposes a raw `payload_snapshot` JSON viewer (the stored state at the action moment).
- [ ] AC-4: The current filtered result set can be exported as CSV.
- [ ] AC-5: The surface is accessible only to an authenticated `PlatformOperator`; the underlying `AuditLogEntry` rows are append-only and never editable from this view.

## Technical Notes
- **Data model:** Read-only over the append-only `AuditLogEntry` table (`org_id` nullable for platform-level entries, `actor_kind`, `action_kind`, `subject_kind/_id`, `payload_snapshot` jsonb, `reason`, `at`). Indexed on `org_id`, `actor_kind`, `action_kind`, `at` to back the filters. No migration.
- **API / surface:** Next.js route `/admin/audit` → `SCR-admin-audit`; server-side query with the filter predicates + a CSV export Server Action over the filtered set.
- **Business-rule execution:** No new BR. The view is the forensic read surface over the audit invariant (every tenant write + every operator action is logged).
- **Multi-tenancy / audit:** Cross-tenant by design (operator-only). The view performs no writes; it does not generate audit entries of its own and never mutates the append-only log.

## Test Strategy
- Integration: seed entries across two orgs and several action kinds; assert each filter narrows correctly and combinations AND together.
- Snapshot: `payload_snapshot` viewer renders the stored JSON verbatim.
- CSV export matches the filtered row set exactly.

## Dependencies
- `Blocked By` is `—`. Scope prerequisite US-008 (org/operator foundation + the audit log being populated) is the upstream enabler; not a declared Meta blocker.
