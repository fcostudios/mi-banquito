# Deferred External Blockers

Last updated: 2026-06-30

This file is the durable memory for Sprint 0 work that passed the local repo gate
but still needs external account evidence, manual acceptance, or a product
decision before the related story can be marked fully complete. Do not delete an
item until the evidence is captured in the linked story/status report and the
corresponding `.nous-feedback.jsonl` event is recorded.

## Sprint 0

| Story | Deferred blocker | Evidence needed to close |
|---|---|---|
| US-002 | Custom-domain decision. The Vercel project and production aliases work, but it is not yet decided whether `mi-banquito.vercel.app` satisfies Sprint 0 or a separate custom domain is required. | Product decision plus a production smoke check on the accepted domain. |
| US-003 | Automatic Neon preview branch lifecycle. A Neon project and manual preview branch exist, but per-PR branch creation and cleanup are not proven. | Real PR/preview dry-run showing branch creation, migration/schema verification, and cleanup policy. |
| US-004 | Auth0 account-side configuration and full session evidence. The app redirects to Auth0, but passwordless connection, callback/session, and custom claim evidence are not complete. | Auth0 tenant screenshots/config export plus E2E login evidence proving the DB UUID org claim and session are present. |
| US-005 | Sentry and Better Stack resources are not provisioned. Vercel Blob and `/api/health` are verified. | Sentry project/DSN, Better Stack monitor hitting `/api/health`, and Vercel env vars configured. |
| US-006 | Sentry environment variables are pending. Core Auth0/DB/cron/blob vars are configured. | `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` stored in Vercel after Sentry exists. |
| US-010 | Real-device PWA install checks. Lighthouse PWA passes locally, but Android and iOS install behavior needs manual evidence. | Android install prompt evidence and iOS Add-to-Home-Screen evidence on real devices. |
| US-011 | Auth0 session-to-tenant DB request E2E. Local helper/RLS tests pass, but the live passwordless session path is not proven. | E2E login followed by a tenant-scoped DB-backed request proving org isolation. |
| US-012 | Authenticated production cron invocation. Deployed crons and 401 unauthenticated behavior are verified, but the real production `CRON_SECRET` value is not retrievable from this session. | Invoke a production cron route with the real secret and capture the successful response/log evidence. |
| US-013 | Neon PR migration dry-run. GitHub checks and branch protection are verified, but CI currently verifies against local Postgres rather than a per-PR Neon branch. | CI or manual PR run using a Neon preview branch for schema push/verify. |
| US-015 | Auth0 magic-link E2E. Redirect works, but magic-link email delivery, callback session establishment, expiry handling, and treasurer-email evidence are pending. | Full passwordless email login run with callback/session evidence and expected error-path checks. |

## Accepted Deviations To Reconfirm

These are not external blockers, but they should be explicitly accepted before
Sprint 0 is declared fully closed:

| Story | Deviation | Decision needed |
|---|---|---|
| US-007 | The app uses the current `app/(authenticated)` route group with nested admin paths instead of literal `(treasurer)` and `(admin)` route groups. | Accept the documented route-group deviation or refactor. |
| US-008 | Current schema/RLS verification exists, but deeper append-only, audit, and period-lock behavior is deferred to substrate stories. | Accept current Sprint 0 substrate evidence or expand tests now. |
| US-009 | `packages/design-system/tokens.json` is canonical; no duplicate locked token JSON file was added. | Accept token-source deviation or implement literal story file paths. |
| US-014 | BR-01 fixture and invariant tests exist; deliberate mutation checking remains a review exercise. | Accept the current harness as the Sprint 0 business-rule gate. |

## Sprint 1 Closure Note

Sprint 1 has no additional external blocker list of its own. It is closed with
the Sprint 0 external deferrals still active. The Sprint 1 implementation and UI
closure gates are recorded in `.nous-feedback.jsonl` for US-016, US-017,
US-025, US-026, US-027, US-028, US-029, US-030, US-031, and US-032.

## Sprint 2 Closure Note

Sprint 2 has no new external blocker list of its own. It is closed with the
Sprint 0 external deferrals still active for live Auth0/passwordless evidence,
production cron-secret invocation, and external observability resources. Sprint
2 local verification includes schema verification, domain/web tests, type-check,
lint, build, and Playwright protected-route/cron guards.
