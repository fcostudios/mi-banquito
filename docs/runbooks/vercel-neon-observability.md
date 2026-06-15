# Vercel, Neon, Blob, Sentry, and Better Stack Runbook

## Vercel

- Project type: Next.js
- Team: `francisco-lomas-projects` (`team_4KfKicNz7MwKf9J47l6UxlTD`)
- Project: `mi-banquito` (`prj_QMN7SAslw9mlL8C5JqLXOBrQI8hJ`)
- Build command: `pnpm build`
- Install command: `pnpm install --frozen-lockfile`
- Config file: root `vercel.json`
- Cron config in root `vercel.json`:
  - `/api/cron/accrue-interest` at `0 5 * * *`
  - `/api/cron/award-treasurer-compensation` at `0 6 * * *`
  - `/api/cron/drift-check` at `0 7 * * *`
- Deployment protection is enabled for preview deployments. Plain unauthenticated
  `curl` receives Vercel `401`; use an authenticated browser session or
  `npx vercel curl <path> --deployment <deployment-id>` from this linked repo.
  In Vercel CLI `54.14.0`, do not pass `--scope` to `vercel curl`; it is forwarded
  to underlying `curl` and fails.
- Current useful preview URLs:
  - One-off deployment URL verified by the user:
    `https://mi-banquito-4z3m8n9ys-francisco-lomas-projects.vercel.app`
  - Stable branch alias used by Auth0 callbacks:
    `https://mi-banquito-git-feature-sprint0-0bcb24-francisco-lomas-projects.vercel.app`
- Latest verified protected preview smoke:
  - `GET /` -> `200`
  - `GET /api/health` -> `{"status":"ok"}`
  - `GET /auth/login` -> `307` to Auth0 authorize URL
- Production envs configured in Vercel:
  - `DATABASE_URL`
  - `DB_DRIVER=neon`
  - `NEXT_PUBLIC_API_URL`
  - `APP_BASE_URL`
  - `AUTH0_DOMAIN`
  - `AUTH0_CLIENT_ID`
  - `AUTH0_CLIENT_SECRET`
  - `AUTH0_SECRET`
  - `AUTH0_ORGANIZATION`
  - `CRON_SECRET`
- Branch-specific preview envs configured for
  `feature/sprint0/foundation-completion`:
  - `DATABASE_URL`
  - `DB_DRIVER=neon`
  - `NEXT_PUBLIC_API_URL`
  - `APP_BASE_URL`
  - `AUTH0_DOMAIN`
  - `AUTH0_CLIENT_ID`
  - `AUTH0_CLIENT_SECRET`
  - `AUTH0_SECRET`
  - `AUTH0_ORGANIZATION`
  - `CRON_SECRET`
- Still missing envs until US-005 resources exist:
  - `SENTRY_DSN`
  - `NEXT_PUBLIC_SENTRY_DSN`
  - `VERCEL_BLOB_READ_WRITE_TOKEN`
- Local PWA verification:
  - Lighthouse `11.7.1` PWA category score: `1.00`
  - Lighthouse `13.x` no longer exposes the legacy `pwa` category; use 11.x
    for the Sprint 0 acceptance check as written.

## Neon

- Project: `mi-banquito` (`cool-shape-96550274`)
- Database: `neondb`
- Role used for app/migrations: `neondb_owner`
- Production branch: `production` (`br-bold-cake-aiq95mz3`)
- Manual preview branch for `feature/sprint0/foundation-completion`:
  `preview/feature-sprint0-foundation-completion` (`br-summer-bird-ai0g8tui`)
- Target strategy: one database branch per Vercel preview/PR.
- Required schema command before acceptance: `cd packages/db && node scripts/apply-local-schema.mjs && node scripts/verify-schema.mjs` against the target database URL.
- Current schema verifier expectation: 34 tables, 29 RLS tables, 29 forced RLS
  tables, 29 policy tables, 14 trigger tables, and 5 `updated_at` trigger
  tables. Forced RLS is intentional because the app role may be a table owner
  locally/under Neon role ownership, and tenant policies must still apply.

## Auth0

- The app is a Next.js server-rendered web app using `@auth0/nextjs-auth0`.
- Auth0 must allow callbacks/logout URLs for both stable Vercel branch aliases
  and any one-off deployment URL used for manual testing.
- Callback URL currently observed in deployed login redirects:
  `https://mi-banquito-git-feature-sprint0-0bcb24-francisco-lomas-projects.vercel.app/auth/callback`
- User also added the one-off deployment URL in Auth0:
  `https://mi-banquito-4z3m8n9ys-francisco-lomas-projects.vercel.app`
- Required account-side evidence still pending:
  - passwordless email connection enabled
  - organization exists and matches `AUTH0_ORGANIZATION`
  - Post-Login Action emits the DB UUID claim expected by the app
  - end-to-end magic-link callback establishes an app session

## Vercel Blob

- Store slip photos and generated PDF artifacts.
- Required env name: `VERCEL_BLOB_READ_WRITE_TOKEN`.
- Sprint 0 readiness check: token is configured in Vercel but not used by the no-op scaffold.

## Sentry

- Required envs once enabled:
  - `SENTRY_DSN`
  - `SENTRY_AUTH_TOKEN`
  - `SENTRY_ORG`
  - `SENTRY_PROJECT`

## Better Stack

- Monitor `/api/health`.
- Expected response: HTTP 200 with `{"status":"ok"}`.
