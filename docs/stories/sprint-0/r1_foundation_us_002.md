# US-002: Provision Vercel project with custom domain and preview deploys

> **Sprint 0** | **P0** | **5 SP** | **R1** | FEAT-002

## User Story
As an operator, I want a hosted production and preview surface on Vercel with a custom domain, so that every PR is testable in a live environment before it merges.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-002 |
| Feature | FEAT-002 — Provision Vercel project with custom domain and preview deploys |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-001 |
## Acceptance Criteria
- [ ] AC-1: A Vercel project is linked to the GitHub repository.
- [ ] AC-2: A push to `main` produces a production deployment.
- [ ] AC-3: Opening a PR produces a preview deployment with a unique preview URL posted back to the PR.
- [ ] AC-4: A custom domain (`mibanquito.app` or the chosen domain) is attached and resolves to the production deployment.
- [ ] AC-5: HTTPS is served via Vercel-managed TLS on both the custom domain and preview URLs.
- [ ] AC-6: The Vercel build command targets the Turborepo `apps/web` build and uses the pinned package manager from US-001.

## Technical Notes
- **Data model / infra:** Vercel project configured for the monorepo (root directory `apps/web`, build via `pnpm turbo run build`). Production branch = `main`; preview deploys on all other branches/PRs.
- **API / surface:** No app routes added here. Domain DNS records (CNAME/A) point at Vercel. Build output is the Next.js 16 app from US-001.
- **Business-rule execution:** None.
- **Multi-tenancy / audit:** None at this layer.

## Test Strategy
- Verify a production deploy is reachable over HTTPS on the custom domain.
- Open a throwaway PR and confirm an isolated preview URL is generated.
- Confirm the deploy uses the frozen lockfile from US-001 (reproducible builds).

## Dependencies
- US-001 — the monorepo + `apps/web` must exist for Vercel to have a build target (scope Prerequisite: US-001).
