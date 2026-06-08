# US-043: System surfaces promise on the promised date as a reminder

> **Sprint 4** | **P0** | **3 SP** | **R1** | FEAT-043

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-043 |
| Feature | FEAT-043 — System surfaces promise on the promised date as a reminder |
| Sprint | Sprint 4 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Backstage alerts |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-041 |
## User Story
As the system, I want to remind the treasurer on the day a promise comes due, so that she doesn't have to remember her follow-ups.

## Acceptance Criteria
- [ ] AC-1: A nightly cron (`/api/cron/promise-reminders`) scans open `Promise` rows where `promised_on ≤ today` and `status = open`, for every org.
- [ ] AC-2: For each matching promise it emits an `Alert` (P17 EmitAlert) that appears in the home-screen bell; the alert is tappable and deep-links to the underlying member / loan / cycle.
- [ ] AC-3: The cron is idempotent — re-running on the same day does not create duplicate alerts for a promise already reminded (dedupe on `(org_id, promise_id, reminder_date)`).
- [ ] AC-4: A kept/broken/closed promise (`status ≠ open`) is skipped; closing a promise stops further reminders.
- [ ] AC-5: Alerts are org-scoped and audited; the cron writes an audit/run record of how many reminders it emitted.

## Technical Notes
- **Data model:** reads `Promise` (US-041); writes `Alert` rows. A UNIQUE dedupe key `(org_id, promise_id, reminder_date)` (add via HR-25 timestamp-slug migration `slug=promise_reminder` if a dedicated reminder ledger is used). No schema change if dedupe is on the `Alert` table.
- **API / surface:** Vercel/platform-agnostic cron route, daily cadence; alerts surface in the bell on SCR-home. No interactive screen of its own.
- **Business-rule execution:** no locked BR; reminder emission is feature logic (P17). Composes with US-041's scheduled reminder.
- **Multi-tenancy / audit:** iterate all orgs, each write `org_id`-scoped; cron run is audited (count emitted) per BR-16.

## Test Strategy
- Unit: selection predicate (`promised_on ≤ today AND status = open`) at date boundaries.
- Golden-file: a fixture of promises (due yesterday/today/tomorrow, open/kept) yields a deterministic set of emitted alerts.
- Integration: second same-day run emits zero new alerts (idempotency); a closed promise produces no reminder.

## Dependencies
- Blocked By: — (no story-level blocker declared). Functional prerequisite per scope: US-041 (a `Promise` with a `promised_on` date must exist for this cron to act on).
