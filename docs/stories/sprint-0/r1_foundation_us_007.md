# US-007: Set up Next.js 16 App Router with treasurer and admin route groups

> **Sprint 0** | **P0** | **5 SP** | **R1** | FEAT-007

## User Story
As an operator, I want the Next.js 16 App Router shell with treasurer and admin route groups, so that feature stories have a defined surface to drop their screens into.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-007 |
| Feature | FEAT-007 — Set up Next.js 16 App Router with treasurer and admin route groups |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-001 |
## Acceptance Criteria
- [ ] AC-1: Route groups `app/(treasurer)/` and `app/(admin)/` are created.
- [ ] AC-2: Root `app/layout.tsx` sets the document `lang` attribute to Spanish (`es-EC`).
- [ ] AC-3: Each surface has a placeholder home screen that renders without error.
- [ ] AC-4: `next.config.ts` enables the experimental typed-env feature.
- [ ] AC-5: Both route groups build and render under the Next.js 16 App Router in production mode.

## Technical Notes
- **Data model / infra:** No DB. Establishes the App Router directory shape that the navigation map (`07c_navigation_map.json`) routes resolve into; treasurer-facing screens nest under `(treasurer)`, operator/admin under `(admin)`.
- **API / surface:** `app/layout.tsx`, `app/(treasurer)/`, `app/(admin)/`, `next.config.ts`. Placeholder home screens; real screens arrive via feature stories. Also a natural home for the `/api/health` route US-005's monitor targets.
- **Business-rule execution:** None.
- **Multi-tenancy / audit:** Route groups are not the tenant boundary; the middleware (US-011) enforces org scoping across both groups.

## Test Strategy
- `pnpm turbo run build` compiles both route groups.
- Render test confirms `lang="es-EC"` on the root layout.
- Navigate to each placeholder home and assert a 200 render.

## Dependencies
- US-001 — the `apps/web` Next.js application must exist to add route groups (scope Prerequisite: US-001).
