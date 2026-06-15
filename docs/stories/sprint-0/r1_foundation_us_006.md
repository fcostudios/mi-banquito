# US-006: Configure environment variables for local preview and prod

> **Sprint 0** | **P0** | **5 SP** | **R1** | FEAT-006

## User Story
As an operator, I want a single source of truth for environment variables across local, preview, and production, so that secrets don't leak and previews behave like production.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-006 |
| Feature | FEAT-006 — Configure environment variables for local preview and prod |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-003, US-004, US-005 |
## Acceptance Criteria
- [ ] AC-1: `DATABASE_URL`, `AUTH0_*` (domain, client id, client secret, base URL, secret), `CRON_SECRET`, `SENTRY_DSN`, `BLOB_READ_WRITE_TOKEN`, and `NEXT_PUBLIC_SENTRY_DSN` are set in each environment (local, preview, production).
- [ ] AC-2: `.env.example` is checked into source listing every required key with placeholder values (no secrets).
- [ ] AC-3: `.env.local` is gitignored and never committed.
- [ ] AC-4: A boot-time env validation (e.g. typed env schema) fails fast with a clear message when a required variable is missing.
- [ ] AC-5: Public (`NEXT_PUBLIC_*`) vs server-only variables are correctly partitioned so secrets are never exposed to the client bundle.

## Technical Notes
- **Data model / infra:** No DB. Env values originate from US-003 (`DATABASE_URL`), US-004 (`AUTH0_*`), US-005 (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `BLOB_READ_WRITE_TOKEN`); `CRON_SECRET` is generated here and consumed by US-012.
- **API / surface:** `.env.example` (committed), `.env.local` (gitignored), Vercel project env settings per environment, and a typed-env module (aligns with US-007's `next.config.ts` typed env).
- **Business-rule execution:** None.
- **Multi-tenancy / audit:** No tenant data; secret hygiene only.

## Test Strategy
- CI asserts `.env.example` keys are a superset of variables referenced in code (no undocumented env var).
- Boot with a missing required var and confirm the app fails fast.
- Grep the client bundle to confirm no server-only secret is inlined.

## Dependencies
- US-003 (`DATABASE_URL`), US-004 (`AUTH0_*`), US-005 (Sentry DSN + Blob token) — their issued credentials are the inputs this story wires (scope Prerequisites: US-003, US-004, US-005).
