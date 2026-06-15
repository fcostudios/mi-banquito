# Vercel, Neon, Blob, Sentry, and Better Stack Runbook

## Vercel

- Project type: Next.js
- Build command: `pnpm build`
- Install command: `pnpm install --frozen-lockfile`
- Production envs:
  - `DATABASE_URL`
  - `DB_DRIVER=neon`
  - `APP_BASE_URL`
  - `AUTH0_DOMAIN`
  - `AUTH0_CLIENT_ID`
  - `AUTH0_CLIENT_SECRET`
  - `AUTH0_SECRET`
  - `AUTH0_ORGANIZATION`
  - `CRON_SECRET`

## Neon

- Production branch: main production database.
- Preview branch: one database branch per Vercel preview.
- Required schema command before acceptance: `cd packages/db && node scripts/apply-local-schema.mjs && node scripts/verify-schema.mjs` against the target database URL.

## Vercel Blob

- Store slip photos and generated PDF artifacts.
- Required env name: `BLOB_READ_WRITE_TOKEN`.
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
