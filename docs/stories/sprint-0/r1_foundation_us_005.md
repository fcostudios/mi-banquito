# US-005: Provision Vercel Blob store and Sentry project and Better Stack monitor

> **Sprint 0** | **P0** | **5 SP** | **R1** | FEAT-005

## User Story
As an operator, I want object storage, error tracking, and uptime monitoring provisioned, so that slip photos have a home, runtime errors are visible, and downtime is detected.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-005 |
| Feature | FEAT-005 — Provision Vercel Blob store and Sentry project and Better Stack monitor |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-002 |
## Acceptance Criteria
- [ ] AC-1: A Vercel Blob store is created and a read/write token is issued.
- [ ] AC-2: A Sentry project is created and its DSN is issued (server + client).
- [ ] AC-3: A Better Stack uptime monitor is created and pointed at the `/api/health` endpoint.
- [ ] AC-4: All three tokens/DSNs are recorded for env wiring in US-006 (not committed to source).
- [ ] AC-5: A minimal `/api/health` route returns `200` so the monitor has a target (or is documented as introduced in US-007 with the monitor pointed at it once live).

## Technical Notes
- **Data model / infra:** Vercel Blob (object store for slip/receipt photos referenced by later movement-evidence stories). Sentry (error + performance telemetry). Better Stack (external uptime ping).
- **API / surface:** `BLOB_READ_WRITE_TOKEN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` are the surface; consumed by US-006. Monitor targets `/api/health`.
- **Business-rule execution:** None.
- **Multi-tenancy / audit:** Blob object keys should be namespaced per org when slip uploads land in later stories; observability is platform-wide.

## Test Strategy
- Write/read a test object through the Blob token.
- Trigger a deliberate test exception and confirm it appears in Sentry.
- Confirm the Better Stack monitor reports the health endpoint as up.

## Dependencies
- US-002 — provisioning is scoped to the Vercel project/environments (scope Prerequisite: US-002).
