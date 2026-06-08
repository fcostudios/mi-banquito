# US-013: Set up CI pipeline type-check lint test Drizzle migration check axe a11y

> **Sprint 0** | **P0** | **8 SP** | **R1** | FEAT-013

## User Story
As an operator, I want automated quality gates in CI, so that type errors, lint violations, test failures, broken migrations, and accessibility regressions are caught before merge.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-013 |
| Feature | FEAT-013 — Set up CI pipeline type-check lint test Drizzle migration check axe a11y |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-001 |
## Acceptance Criteria
- [ ] AC-1: CI runs `pnpm type-check` across all workspaces.
- [ ] AC-2: CI runs `pnpm lint`.
- [ ] AC-3: CI runs `pnpm test`.
- [ ] AC-4: CI runs a Drizzle migration dry-run against the PR's Neon preview branch (US-003).
- [ ] AC-5: CI runs an axe-core accessibility test against key screens.
- [ ] AC-6: A PR cannot merge while any CI check is red (branch protection / required checks).
- [ ] AC-7: CI uses the frozen lockfile (`--frozen-lockfile`) for reproducible installs.

## Technical Notes
- **Data model / infra:** No DB. The migration-check step targets the per-PR Neon preview branch from US-003 so it never touches `main`.
- **API / surface:** CI workflow config (Vercel CI / GitHub Actions). Tasks map to the Turborepo pipeline from US-001 (`type-check`, `lint`, `test`). axe-core runs against placeholder/key screens from US-007.
- **Business-rule execution:** None directly; this is the gate that the BR test infrastructure (US-014) plugs its golden-file + property tests into via `pnpm test`.
- **Multi-tenancy / audit:** None.

## Test Strategy
- A deliberately broken PR (type error, lint error, failing test, bad migration, a11y violation) is blocked from merge — one negative case per gate.
- A clean PR passes all gates and is mergeable.
- Confirm `--frozen-lockfile` is enforced.

## Dependencies
- US-001 — the Turborepo task pipeline (`type-check`/`lint`/`test`) that CI invokes must exist (scope Prerequisite: US-001). Operationally consumes US-003's preview branch for the migration dry-run.
