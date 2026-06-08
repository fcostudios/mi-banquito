# US-001: Initialize Turborepo monorepo with apps/web and 5 packages

> **Sprint 0** | **P0** | **5 SP** | **R1** | FEAT-001

## User Story
As an operator, I want to scaffold the Turborepo monorepo with `apps/web` and five workspace packages, so that all feature work has a defined place to land and shared code is reusable across surfaces.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-001 |
| Feature | FEAT-001 — Initialize Turborepo monorepo with apps/web and 5 packages |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## Acceptance Criteria
- [ ] AC-1: `apps/web` exists as a Next.js 16 application within the workspace.
- [ ] AC-2: Five packages are defined: `packages/db`, `packages/contracts`, `packages/domain`, `packages/ui`, `packages/config`, each with its own `package.json` and TypeScript project reference.
- [ ] AC-3: `turbo.json` declares pipeline tasks `build`, `dev`, `type-check`, `test`, and `lint` with correct `dependsOn`/`outputs` wiring (`build` depends on upstream `^build`).
- [ ] AC-4: `pnpm-workspace.yaml` registers `apps/*` and `packages/*`.
- [ ] AC-5: `pnpm install` completes with no unmet peer-dependency or workspace-resolution errors.
- [ ] AC-6: A clean `pnpm turbo run type-check` resolves all cross-package imports (e.g. `@mibanquito/db`, `@mibanquito/ui`).

## Technical Notes
- **Data model / infra:** No DB tables. Establishes the monorepo root: `turbo.json`, `pnpm-workspace.yaml`, root `package.json` with `packageManager` pinned, shared `tsconfig.base.json` consumed by every package.
- **API / surface:** Workspace package boundaries only. `packages/config` carries the shared TS/ESLint/Tailwind presets that downstream stories (US-009, US-013) consume. No application routes yet (US-007 introduces route groups).
- **Business-rule execution:** None.
- **Multi-tenancy / audit:** None at this layer; tenancy lands in US-008 (RLS) and US-011 (session var).

## Test Strategy
- CI smoke (US-013): `pnpm install --frozen-lockfile` succeeds on a clean checkout.
- `pnpm turbo run type-check lint` passes across all six workspaces.
- Snapshot of the workspace topology (`pnpm turbo run build --dry=json`) confirms the five packages plus `apps/web` are discovered.

## Dependencies
- Root story; no upstream story dependencies (scope Prerequisites: none). Every other Sprint 0 story builds on this scaffold.
