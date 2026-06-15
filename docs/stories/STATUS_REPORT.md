# Sprint 0 Status Report

Generated: 2026-06-15

## Summary

The Sprint 0 local foundation gate passes: type-check, lint, unit tests, build, DB schema verification, Playwright smoke tests, and the adversarial AC audit all pass. This does not mean every Sprint 0 story is officially complete. The story files in `docs/stories/sprint-0/*.md` contain broader acceptance criteria, including real Vercel, Neon, Auth0 passwordless, observability, Lighthouse, cron scheduling, and business-rule fixture work that cannot be honestly marked done from local repository evidence alone.

Use `Local Verified` for work proven by this repository and local commands. Use `External Blocked` for work that needs account/project evidence. Use `Partial` when a local substrate exists but the original story still has unmet acceptance criteria.

## Story Status

| Story | Status | Evidence | Remaining Work |
|---|---|---|---|
| US-001 | Local Verified | Turborepo, package scripts, lockfile, type-check/lint/test/build all pass. | Official story can be marked done after team accepts local evidence. |
| US-002 | Verified / Public Access Pending | Vercel project `prj_QMN7SAslw9mlL8C5JqLXOBrQI8hJ` exists; GitHub integration produced READY preview deployment `dpl_5GsQYNbzGDSi8Hka692x11cTVJNC`; local `vercel build --prod` passes. | Public HTTP smoke is blocked by Vercel Deployment Protection (`401`); custom domain, production alias, env confirmation, and bypass/public access policy still need confirmation. |
| US-003 | Verified / Preview Strategy Pending | Neon project `cool-shape-96550274` exists; default branch `br-bold-cake-aiq95mz3` is reachable. Local Docker flow also works with schema apply/verify/seed. | Confirm per-PR preview branch automation/strategy. |
| US-004 | Partial / External Blocked | Auth0 app config documented; `/auth/login` redirects; DB UUID claim mapping tested. | Real Auth0 tenant/org/passwordless connection and account-side Action configuration evidence. |
| US-005 | External Blocked | Observability/blob runbook exists; `/api/health` is verified. | Real Vercel Blob token, Sentry project/DSN, Better Stack monitor, and env confirmation. |
| US-006 | Local Verified / External Blocked | `.env.local` remains ignored; local seed and env-dependent checks pass without secrets. | Preview/production env values need external Vercel/Auth0/Neon/Blob/Sentry evidence. |
| US-007 | Local Verified With Deviation | App Router shell renders; role-scoped nav tests and Playwright pass. | Original `app/(treasurer)` and `app/(admin)` route-group wording is intentionally deferred/accepted as a deviation. |
| US-008 | Verified / Deeper Substrate Pending | Verifier asserts 34 tables, 29 RLS tables, 29 policy tables, 14 trigger tables, and 5 `updated_at` trigger tables locally and against Neon. | Deeper behavior for append-only/audit/period-lock remains later substrate stories. |
| US-009 | Local Verified With Deviation | `packages/ui` token projection is tested against canonical `packages/design-system/tokens.json`; lint passes. | Original duplicate `tokens.v1.json`/strings/icon allow-list paths are accepted as a deviation, not implemented literally. |
| US-010 | Partial | Manifest and `sw.js` are served; mobile shell Playwright passes. | Install prompt, iOS install UI/docs, Lighthouse PWA score, and offline behavior are not fully verified. |
| US-011 | Partial | Namespaced Auth0 tenant/role claim helper tested; unauthenticated tenant query path redirects before DB query; role nav is tested. | DB transaction/session variable behavior and cross-tenant RLS behavioral tests remain. |
| US-012 | Partial | Secured cron route rejects missing/wrong bearer and accepts correct bearer. | Actual Vercel cron schedules and real job stubs for all named jobs are not complete. |
| US-013 | Local Verified / External Blocked | GitHub remote is configured, branch is pushed, GitHub Actions CI workflow is added, and local equivalent gate passes. | Required branch protection and real Neon preview migration target remain external. |
| US-014 | Partial | Vitest, Playwright, and adversarial evidence audit are active. | Business-rule golden fixtures and property-based tests are not implemented yet. |
| US-015 | Partial / External Blocked | Auth0 SDK route mounts and redirects to tenant. | Real magic-link passwordless email flow, expiry handling, and treasurer-email E2E verification remain. |

## Accepted Deviations

- US-007: The app keeps the current `app/(authenticated)` route group with nested admin paths instead of splitting into `app/(treasurer)` and `app/(admin)` during Sprint 0. The current route generation, Auth0 session proxy, and navigation map already target this structure; role scope is enforced in shell navigation.
- US-009: `packages/design-system/tokens.json` remains the canonical token source. `packages/ui` exports a typed token projection for package consumers and tests it against the canonical source instead of duplicating a second locked token JSON file.

## External Blockers

- US-002: Vercel project exists, GitHub-triggered preview deployment is READY, and TLS responds. Public app smoke is blocked by Vercel Deployment Protection (`401`); custom domain, production alias, env confirmation, and bypass/public access policy still need verification.
- US-003: Neon project exists and schema verifies; per-PR preview branch automation/strategy still needs confirmation.
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
