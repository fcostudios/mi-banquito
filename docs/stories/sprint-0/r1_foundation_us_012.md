# US-012: Set up Vercel Cron config for daily interest and treasurer compensation and drift sweep

> **Sprint 0** | **P0** | **5 SP** | **R1** | FEAT-012

## User Story
As an operator, I want scheduled jobs running on Vercel Cron, so that interest accrual, treasurer compensation, and drift checks happen automatically without manual intervention.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-012 |
| Feature | FEAT-012 — Set up Vercel Cron config for daily interest and treasurer compensation and drift sweep |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-007 |
## Acceptance Criteria
- [ ] AC-1: Cron entries exist (in `vercel.json` or dashboard config) for `/api/cron/accrue-interest` at 05:00 UTC, `/api/cron/award-treasurer-compensation` at 06:00 UTC, and `/api/cron/drift-check` at 07:00 UTC.
- [ ] AC-2: Each cron route is protected by a bearer secret (`CRON_SECRET` from US-006); a request without the correct bearer is rejected.
- [ ] AC-3: The Vercel plan cron limit is verified (OQ-ARCH-1); if the Hobby limit is exceeded, the documented fallback (consolidate into a single dispatcher route, or upgrade) is recorded.
- [ ] AC-4: Each route exists as a stub returning `200` so the schedule is exercisable before the real job logic lands in later stories.
- [ ] AC-5: Idempotency: a cron handler re-invoked for the same day does not double-apply (guard documented; full logic in feature stories).

## Technical Notes
- **Data model / infra:** No new tables. The accrue-interest and compensation jobs will later read/write ledger tables (US-008); this story only wires the schedule + auth.
- **API / surface:** `vercel.json` cron config; route handlers `/api/cron/accrue-interest`, `/api/cron/award-treasurer-compensation`, `/api/cron/drift-check`. Bearer check reads `CRON_SECRET`.
- **Business-rule execution:** None executed here; this is the scheduling substrate that BR-driven jobs (interest accrual, compensation) plug into later.
- **Multi-tenancy / audit:** Cron runs system-wide; per-org iteration and `app.current_org` scoping (US-011) are applied inside the handlers when real logic lands.

## Test Strategy
- Assert the three cron entries with correct paths and UTC schedules.
- Call each route without the bearer and confirm rejection; with the bearer and confirm `200`.
- Document the OQ-ARCH-1 cron-limit verification result.

## Dependencies
- US-007 — the App Router must exist to host the `/api/cron/*` route handlers (scope Prerequisite: US-007). `CRON_SECRET` comes from US-006. Depends on resolving OQ-ARCH-1 (Vercel Hobby cron-limit verification).
