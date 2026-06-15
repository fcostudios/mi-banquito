# Sprint 0 Status Report

Generated: 2026-06-15

## Summary

The Sprint 0 local foundation gate passes: type-check, lint, unit tests, build, DB schema verification, Playwright smoke tests, Lighthouse PWA, and the adversarial AC audit all pass. This does not mean every Sprint 0 story is officially complete. The story files in `docs/stories/sprint-0/*.md` contain broader acceptance criteria, including real Vercel production/custom-domain policy, automatic Neon preview lifecycle, Auth0 passwordless, and observability resources that cannot be honestly marked done from repository evidence alone.

Use `Local Verified` for work proven by this repository and local commands. Use `External Blocked` for work that needs account/project evidence. Use `Partial` when a local substrate exists but the original story still has unmet acceptance criteria.

## Story Status

| Story | Status | Evidence | Remaining Work |
|---|---|---|---|
| US-001 | Local Verified | Turborepo, package scripts, lockfile, type-check/lint/test/build all pass. | Official story can be marked done after team accepts local evidence. |
| US-002 | Verified / Production Alias Pending | Vercel project `prj_QMN7SAslw9mlL8C5JqLXOBrQI8hJ` exists; latest preview deployment `dpl_7Y2Jy3GZL4NQXDgM65zNWrXpTGhG` is READY; protected preview smoke verifies `/`, `/api/health`, and `/auth/login`. | Unauthenticated CLI access is still blocked by Vercel Deployment Protection (`401`); custom domain, production alias, and public/bypass policy still need confirmation. |
| US-003 | Verified / Auto Preview Strategy Pending | Neon project `cool-shape-96550274` exists; production branch `br-bold-cake-aiq95mz3` and manual preview branch `br-summer-bird-ai0g8tui` are ready. Local Docker flow also works with schema apply/verify/seed. | Confirm automatic per-PR Neon branch lifecycle and 7-day cleanup strategy. |
| US-004 | Partial / Auth0 Redirect Verified | Auth0 app config documented; deployed preview `GET /auth/login` redirects to the real Auth0 tenant with organization and callback URI; DB UUID claim mapping tested. | Passwordless connection, account-side Action claim configuration, and full callback/session evidence remain. |
| US-005 | External Blocked | Observability/blob runbook exists; `/api/health` is verified. | Real Vercel Blob token, Sentry project/DSN, Better Stack monitor, and env confirmation. |
| US-006 | Repo Verified / External Env Pending | `.env.local` remains ignored; `.env.example` documents Sprint 0 keys; boot-time env validation covers core Auth0/DB/cron/public envs; Vercel Production and branch Preview have `DATABASE_URL`, `DB_DRIVER`, `NEXT_PUBLIC_API_URL`, `APP_BASE_URL`, `CRON_SECRET`, and `AUTH0_*` configured as encrypted vars. | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, and `VERCEL_BLOB_READ_WRITE_TOKEN` remain pending because US-005 resources are not provisioned. |
| US-007 | Local Verified With Deviation | App Router shell renders; role-scoped nav tests and Playwright pass. | Original `app/(treasurer)` and `app/(admin)` route-group wording is intentionally deferred/accepted as a deviation. |
| US-008 | Verified / Deeper Substrate Pending | Verifier asserts 34 tables, 29 RLS tables, 29 forced RLS tables, 29 policy tables, 14 trigger tables, and 5 `updated_at` trigger tables locally. A non-superuser RLS test proves org A cannot read org B rows through the tenant transaction helper. | Deeper behavior for append-only/audit/period-lock remains later substrate stories. |
| US-009 | Local Verified With Deviation | `packages/ui` token projection is tested against canonical `packages/design-system/tokens.json`; lint passes. | Original duplicate `tokens.v1.json`/strings/icon allow-list paths are accepted as a deviation, not implemented literally. |
| US-010 | Local Verified / Manual Install Pending | App Router manifest, 192/512/apple icons, token-sourced theme color, Serwist `sw.js`, Playwright icon/service-worker checks, mobile shell test, and Lighthouse 11 PWA score `1.00` pass. | Real-device Android prompt and iOS Add-to-Home-Screen confirmation remain manual acceptance evidence. |
| US-011 | Local Verified / Auth0 E2E Pending | Namespaced Auth0 tenant/role claim helper tested; unauthenticated tenant query path redirects before DB query; `withTenantTransaction` sets `app.current_org_id`; cross-tenant RLS behavior test passes under a non-superuser role. | Full Auth0 session-to-DB-request E2E remains pending with passwordless login. |
| US-012 | Repo Verified / Deployment Pending | Root `vercel.json` schedules `/api/cron/accrue-interest`, `/api/cron/award-treasurer-compensation`, and `/api/cron/drift-check`; all named route handlers reject missing/wrong bearer and accept `CRON_SECRET`. | Redeploy and confirm Vercel accepts/enables the cron config under the current plan. |
| US-013 | Local Verified / External Blocked | GitHub remote is configured, branch is pushed, GitHub Actions CI workflow is added, and local equivalent gate passes. | Required branch protection and real Neon preview migration target remain external. |
| US-014 | Local Verified | BR-01 declining-balance rule has a golden fixture at `packages/domain/rules/__fixtures__/BR-01__1000_4pct_10mo_with_admin_fee.json`; property-style invariants run in `pnpm test`. | Deliberate mutation check remains a review exercise, not a committed failing test. |
| US-015 | Partial / Auth0 Redirect Verified | Auth0 SDK route mounts locally and on deployed preview; `/auth/login` returns a real Auth0 authorize redirect. | Real magic-link passwordless email flow, callback session establishment, expiry handling, and treasurer-email E2E verification remain. |

## Accepted Deviations

- US-007: The app keeps the current `app/(authenticated)` route group with nested admin paths instead of splitting into `app/(treasurer)` and `app/(admin)` during Sprint 0. The current route generation, Auth0 session proxy, and navigation map already target this structure; role scope is enforced in shell navigation.
- US-009: `packages/design-system/tokens.json` remains the canonical token source. `packages/ui` exports a typed token projection for package consumers and tests it against the canonical source instead of duplicating a second locked token JSON file.

## External Blockers

- US-002: Vercel project exists, latest preview deployment is READY, env vars are configured, and protected preview smoke passes. Unauthenticated CLI smoke is blocked by Vercel Deployment Protection (`401`); custom domain, production alias, and public/bypass access policy still need verification.
- US-003: Neon project exists and schema verifies; a manual preview branch exists for this feature branch, but automatic per-PR branch automation/strategy still needs confirmation.
- US-005: Vercel Blob, Sentry, and Better Stack project details are external to the repository.

## Sprint 0 Full Verification Checklist

These are the remaining items needed before every Sprint 0 story can honestly be marked fully verified:

| Story | Needed to mark verified |
|---|---|
| US-001 | Team accepts current scaffold evidence as complete. |
| US-002 | Confirm production alias/custom domain, TLS on that domain, and chosen public/bypass policy for Deployment Protection. |
| US-003 | Prove automatic Neon preview branch lifecycle from a real PR/preview deploy, including cleanup policy. |
| US-004 | Capture Auth0 tenant evidence: organization, passwordless email connection, app callback/logout allow-list, and Post-Login Action emitting the DB UUID org claim. |
| US-005 | Provision Vercel Blob, Sentry, and Better Stack; store required Vercel env vars; verify Better Stack hits `/api/health`. |
| US-006 | Add missing `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, and `VERCEL_BLOB_READ_WRITE_TOKEN` once US-005 resources exist. |
| US-007 | Accept documented route-group deviation or refactor to literal `(treasurer)` and `(admin)` route groups. |
| US-008 | Decide whether Sprint 0 accepts current schema + forced-RLS behavioral verification, or add deeper append-only/audit/period-lock behavior tests now. |
| US-009 | Accept documented token-source deviation or implement literal story file paths for locked tokens/strings/icon allow-list. |
| US-010 | Verify Android install prompt and iOS Add-to-Home-Screen behavior on real devices; offline behavior remains richer than the Sprint 0 shell check. |
| US-011 | Complete real Auth0 session-to-tenant DB request E2E after passwordless login is live. |
| US-012 | Redeploy and verify Vercel accepts the three cron entries under the current plan. |
| US-013 | Create/confirm default `main` branch, branch protection, required checks, and PR Neon migration dry-run target. |
| US-014 | Review/accept the BR-01 fixture and property-style harness as the Sprint 0 business-rule test gate. |
| US-015 | Complete real Auth0 magic-link/passwordless email E2E through callback/session, including expiry/error handling and treasurer email evidence. |

## Final Local Verification

Passed on 2026-06-15:

- `rtk pnpm type-check`
- `rtk pnpm lint`
- `rtk pnpm test`
- `rtk pnpm build`
- `rtk zsh -lc 'cd packages/db && node scripts/verify-schema.mjs'`
- `rtk zsh -lc 'cd apps/web && pnpm test:e2e'`
- `rtk pnpm dlx lighthouse@11.7.1 http://localhost:3001 --only-categories=pwa --chrome-flags='--headless=new --no-sandbox' --output=json --output-path=/tmp/mi-banquito-lighthouse-pwa.json --quiet`
- `rtk pnpm audit:sprint0`

Known non-fatal warning: the Auth0 SDK emits a DPoP dynamic dependency webpack warning.

## Local Evidence Commands

```bash
rtk pnpm type-check
rtk pnpm lint
rtk pnpm build
rtk zsh -lc 'cd packages/db && node scripts/verify-schema.mjs'
rtk zsh -lc 'curl -s -o /tmp/health.out -w "%{http_code}\n" http://localhost:3000/api/health'
rtk zsh -lc 'curl -s -o /tmp/auth.out -w "%{http_code} %{redirect_url}\n" http://localhost:3000/auth/login'
```
