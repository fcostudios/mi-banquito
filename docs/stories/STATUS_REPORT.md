# Sprint 0 Status Report

Generated: 2026-06-15

## Summary

Sprint 0 is partially scaffolded. The repository builds, local Postgres can run, Auth0 redirects to the tenant, and a worked member slice exists. The Sprint 0 story checkboxes are not yet authoritative because none are marked complete in `docs/stories/sprint-0/*.md`.

## Story Status

| Story | Status | Evidence | Remaining Work |
|---|---|---|---|
| US-001 | Partial | Monorepo exists; first commit exists. | Final Sprint 0 commit and evidence events. |
| US-002 | Pending | No Vercel project evidence. | Configure Vercel app and preview envs. |
| US-003 | Partial local only | Local Docker Postgres exists. | Configure Neon project/branching. |
| US-004 | Partial | Auth0 login redirects to tenant. | Add DB UUID claim mapping and record org setup. |
| US-005 | Pending | No verified Blob/Sentry/Better Stack. | Configure and smoke-check external services. |
| US-006 | Partial | `.env.local` files exist and are ignored. | Validate env examples and required envs. |
| US-007 | Partial | App Router renders. | Resolve route group deviation. |
| US-008 | Partial | 34 tables verify locally. | Verify RLS/policies/triggers and full SQL migration apply. |
| US-009 | Partial | Token files and lint scripts exist. | Reconcile story paths or record deviation. |
| US-010 | Partial | Serwist and manifest exist. | Playwright installability/offline checks. |
| US-011 | Partial | Some protected pages guard session. | Claim helper, DB session var, RLS tests. |
| US-012 | Partial | Cron route checks `CRON_SECRET`. | Define Sprint 0 cron contract and tests. |
| US-013 | Partial | Design-system workflow exists. | Full CI gate. |
| US-014 | Pending | No test runner/test files. | Add Vitest/Playwright/adversarial tests. |
| US-015 | Partial | Auth0 SDK route works. | Verify passwordless or record login-method deviation. |

## Accepted Deviations

- US-007: The app keeps the current `app/(authenticated)` route group with nested admin paths instead of splitting into `app/(treasurer)` and `app/(admin)` during Sprint 0. The current route generation, Auth0 session proxy, and navigation map already target this structure; role scope is enforced in shell navigation.
- US-009: `packages/design-system/tokens.json` remains the canonical token source. `packages/ui` exports a typed token projection for package consumers and tests it against the canonical source instead of duplicating a second locked token JSON file.

## External Blockers

- US-002: Vercel project URLs and environment variable confirmation are external to the repository.
- US-003: Neon project connection details and branch strategy are external to the repository.
- US-005: Vercel Blob, Sentry, and Better Stack project details are external to the repository.

## Final Local Verification

Passed on 2026-06-15:

- `rtk pnpm type-check`
- `rtk pnpm lint`
- `rtk pnpm test`
- `rtk pnpm build`
- `rtk zsh -lc 'cd packages/db && node scripts/verify-schema.mjs'`
- `rtk zsh -lc 'cd apps/web && pnpm test:e2e'`
- `rtk pnpm audit:sprint0`

Known non-fatal warnings: the Auth0 SDK emits a DPoP dynamic dependency webpack warning, and Next dev logs an HMR allowed-origin warning for Playwright's `127.0.0.1` base URL.

## Local Evidence Commands

```bash
rtk pnpm type-check
rtk pnpm lint
rtk pnpm build
rtk zsh -lc 'cd packages/db && node scripts/verify-schema.mjs'
rtk zsh -lc 'curl -s -o /tmp/health.out -w "%{http_code}\n" http://localhost:3000/api/health'
rtk zsh -lc 'curl -s -o /tmp/auth.out -w "%{http_code} %{redirect_url}\n" http://localhost:3000/auth/login'
```
