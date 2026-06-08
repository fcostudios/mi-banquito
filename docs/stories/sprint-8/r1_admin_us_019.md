# US-019: Platform operator views per-org health snapshot on admin home

> **Sprint 8** | **P1** | **2 SP** | **R1** | FEAT-019

## User Story
As a platform operator, I want to see a per-org health snapshot on the admin home, so that I can spot a struggling tenant at a glance and reach out before they abandon the product.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-019 |
| Feature | FEAT-019 — Platform operator views per-org health snapshot on admin home |
| Sprint | Sprint 8 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Platform |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008, US-011 |
## Acceptance Criteria
- [ ] AC-1: `/admin` (SCR-admin-home) renders a table with one row per organization showing: org name, last activity timestamp, last close date, reconciliation status (green/red), open loans count, A/R total, and a drift status badge.
- [ ] AC-2: Each metric column is sourced from per-org aggregates of the `mv_*` materialized views (not live row scans); the snapshot loads in a single round trip per org set.
- [ ] AC-3: The reconciliation badge renders red when the org has any `reconciliation_status = pending` row in its open period (read-only projection of BR-12 state), green otherwise.
- [ ] AC-4: The page is reachable only by an authenticated `PlatformOperator`; a member/treasurer session is denied and no cross-tenant row data leaks beyond the entitled aggregate counts.
- [ ] AC-5: Each org row links to its detail (`/admin/orgs/[id]`), impersonate (US-020), and export (US-021) actions.

## Technical Notes
- **Data model:** Read-only over per-`org_id` aggregates of the `mv_*` materialized views; no new tables/migrations. `PlatformOperator` supplies the viewer identity.
- **API / surface:** Next.js route `/admin` → `SCR-admin-home`; server-component data fetch joining the per-org aggregate views. No mutations.
- **Business-rule execution:** No new BR authored here. The red/green reconciliation badge is a read-only projection of BR-12's pending-row state; the drift badge mirrors the US-023 cron result.
- **Multi-tenancy / audit:** Operator-only surface, cross-tenant by design but read-only. Aggregates are `org_id`-scoped. A passive view writes no `AuditLogEntry`.

## Test Strategy
- Integration: seed two orgs (one with a pending reconciliation row, one clean) and assert correct badge colors and counts.
- Authorization: member/treasurer session receives 403/redirect at `/admin`.
- Golden-file snapshot of the rendered table given a fixed `mv_*` fixture set.

## Dependencies
- `Blocked By` is `—`. Scope prerequisites US-008 (org/operator foundation) and US-011 (materialized-view metrics) supply the operator identity and the `mv_*` aggregates this snapshot reads — upstream data sources, not declared Meta blockers.
