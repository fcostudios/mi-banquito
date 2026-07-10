# US-080: Operator freezes or archives a tenant organization with audit trail

> **Sprint 5** | **P0** | **3 SP** | **R1** | REVIEW_F19

## User Story

As the platform operator, I want to pause or archive a tenant org cleanly, so that the org becomes read-only without data loss.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-080 |
| Feature | REVIEW_F19 — Operator freezes or archives a tenant organization with audit trail |
| Sprint | Sprint 5 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |


## Acceptance Criteria

- [ ] AC-1: An operator lifecycle action at `/admin/orgs/[id]/lifecycle` (section on `SCR-admin-org-detail`) offers `freeze` and `archive`.
- [ ] AC-2: `freeze` sets `Organization.status = paused` — RLS reads remain allowed but all tenant writes are rejected while paused.
- [ ] AC-3: `archive` sets `Organization.status = archived` — paused semantics plus admin-export is available and treasurer login is disabled for that org.
- [ ] AC-4: Both actions require operator-entered reason text; submission without a reason is rejected.
- [ ] AC-5: Both transitions write an `AuditLogEntry` (`created_by_kind = platform_operator`) capturing the prior status, new status, reason, and actor; no tenant data is deleted (read-only, not destructive).
- [ ] AC-6: Write-rejection while paused/archived is enforced server-side (not merely UI-hidden) so queued/offline tenant writes also fail closed.

## Technical Notes
- **Data model:** `Organization.status` enum extended with `paused` and `archived` (alongside the active default). If the enum lacks these values, a timestamp-slug migration per HR-25 (`slug=org_lifecycle_status`). No new table.
- **API / surface:** operator server action behind `/admin/orgs/[id]/lifecycle`; lifecycle section on `SCR-admin-org-detail`. Tenant write path consults `Organization.status` and rejects when `paused`/`archived`.
- **Business-rule execution:** no numbered BR (Business Rules row = —). The governing rules are: paused ⇒ reads-yes/writes-no; archived ⇒ paused + export + login-disabled; reason mandatory. Status check composes with the RLS session var (US-072).
- **Multi-tenancy / audit:** platform-scope operator write that flips a tenant org's status; enforcement is via the status gate layered over RLS. Every transition emits an `AuditLogEntry` in the same transaction.

## Test Strategy
- Integration: `freeze` → tenant read succeeds, tenant write rejected; `archive` → write rejected + treasurer login disabled + export available.
- Unit: reason-required validation; status-transition matrix (active→paused→archived).
- Integration: server-side write rejection holds for a write submitted directly (not via UI), and an `AuditLogEntry` is recorded for each transition.

## Dependencies
- `Blocked By` row is `—`; scope prerequisite US-016 (tenant-org creation — only create existed; this adds the freeze/archive lifecycle). Composes with US-072 (RLS session var) and US-079 (operator bootstrap). Addresses review finding F19.
