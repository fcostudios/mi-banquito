# US-041: Treasurer marks a promise on a late row with a date

> **Sprint 4** | **P0** | **3 SP** | **R1** | FEAT-041

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-041 |
| Feature | FEAT-041 — Treasurer marks a promise on a late row with a date |
| Sprint | Sprint 4 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant collections |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-040 |
## User Story
As a treasurer, I want to mark what a late member promised and when, so that I follow up at the right time without having to remember.

## Acceptance Criteria
- [ ] AC-1: From an SCR-ar-aging row, the action "Marcar promesa" opens a modal with a date picker (default = today + 7 days) and an optional free-text note.
- [ ] AC-2: Confirming inserts a `Promise` record tied to the row's context — `(member_id, loan_id OR cycle_id, promised_on, note, created_by)` — anchored to exactly one obligation source.
- [ ] AC-3: A reminder alert is scheduled for `promised_on` (consumed by the US-043 nightly cron), so the system surfaces the promise on its due date.
- [ ] AC-4: `promised_on` must be today or later; an empty/past date is rejected with an es-EC validation message.
- [ ] AC-5: Marking a promise on a row that already has an open promise updates (or supersedes) it rather than creating a duplicate; the action is org-scoped and recorded.

## Technical Notes
- **Data model:** new `Promise` entity (gap callout in scope; confirm at design-partner walkthrough whether to extend `Alert kind=promise_marked` instead) — `id, org_id, member_id, loan_id?, cycle_id?, promised_on, note?, status (open|kept|broken), created_by, created_at`. Add via HR-25 timestamp-slug migration (`slug=promise`). Exactly one of `loan_id`/`cycle_id` is set (CHECK constraint).
- **API / surface:** server action `MarkPromise(member_id, source_ref, promised_on, note)` invoked from the SCR-ar-aging inline action + modal.
- **Business-rule execution:** no locked BR; promise lifecycle is feature logic. The scheduled reminder is emitted by P17 EmitAlert (variant) and read by US-043.
- **Multi-tenancy / audit:** `org_id`-scoped; the insert is append-only and audited (BR-16 trust spine — every movement audited).

## Test Strategy
- Unit: default date = today + 7; past-date rejection; exactly-one-source CHECK.
- Integration: marking a promise creates the `Promise` row + a reminder due on `promised_on`; re-marking the same row supersedes rather than duplicates.
- Cross-org: a promise created in group A is invisible in group B.

## Dependencies
- Blocked By: — (no story-level blocker declared). Functional prerequisite per scope: US-040 (the A/R aging row is the entry point for the action).
