# US-081: Operator views cron run history and triggers manual replay

> **Sprint 2** | **P0** | **2 SP** | **R1** | REVIEW_F20

## User Story
As an Operator, I want to see what happened on each cron run and replay a run when needed, so that missed accruals or treasurer-compensation runs are recoverable.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-081 |
| Feature | REVIEW_F20 — Operator views cron run history and triggers manual replay |
| Sprint | Sprint 2 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## Acceptance Criteria
- [ ] AC-1: `/admin/cron-runs` renders a table grouped per cron endpoint and, per run, shows timestamp, duration, number of orgs processed, failure count, and the end-of-run summary.
- [ ] AC-2: Each run row exposes a "Replay with from_date / to_date" action that calls the corresponding cron Route Handler with the bearer auth token and the chosen date range.
- [ ] AC-3: A replay is idempotent end-to-end — replaying the accrual cron (US-038) over an already-processed range posts no duplicate `InterestAccrual` or `LoanFee(mora)` rows (the cron's UNIQUE guards hold).
- [ ] AC-4: The replay action is recorded in the audit log (who triggered it, which endpoint, which date range, the resulting summary).
- [ ] AC-5: The screen and the replay action are operator-role-gated; a non-operator receives 403; cron run records are read-only from the UI (no destructive edits).

## Technical Notes
- **Data model:** a cron-run history record per run (endpoint, started_at, duration, orgs_processed, failures, summary) — read by `/admin/cron-runs`. New migration per HR-25 timestamp-slug if a `cron_run` table is introduced.
- **API / surface:** `/admin/cron-runs` screen (read) + a replay action that re-invokes the bearer-authenticated cron Route Handlers (e.g. `/api/cron/accrue-interest`) with `from_date` / `to_date`.
- **Business-rule execution:** no new BR (Meta `Business Rules` = `—`); idempotency is inherited from the target cron's UNIQUE constraints (US-038), not re-implemented here.
- **Multi-tenancy / audit:** this is a platform-operator surface (cross-org); the replay action and its parameters are audit-logged; cron-run history is read-only in the UI.

## Test Strategy
- Integration: `/admin/cron-runs` lists runs per endpoint with the recorded fields; a replay re-invokes the cron with the bearer token + date range and writes an audit row.
- Idempotency: a replay over a processed range yields zero duplicate accrual/mora rows.
- Access: a non-operator is rejected (403) from both the page and the replay action.

## Dependencies
- Blocked By: — (none declared). Prerequisites from scope: US-012 (cron substrate), US-038 (the accrual cron being replayed), US-050.
