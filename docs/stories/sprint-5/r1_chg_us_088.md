# US-088: System emits A8 *Período no cerrado en últimos N días* (Medium, treasurer + plat

> **Sprint 5** | **P0** | **2 SP** | **R1** | POST_REVIEW_A8_period_not_closed

## User Story

As the system, I want to emit the A8 *Período no cerrado en últimos N días* alert (Medium) to both the treasurer and the platform operator when a group has gone too long without closing a month, so that an overdue close is surfaced before it compounds.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-088 |
| Feature | POST_REVIEW_A8_period_not_closed — System emits A8 *Período no cerrado en últimos N días* (Medium, treasurer + plat |
| Sprint | Sprint 5 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008, US-012, US-019 |
## Acceptance Criteria

- [ ] AC-1: A daily cron checks each org; if `today - latest PeriodClose.closed_at > GroupConfig.config.close_overdue_threshold_days` (default 14), it emits an `Alert` with `alert_kind = A8`, `severity = medium`, `audience = both`.
- [ ] AC-2: Dedup window is 24h — at most one A8 per org per day; a re-run inside the window updates the existing alert rather than emitting a duplicate.
- [ ] AC-3: Treasurer-side copy reads *"No has cerrado el mes en los últimos {n} días."* with `{n}` = days since the last close.
- [ ] AC-4: Operator-side, the `/admin` per-org snapshot shows a row *"Org {id} — no monthly close in {n} days."* (audience=both surfaces in both the treasurer bell and the operator console).
- [ ] AC-5: When the org has never closed a period, the threshold is measured from a sensible baseline (org/first-cycle creation) so a brand-new org does not immediately alert before its first close is due.
- [ ] AC-6: The alert is cleared/auto-dismissed once a `PeriodClose` brings the org back within the threshold; emission writes an `AuditLogEntry`.

## Technical Notes
- **Data model:** `Alert` (`alerts_context`): `org_id`, `alert_kind` (A8), `severity` (medium), `audience` (both), `payload` (jsonb: days-since-close `n`), `dedup_window_end` (24h). Reads `PeriodClose.closed_at` (latest per org) and `GroupConfig.config.close_overdue_threshold_days` (default 14). No new migration if `Alert`/`GroupConfig` exist from US-008.
- **API / surface:** daily cron (P17, kind A8), not a screen; surfaced via the treasurer alerts bell (US-055) and the `/admin` per-org snapshot. Cron-run history/replay is covered by US-081.
- **Business-rule execution:** no numbered BR (Business Rules row = —); threshold is config-driven via `GroupConfig.config.close_overdue_threshold_days`. 24h dedup keyed per org.
- **Multi-tenancy / audit:** the cron iterates all orgs (platform-scope read) but each `Alert` is org-scoped; emission emits an `AuditLogEntry`. Idempotent within the 24h dedup window.

## Test Strategy
- Unit: threshold predicate at boundary (n = 13/14/15 vs default 14); never-closed baseline handling.
- Integration: cron over a fixture of orgs emits A8 only for overdue orgs, audience=both; second same-day run does not duplicate (24h dedup).
- Integration: a subsequent `PeriodClose` clears the A8; assert treasurer copy and `/admin` snapshot row text.

## Dependencies
- `Blocked By` row is `—`; scope prerequisites US-008 (schema incl. `Alert`/`GroupConfig`), US-012 (cron/alerts infrastructure), US-019 (org/group config). Depends on `PeriodClose` produced by US-046 to clear; cron observability via US-081. Addresses Verifier finding F2 (partial).
