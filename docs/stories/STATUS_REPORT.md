# Sprint 0 Status Report

Generated: 2026-06-29
Closure updated: 2026-07-18

## Summary

The Sprint 0 local foundation gate passes: type-check, lint, unit tests, build, fresh local DB schema push/apply/verification, Playwright smoke tests, Lighthouse PWA, and the adversarial AC audit all pass. This does not mean every Sprint 0 story is officially complete. The story files in `docs/stories/sprint-0/*.md` contain broader acceptance criteria, including Auth0 passwordless callback/session evidence, Sentry, Better Stack, automatic Neon preview lifecycle, and a few manual acceptance items that cannot be honestly marked done from repository evidence alone.

Use `Local Verified` for work proven by this repository and local commands. Use `External Blocked` for work that needs account/project evidence. Use `Partial` when a local substrate exists but the original story still has unmet acceptance criteria.

Durable memory for deferred external work lives in
[`DEFERRED_EXTERNAL_BLOCKERS.md`](DEFERRED_EXTERNAL_BLOCKERS.md). Check that file
before closing Sprint 0 or planning Sprint 1.

## Closure Decision

Sprint 0 is closed as **repository/local foundation complete with accepted
external deferrals**. Do not reopen Sprint 0 for implementation work unless one
of the deferred account/manual-evidence items is explicitly pulled back into an
active sprint. The unresolved account/manual items remain tracked in
`DEFERRED_EXTERNAL_BLOCKERS.md` and `.nous-feedback.jsonl`.

Sprint 1 is closed as **implemented and adversarially re-verified**, with the same Sprint 0
external deferrals still inherited for live Auth0/passwordless, Sentry, Better
Stack, device-install, and Neon-preview evidence. On 2026-07-18 the audit repaired
missing lifecycle/per-AC evidence and fixed real AC gaps in group-rule read-only
mode, contribution capture/confirmation, append-only reversals, and annual
base-fund quota enforcement. The current `apply-local-schema` + `verify-schema`
CI gate passes; the stale literal `drizzle-kit push` sequence in
`DEFINITION_OF_DONE.md` remains inconsistent with migration-only substrate and
is recorded as a repository gate discrepancy rather than a passing check.

## Sprint 0-1 Re-verification — 2026-07-18

- Production deployment `dpl_E4CbDDrtMbkwjLBvLSceC2jc2PrP` is READY and serves
  `https://mi-banquito.vercel.app`; `/api/health` returns HTTP 200 with
  `{"status":"ok"}`, the manifest/icons resolve, and `/auth/login` redirects to
  the configured Auth0 organization/callback.
- GitHub `main` protection requires strict `verify` and `design-system` checks.
  Recent CI/design-system and Vercel preview checks are green.
- `pnpm audit:sprints0-1` now enforces `started`, `build_pass`, and a passing
  `ac_verify` event for every AC on every story carrying a `done` event.
- US-013 AC-5 is now a blocking axe-core browser scan; the former
  `continue-on-error` placeholder was removed.
- US-028 now renders `/grupo` read-only first and enters edit mode only through
  `Editar reglas`.
- US-029 now has partial-name member search, real constrained image capture
  (5 MB input cap, 1024 px long edge), idempotent persistence, and the specified
  inline success confirmation.
- US-030 now exposes a destructive confirmation dialog from contribution rows,
  requires a reason, appends the reversal, suppresses duplicate affordances,
  and refreshes compliance/aging read models.
- US-032 now requires the fiscal-year quota configuration, rejects duplicate
  member/year payments instead of overwriting them, and supports constrained
  optional receipt capture.
- Verification passed: type-check, lint, full workspace tests against Postgres
  (59 DB, 366 domain, 272 web, 5 UI, 2 contracts), webpack production build,
  Playwright 3/3 including axe, and a fresh SQL substrate verification (52
  tables, 47 forced-RLS/policy tables, 42 unique constraints).
- Known gate discrepancy: `drizzle-kit push` alone does not install migration-only
  RLS/views/constraints; running it after committed migrations proposes destructive
  drift and hits a dependent composite FK. CI correctly uses
  `apply-local-schema.mjs` + `verify-schema.mjs`; the documentation/tooling paths
  still need reconciliation.

Sprint 2 is closed as **implemented and locally verified**, with inherited
Sprint 0 external deferrals still active for live Auth0/passwordless and
production-secret evidence. Sprint 2 delivered the loan origination/repayment
vertical slice, contribution source and partial-state realism, cron accrual,
cron-run history/replay, a Sprint 2 closure gate, and Playwright protected-route
guards. Full local verification passed on 2026-06-30:

- `rtk pnpm type-check`
- `rtk pnpm lint`
- `rtk pnpm test`
- `rtk docker start mi-banquito-postgres && rtk pnpm --dir packages/db exec node scripts/apply-local-schema.mjs && rtk pnpm --dir packages/db exec node scripts/verify-schema.mjs`
- `rtk pnpm build`
- `rtk pnpm test:e2e` (26 passed, 2 skipped)

Known non-fatal warning: the Auth0 SDK continues to emit the DPoP dynamic
dependency webpack warning during build/e2e. Authenticated in-app UI rendering
still depends on the inherited live Auth0 session evidence; repository-level
coverage verifies the protected-route, validation, domain, schema, and build
contracts.

Sprint 3 is closed as **implemented and locally verified**, with inherited
external observability blockers still active for live Sentry and Better Stack
resource evidence. Sprint 3 delivered append-only/RLS/period-lock substrate
checks, same-transaction audit rollback, adjustment windows, business-rules
history/CSV, narrated history filters, actionable alerts, Sentry redaction code,
and a Sprint 3 closure gate. Local verification passed on 2026-07-03:

- `rtk env CI=true pnpm --filter @mi-banquito/db verify`
- `rtk env CI=true pnpm --filter @mi-banquito/db test -- --run packages/db/src/sprint3-substrate.test.ts packages/db/scripts/verify-schema.test.mjs packages/db/src/tenant.test.ts`
- `rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/audit.test.ts packages/domain/src/alerts.test.ts packages/domain/src/reconciliation.test.ts packages/domain/src/platform-business-rules.test.ts`
- `rtk env CI=true pnpm --filter mi-banquito-web test -- --run src/lib/sentry/redaction.test.ts`
- `rtk env CI=true pnpm --filter mi-banquito-web type-check`
- `rtk env CI=true pnpm --filter mi-banquito-web lint`
- `rtk env CI=true pnpm --filter mi-banquito-web build`
- `rtk env CI=true pnpm -C apps/web exec playwright test e2e/sprint3.spec.ts`
- `rtk node scripts/sprint3-closure-gate.mjs`

## Story Status

| Story | Status | Evidence | Remaining Work |
|---|---|---|---|
| US-001 | Local Verified | Turborepo, package scripts, lockfile, type-check/lint/test/build all pass. | Official story can be marked done after team accepts local evidence. |
| US-002 | Verified / Custom Domain Decision Pending | Vercel project `prj_QMN7SAslw9mlL8C5JqLXOBrQI8hJ` exists; production deployment `dpl_E4CbDDrtMbkwjLBvLSceC2jc2PrP` is READY; production aliases include `mi-banquito.vercel.app`, `mi-banquito-francisco-lomas-projects.vercel.app`, and the git-main alias; production `/api/health` returns `{"status":"ok"}`; `/auth/login` redirects to Auth0 with the stable production callback. | Confirm whether the Vercel domain satisfies the story or a separate custom domain is required. |
| US-003 | Verified / Auto Preview Strategy Pending | Neon project `cool-shape-96550274` exists; production branch `br-bold-cake-aiq95mz3` and manual preview branch `br-summer-bird-ai0g8tui` both have read-write computes. Fresh local Docker DB schema push/apply/verify passes. | Confirm automatic per-PR Neon branch lifecycle and 7-day cleanup strategy. |
| US-004 | Partial / Auth0 Redirect Verified | Auth0 app config documented; production `GET /auth/login` redirects to the real Auth0 tenant with organization `org_Chul6oWgE2ZzCNvE` and callback `https://mi-banquito-francisco-lomas-projects.vercel.app/auth/callback`; DB UUID claim mapping tested. | Passwordless connection, account-side Action claim configuration, and full callback/session evidence remain. |
| US-005 | Partial / Blob Verified | Observability/blob runbook exists; `/api/health` is verified; Vercel Blob store `mi-banquito-artifacts` (`store_io0PnZdqgZSFmHEy`) is active, private, linked to the project, and configured for Production, Preview, and Development. | Sentry project/DSN, Better Stack monitor, and env confirmation. |
| US-006 | Repo Verified / Sentry Env Pending | `.env.local` remains ignored; `.env.example` documents Sprint 0 keys; boot-time env validation covers core Auth0/DB/cron/public envs; Vercel Production and branch Preview have `DATABASE_URL`, `DB_DRIVER`, `NEXT_PUBLIC_API_URL`, `APP_BASE_URL`, `CRON_SECRET`, and `AUTH0_*` configured as encrypted vars; Blob has `BLOB_READ_WRITE_TOKEN` configured in Production, Preview, and Development. | `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` remain pending because the Sentry resource is not provisioned. |
| US-007 | Local Verified With Deviation | App Router shell renders; role-scoped nav tests and Playwright pass. | Original `app/(treasurer)` and `app/(admin)` route-group wording is intentionally deferred/accepted as a deviation. |
| US-008 | Verified / Deeper Substrate Pending | Verifier asserts 34 tables, 29 RLS tables, 29 forced RLS tables, 29 policy tables, 14 trigger tables, and 5 `updated_at` trigger tables locally. A non-superuser RLS test proves org A cannot read org B rows through the tenant transaction helper. | Deeper behavior for append-only/audit/period-lock remains later substrate stories. |
| US-009 | Local Verified With Deviation | `packages/ui` token projection is tested against canonical `packages/design-system/tokens.json`; lint passes. | Original duplicate `tokens.v1.json`/strings/icon allow-list paths are accepted as a deviation, not implemented literally. |
| US-010 | Local Verified / Manual Install Pending | App Router manifest, 192/512/apple icons, token-sourced theme color, Serwist `sw.js`, Playwright icon/service-worker checks, mobile shell test, and Lighthouse 11 PWA score `1.00` pass. | Real-device Android prompt and iOS Add-to-Home-Screen confirmation remain manual acceptance evidence. |
| US-011 | Local Verified / Auth0 E2E Pending | Namespaced Auth0 tenant/role claim helper tested; unauthenticated tenant query path redirects before DB query; `withTenantTransaction` sets `app.current_org_id`; cross-tenant RLS behavior test passes under a non-superuser role. | Full Auth0 session-to-DB-request E2E remains pending with passwordless login. |
| US-012 | Production Verified | Root `vercel.json` schedules the production cron routes; deployed config includes them; unauthenticated requests return `401`; on 2026-07-02 an authenticated accrue-interest invocation returned HTTP 200 with a successful summary. | None for the Sprint 0 cron acceptance item. |
| US-013 | GitHub/Axe Gate Verified / Neon PR Dry-Run Pending | `main` is protected with strict required checks `verify` and `design-system`, admin enforcement, linear history, and conversation resolution. Type-check/lint/test/frozen-lockfile gates run, and axe-core now scans key authenticated screens as a blocking Playwright check. | Real Neon preview migration dry-run remains pending because CI currently verifies against local Postgres, not a per-PR Neon branch. |
| US-014 | Local Verified | BR-01 declining-balance rule has a golden fixture at `packages/domain/rules/__fixtures__/BR-01__1000_4pct_10mo_with_admin_fee.json`; property-style invariants run in `pnpm test`. | Deliberate mutation check remains a review exercise, not a committed failing test. |
| US-015 | Partial / Auth0 Redirect Verified | Auth0 SDK route mounts locally and on deployed preview; `/auth/login` returns a real Auth0 authorize redirect. | Real magic-link passwordless email flow, callback session establishment, expiry handling, and treasurer-email E2E verification remain. |

## Accepted Deviations

- US-007: The app keeps the current `app/(authenticated)` route group with nested admin paths instead of splitting into `app/(treasurer)` and `app/(admin)` during Sprint 0. The current route generation, Auth0 session proxy, and navigation map already target this structure; role scope is enforced in shell navigation.
- US-009: `packages/design-system/tokens.json` remains the canonical token source. `packages/ui` exports a typed token projection for package consumers and tests it against the canonical source instead of duplicating a second locked token JSON file.

## External Blockers

- US-002: Vercel project exists, production deployment is READY, production aliases are assigned, env vars are configured, and protected production/preview smoke passes. Only the separate custom-domain decision remains.
- US-003: Neon project exists and schema verifies; a manual preview branch exists for this feature branch, but automatic per-PR branch automation/strategy still needs confirmation.
- US-005: Vercel Blob is provisioned and linked; Sentry and Better Stack
  project details remain external to the repository.

## Sprint 0 Full Verification Checklist

These are the remaining items needed before every Sprint 0 story can honestly be marked fully verified:

| Story | Needed to mark verified |
|---|---|
| US-001 | Team accepts current scaffold evidence as complete. |
| US-002 | Decide whether `mi-banquito.vercel.app` is acceptable for Sprint 0 or attach/verify a separate custom domain. |
| US-003 | Prove automatic Neon preview branch lifecycle from a real PR/preview deploy, including cleanup policy. |
| US-004 | Capture Auth0 tenant evidence: organization, passwordless email connection, app callback/logout allow-list, and Post-Login Action emitting the DB UUID org claim. |
| US-005 | Provision Sentry and Better Stack; store required Vercel env vars; verify Better Stack hits `/api/health`. |
| US-006 | Add missing `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` once the Sentry resource exists. |
| US-007 | Accept documented route-group deviation or refactor to literal `(treasurer)` and `(admin)` route groups. |
| US-008 | Decide whether Sprint 0 accepts current schema + forced-RLS behavioral verification, or add deeper append-only/audit/period-lock behavior tests now. |
| US-009 | Accept documented token-source deviation or implement literal story file paths for locked tokens/strings/icon allow-list. |
| US-010 | Verify Android install prompt and iOS Add-to-Home-Screen behavior on real devices; offline behavior remains richer than the Sprint 0 shell check. |
| US-011 | Complete real Auth0 session-to-tenant DB request E2E after passwordless login is live. |
| US-012 | Resolved 2026-07-02: authenticated production cron invocation returned HTTP 200. |
| US-013 | Add/confirm PR Neon migration dry-run target if the story requires Neon rather than local Postgres CI verification. |
| US-014 | Review/accept the BR-01 fixture and property-style harness as the Sprint 0 business-rule test gate. |
| US-015 | Complete real Auth0 magic-link/passwordless email E2E through callback/session, including expiry/error handling and treasurer email evidence. |

## Final Local Verification

Original gate passed on 2026-06-29. The 2026-07-18 re-verification passed the
commands below, with the `drizzle-kit push` discrepancy documented above:

- `rtk pnpm type-check`
- `rtk pnpm lint`
- `rtk pnpm test`
- `rtk pnpm build`
- `rtk zsh -lc 'docker exec mi-banquito-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS mi_banquito_closure" -c "CREATE DATABASE mi_banquito_closure" && printf "%s\n" "DATABASE_URL=postgresql://postgres:postgres@localhost:55432/mi_banquito_closure" "DB_DRIVER=pg" > packages/db/.env.local && (cd packages/db && pnpm drizzle-kit push && node scripts/apply-local-schema.mjs && node scripts/verify-schema.mjs); rc=$?; rm -f packages/db/.env.local; exit $rc'`
- `rtk pnpm --filter mi-banquito-web test:e2e --project=chromium-desktop`
- `rtk pnpm dlx lighthouse@11.7.1 http://localhost:3000 --only-categories=pwa --chrome-flags='--headless=new --no-sandbox' --output=json --output-path=/tmp/mi-banquito-lighthouse-pwa-closure.json --quiet`
- `rtk pnpm audit:sprint0`
- `rtk pnpm audit:sprints0-1`
- `rtk pnpm --filter mi-banquito-web exec playwright test --config playwright.movements.config.ts --project=chromium-desktop` (3 passed, including axe)
- fresh DB `node packages/db/scripts/apply-local-schema.mjs && node packages/db/scripts/verify-schema.mjs`

Known non-fatal warning: the Auth0 SDK emits a DPoP dynamic dependency webpack warning.

## Sprint 4 Closure

Sprint 4 is closed as **implemented and locally verified**, with two accepted
forward-dependent deferrals: public verifier PDF-footer embedding waits for the
statement PDF generator, and treasurer compensation monthly-close PDF visibility
waits for the monthly close PDF story. Sprint 4 delivered A/R aging, promise
tracking, promise reminder cron, WhatsApp chase audit attempts, loan
disbursement source, offline queued-write visibility, public hash verification,
liquidity projection, treasurer compensation disbursement, pilot log,
Playwright smoke coverage, and a Sprint 4 closure gate.

## Local Evidence Commands

```bash
rtk pnpm type-check
rtk pnpm lint
rtk pnpm build
rtk zsh -lc 'cd packages/db && node scripts/verify-schema.mjs'
rtk zsh -lc 'curl -s -o /tmp/health.out -w "%{http_code}\n" http://localhost:3000/api/health'
rtk zsh -lc 'curl -s -o /tmp/auth.out -w "%{http_code} %{redirect_url}\n" http://localhost:3000/auth/login'
```
