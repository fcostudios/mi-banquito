# US-023: Platform operator views substrate drift status + last-check timestamp

> **Sprint 8** | **P1** | **2 SP** | **R1** | FEAT-023

## User Story
As a platform operator, I want to see the substrate drift status and the last-check timestamp, so that I can file an IMP before tenants are affected by a drift between the spec and the running substrate.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-023 |
| Feature | FEAT-023 — Platform operator views substrate drift status and last-check timestamp |
| Sprint | Sprint 8 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Platform |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-012 |
## Acceptance Criteria
- [ ] AC-1: `/admin/drift` (SCR-admin-drift) shows a drift status badge (green = in sync / red = drift detected).
- [ ] AC-2: The page shows the last-check timestamp of the most recent drift run.
- [ ] AC-3: The raw drift report text is displayed verbatim below the badge.
- [ ] AC-4: A scheduled job `/api/cron/drift-check` (Vercel Cron) runs `nous_package.py drift --strict`, captures its output + exit code, and persists the result (status, timestamp, raw text) that this page reads.
- [ ] AC-5: A clean `drift --strict` exit (code 0) renders green; a non-zero exit renders red and surfaces the failing report section.
- [ ] AC-6: The surface is accessible only to an authenticated `PlatformOperator`.

## Technical Notes
- **Data model:** A small persisted drift-result record (status, `last_checked_at`, raw report text) written by the cron and read by the page. No tenant tables touched; if a new table is introduced it follows HR-25 timestamp-slug migration naming.
- **API / surface:** `/admin/drift` → `SCR-admin-drift`; `/api/cron/drift-check` cron route invoking the `nous_package.py drift --strict` substrate check and storing its output.
- **Business-rule execution:** No tenant BR. The "clean exit code is the green light" contract from the substrate drift detector is the source of truth for the badge.
- **Multi-tenancy / audit:** Platform-level (substrate-wide), not org-scoped; operator-only. A passive view writes no audit entry.

## Test Strategy
- Integration: stub the cron with a clean run → green + timestamp; stub with a non-zero drift run → red + raw report shown.
- Authorization: non-operator session denied at `/admin/drift`.
- The badge state is derived purely from the persisted exit code (no re-interpretation in the view).

## Dependencies
- `Blocked By` is `—`. Scope prerequisite US-012 (substrate/health observability foundation) supplies the persisted-result plumbing this page reads; upstream enabler, not a declared Meta blocker.
