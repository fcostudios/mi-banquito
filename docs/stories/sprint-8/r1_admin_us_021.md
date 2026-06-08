# US-021: Platform operator exports tenant data as ZIP with CSVs + PDFs + manifest

> **Sprint 8** | **P1** | **3 SP** | **R1** | FEAT-021

## User Story
As a platform operator, I want to export a tenant's full data as a ZIP of CSVs, PDFs, and a manifest, so that I honor the data-ownership commitment and a tenant can leave with their data.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-021 |
| Feature | FEAT-021 — Platform operator exports tenant data as ZIP with CSVs PDFs manifest |
| Sprint | Sprint 8 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Platform |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008, US-011 |
## Acceptance Criteria
- [ ] AC-1: `/admin/orgs/[id]/export` (SCR-admin-export) triggers a Server Action that streams a single ZIP for the selected org.
- [ ] AC-2: The ZIP contains one CSV per entity: members, contributions, withdrawals, expenses, loans, repayments, interest accruals, base fund quotas, fees, referrals, statements, and the audit log.
- [ ] AC-3: The ZIP includes every `StatementArchive` PDF for the org, plus `manifest.json`, `audit_log.csv`, and a bilingual (es/en) README.
- [ ] AC-4: Every CSV and PDF is strictly scoped to the target `org_id`; no cross-tenant row appears in any artifact.
- [ ] AC-5: The export itself is recorded in the audit log (an `AuditLogEntry` of an `export`/`data.exported` action kind for the acting `PlatformOperator`).
- [ ] AC-6: The export streams (does not buffer the whole archive in memory) so a large tenant does not exhaust the request budget.

## Technical Notes
- **Data model:** Read-only over all `org_id`-scoped tables + `StatementArchive` blobs; writes one `AuditLogEntry`. No new tables/migrations.
- **API / surface:** `/admin/orgs/[id]/export` Server Action returning a streamed `application/zip`; SCR-admin-export is the trigger surface.
- **Business-rule execution:** No new BR. The completeness of the entity list is the data-ownership contract; `manifest.json` declares the included entities + row counts so the export is self-describing and auditable.
- **Multi-tenancy / audit:** Hard `org_id` scoping on every query; the export action writes an audit entry (operator action) so a tenant data extraction is always traceable.

## Test Strategy
- Integration: export a seeded org, unzip, assert each expected CSV exists with the right header + row count and that `manifest.json` matches.
- Isolation test: a second org's rows never appear in the first org's export.
- Audit assertion: exactly one export `AuditLogEntry` written for the operator.

## Dependencies
- `Blocked By` is `—`. Scope prerequisites US-008 (org/operator foundation) and US-011 (the org-scoped tables/statements) provide the data surface the export reads; upstream enablers, not declared Meta blockers.
