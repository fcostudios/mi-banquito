# US-008 Neon Schema Closure Design

**Date:** 2026-07-19  
**Story:** US-008  
**Status:** Awaiting written-spec review

## Goal

Close the three failed US-008 acceptance checks without changing or regressing
the already validated Sprint 8 application behavior:

- make tenant policies fail closed when `app.current_org_id` is missing or empty;
- add the required `mv_interest_gains_per_fiscal_year` materialized view; and
- verify every trusted pull request against an isolated Neon child branch.

All changes are additive timestamp migrations or CI/schema-verifier changes. No
existing migration is edited, and no application route or Sprint 8 business flow
is changed.

## Schema Design

### Fiscal-year interest-gains view

Add an existing-view declaration to `packages/db/src/schema.ts` and an immutable
timestamp migration that creates `mv_interest_gains_per_fiscal_year`.

The view produces one row per organization and fiscal year:

- `org_id`
- `fiscal_year`
- `interest_gains` as `NUMERIC(18,4)`
- `currency_code`
- `refreshed_at`

`fiscal_year` is derived from `interest_accrual.accrued_on` using the active
organization `group_config.fiscal_year_start_month` and
`fiscal_year_start_day`. The active configuration is the current row
(`valid_to IS NULL`), with the latest `valid_from` winning defensively. The
organization currency is authoritative; accrual rows are tenant-scoped by
`org_id` before aggregation.

A unique index on `(org_id, fiscal_year)` makes refreshes and lookups
deterministic. Empty organizations produce no synthetic gain row.

### Fail-closed RLS reconciliation

Add a second immutable timestamp migration that iterates current public base
tables containing `org_id` and recreates each `<table>_tenant_isolation` policy
as:

```sql
USING (
  org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
)
WITH CHECK (
  org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
)
```

The migration also enables and forces RLS for every affected table. Missing or
empty context therefore returns zero rows instead of raising `22P02`; a valid
tenant context still permits only matching rows.

### Additive repair path

Extend `apply-local-schema.mjs` with a narrow repair branch for a database whose
only missing committed objects are the new view/index and/or whose tenant-policy
definitions need reconciliation. That branch applies the two new migrations and
then re-runs schema health verification. It must not replay the complete historic
migration stream against an existing production-derived database.

Extend schema health verification to require the exact
`mv_interest_gains_per_fiscal_year` object and unique index, and to inspect every
tenant policy definition for the fail-closed `NULLIF` expression and a matching
`WITH CHECK` clause. Policy counts alone are not sufficient evidence.

The second invocation must leave an identical catalog and pass verification,
satisfying migration idempotency at the schema-contract level.

## Pull-request Neon CI

Use Neon’s official `neondatabase/create-branch-action@v6` inside the existing
`verify` job for trusted `pull_request` events.

- Parent: default production branch.
- Name: `ci/pr-<number>-<commit-sha>`.
- Expiry: 24 hours, providing automatic cleanup even if a workflow is cancelled.
- Database/role: `neondb` / `neondb_owner`.
- Inputs: repository variable `NEON_PROJECT_ID`; repository secret
  `NEON_API_KEY`.
- Security: do not expose Neon credentials to forked pull requests; the normal
  local-Postgres verification remains active for those PRs.

The Neon step uses the action’s masked `db_url` output to:

1. apply the additive/full schema reconciliation appropriate to the inherited
   branch state;
2. run `verify-schema.mjs`;
3. on this disposable branch only, grant the repository's RLS test role to the
   branch owner so the tests can execute `SET ROLE` without weakening table
   policies;
4. run the tenant and substrate PostgreSQL integration tests;
5. apply and verify a second time to prove idempotency.

The existing local Postgres service remains the primary full-suite database so
Sprint 8 test behavior and CI latency remain stable. Neon is an additional
migration/tenant-boundary gate, not a replacement.

## Test Design

Testing follows repository TDD rules and uses real PostgreSQL:

1. First add a failing schema contract that requires the exact view name and
   Drizzle declaration.
2. Add a real-database view test with two organizations and configured fiscal
   boundaries. Values immediately before and on the boundary must land in the
   correct fiscal years, aggregate exactly, retain currency, and never mix
   tenants.
3. Add a failing production-policy contract for `NULLIF` plus `WITH CHECK`, then
   prove missing, empty, correct, and wrong tenant contexts against PostgreSQL.
4. Add a workflow structural check requiring the official action, trusted-PR
   guard, expiring branch, masked connection output, two verify passes, and the
   disposable-branch role bootstrap plus targeted DB tests.
5. Run the complete workspace gate after targeted tests pass.

The view boundary/aggregation test kills mutations to the fiscal comparison,
sum, tenant join, and grouping keys. The RLS tests kill removal of `NULLIF`,
`WITH CHECK`, forced RLS, and tenant equality.

## Rollout and Safety

1. Validate both migrations on a fresh expiring Neon child branch.
2. Compare the child schema with production and inspect the expected view,
   index, and policy-only diff.
3. Present the production SQL impact and obtain explicit confirmation before
   executing production DDL.
4. Apply the timestamp migrations to production in order.
5. Run read-only production catalog checks and adversarial RLS probes through a
   non-owner role.
6. Open or update a trusted PR and require the Neon branch gate to pass.
7. Record all nine US-008 `ac_verify` events, `build_pass`, and plain `done`, then
   pull feedback into Nous.

The production migration does not drop tables or application data. Creating the
materialized view scans `interest_accrual` and briefly takes catalog locks;
policy replacement takes brief table-policy catalog locks. The Neon child run
provides the pre-production rehearsal and rollback reference.

## Account Prerequisites

The Neon MCP connection is authenticated and operational. The local on-demand
Neon CLI is installed through `pnpm dlx` but is not logged in; it starts an OAuth
browser flow. GitHub Actions cannot reuse either interactive session.

Before a live PR gate can run, configure:

- GitHub Actions variable `NEON_PROJECT_ID=cool-shape-96550274`;
- GitHub Actions secret `NEON_API_KEY`, preferably installed through Neon’s
  GitHub integration.

No secret value is stored in the repository or printed by CI.
