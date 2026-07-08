# US-078: Treasurer marks a chase-promise with date + receives a reminder

> **Sprint 7** | **P1** | **3 SP** | **R1** | REVIEW_F5

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-078 |
| Feature | REVIEW_F5 — Treasurer marks a chase-promise with date + receives a reminder |
| Sprint | Sprint 7 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## User Story
As a treasurer, I want to mark "Lucía promised to pay on Friday" with a date and be reminded on that day, so that I don't have to keep promised-payment dates in my head.

## Acceptance Criteria
- [x] AC-1: On a late A/R row the treasurer can record a promise capturing the subject `(member, loan_or_cycle, promised_date, optional_amount)`; `promised_date` is required, `amount` optional.
- [x] AC-2: Recording a promise writes an `Alert` extended with `kind = promise_marked` carrying that subject (Alert-extension pattern per Architect N3).
- [x] AC-3: On the **promised date**, the alert **reappears** in the bell with `severity = medium` (reminder), surfacing the member and the promised amount/date.
- [x] AC-4: The promise outcome is **resolved** either implicitly — by recording a matching contribution/repayment on/after the promised date — or explicitly via a *"no cumplió"* annotation; resolved promises stop reappearing.
- [x] AC-5: The promise + reminder + outcome are first-class and logged (not a transient UI flag): the outcome state is queryable for the collections history.

## Technical Notes
- **Data model:** Extend the `Alert` model with `kind = promise_marked` and a subject payload `(member_id, loan_id|cycle_id, promised_date, amount?)` plus an outcome field (`cumplió` / `no_cumplió` / open). If a new column/enum value is needed, add a timestamp-slug migration per HR-25 (`V<UTC>__alert_promise_kind.sql`, story Meta `slug=alert_promise_kind`) — no raw `Vxxx`.
- **API / surface:** Server Action to mark a promise from a late row (Epic 5 collections, S4 journey); reminder surfaces via the alert bell (SWR poll). Outcome resolution hooks into `RecordContribution`/repayment (implicit) and an explicit annotate action. Emitter path is FEAT-P17 EmitAlert (`comp_alert_engine_009`), new kind.
- **Business-rule execution:** No domain BR — this is a collections workflow on top of the alert engine.
- **Multi-tenancy / audit:** Org-scoped under RLS; promise creation and outcome annotations are audited (P18). Implicit resolution links the resolving contribution/repayment id.

## Test Strategy
- Unit: promise subject validation (required `promised_date`, optional `amount`); outcome state machine (open → cumplió / no_cumplió).
- Integration: mark promise → on promised date the reminder Alert reappears at `severity=medium`; recording a matching payment auto-resolves it; explicit "no cumplió" resolves it.

## Dependencies
- Blocked By row is `—`. Scope prerequisites US-040 (A/R aging tab) and US-041 (mark a promise on a late row) provide the late-row surface; this story (per F5) promotes promise tracking from a US-041 sub-bullet into a first-class promise + reminder + outcome log.
