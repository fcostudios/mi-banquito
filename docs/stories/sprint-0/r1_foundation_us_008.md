# US-008: Set up Drizzle initial migration with 29 entity tables RLS triggers materialized views

> **Sprint 0** | **P0** | **8 SP** | **R1** | FEAT-008

## User Story
As an operator, I want the database schema established as the single source of truth via Drizzle, so that the application can read and write entities with the architectural invariants enforced at the DB layer.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-008 |
| Feature | FEAT-008 — Set up Drizzle initial migration with 29 entity tables RLS triggers materialized views |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-003, US-007 |
## Acceptance Criteria
- [ ] AC-1: `packages/db/schema/*` defines all 29 entities — the 22 from `04_er_model.md` plus the 7 added in `09b §6` — as Drizzle table definitions.
- [ ] AC-2: The initial migration applies cleanly to the Neon `main` branch.
- [ ] AC-3: Row-Level Security policies exist on every tenant-scoped table, keyed on the org/session variable consumed by US-011 (`app.current_org`).
- [ ] AC-4: Append-only triggers are installed on the 5 ledger tables (block UPDATE/DELETE).
- [ ] AC-5: A period-lock trigger prevents writes into a closed accounting period.
- [ ] AC-6: The audit-before-action pattern is wired so mutations record an audit row before the action commits.
- [ ] AC-7: All seven materialized views exist: `mv_member_compliance_state`, `mv_ar_aging`, `mv_liquidez_proyectada`, `mv_member_time_weighted_balance`, `mv_interest_gains_per_fiscal_year`, `mv_base_fund_pool_per_fiscal_year`, `mv_available_capital`.
- [ ] AC-8: The migration is verified on a Vercel preview branch per PR (dry-run/apply in CI, US-013).
- [ ] AC-9: Idempotency: re-running migrations against an up-to-date branch is a no-op.

## Technical Notes
- **Data model / infra:** Drizzle schema in `packages/db`. Migrations use HR-25 timestamp-slug filenames `V<UTC-yyyyMMddHHmmss>__<slug>.sql` (never a raw `Vxxx`); declare the slug in this story's build artifacts (e.g. `slug=initial_schema`). 29 tables = 22 (`04_er_model.md`) + 7 (`09b §6`). RLS, append-only ledger triggers, period-lock trigger, audit-before-action, and the 7 materialized views are all part of this migration set.
- **API / surface:** `packages/db/schema/*`, `packages/db/migrations/*`, Drizzle config, and a typed DB client exported for Server Actions/Components. No app routes.
- **Business-rule execution:** No BR computation here, but this story installs the DB-layer enforcement (RLS, append-only ledger immutability, period lock) that downstream business rules rely on as their bottom safety layer.
- **Multi-tenancy / audit:** RLS on every tenant table is the in-DB tenant boundary; it pairs with US-011's session variable. Append-only + audit-before-action give a tamper-evident ledger.

## Test Strategy
- Migration apply test on a fresh Neon branch (clean apply + idempotent re-run).
- RLS integration test: a query without `app.current_org` set, or set to another org, returns zero tenant rows.
- Trigger tests: UPDATE/DELETE on a ledger table is rejected; a write into a locked period is rejected; an audit row is written before the action.
- Materialized-view smoke: each of the 7 views is creatable and refreshable.

## Dependencies
- US-003 — the Neon database (and preview branches) must exist to apply migrations against (scope Prerequisite: US-003).
- US-007 — the App Router shell consumes the `packages/db` client this story exports (scope Prerequisite: US-007).
