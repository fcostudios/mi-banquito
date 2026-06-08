# US-063: System emits A3 aporte atrasado alert

> **Sprint 6** | **P1** | **2 SP** | **R1** | FEAT-063

## User Story

As a treasurer, I want the system to alert me when a member's contribution becomes overdue beyond the configured threshold, so that I can follow up promptly.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-063 |
| Feature | FEAT-063 — System emits A3 aporte atrasado alert |
| Sprint | Sprint 6 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Backstage alerts |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008, US-031 |
## Acceptance Criteria
- [ ] AC-1: Post-commit on `RecomputeMemberCompliance` (P7 / `mv_member_compliance_state`), when a member's compliance state transitions to `atrasado` (per `GroupConfig.late_threshold_days`), the system emits an `Alert`.
- [ ] AC-2: The alert carries `alert_kind=A3`, `severity=medium`, `audience=treasurer`.
- [ ] AC-3: The Spanish copy is: *"El aporte de {month} de {member} está atrasado por {days} días."* — `{month}`, `{member}`, `{days}` resolved into the `payload` template variables.
- [ ] AC-4: The threshold is read from `GroupConfig.late_threshold_days` (config-driven, not hardcoded); a member only crossing the threshold triggers the alert.
- [ ] AC-5: The alert de-duplicates over a 24h window — UNIQUE(`org_id`, `alert_kind`, `subject_kind`, `subject_id`, `dedup_window_end`); the same member does not re-emit within the window.
- [ ] AC-6: A member who is NOT yet past the threshold (still within grace) does not trigger an alert; `org_id`-scoped; `subject_kind=Member`, surfaces on the alert bell (30 s poll).

## Technical Notes
- **Data model:** `Alert` (`alerts_context`, append-only) — `alert_kind=A3`, `severity=medium`, `audience=treasurer`, `subject_kind=Member`, `payload` jsonb with `{month}`/`{member}`/`{days}`, 24h `dedup_window_end`. Reads `mv_member_compliance_state` (state transition) + `GroupConfig.late_threshold_days`. No new migration unless the enum lacks `A3`.
- **API / surface:** `SYS_AlertEngine` (`comp_alert_engine_009`) `EmitAlert` (P17), triggered on the post-commit hook of `RecomputeMemberCompliance` (DB LISTEN/NOTIFY `member_compliance_changed`). UI alert bell via SWR (30 s).
- **Business-rule execution:** No BR governs this story (Business Rules row `—`); trigger is the A3 rule from the `03b §6` alert catalogue. The threshold is the configurable `GroupConfig.late_threshold_days`.
- **Multi-tenancy / audit:** `org_id`-scoped; append-only emission; idempotent on the dedup key.

## Test Strategy
- Integration: a member crossing into `atrasado` per `late_threshold_days` → one A3 alert with the exact copy + `{month}`/`{member}`/`{days}` substituted.
- Property/idempotency: re-run within 24h emits no duplicate.
- Unit: a member within grace (not past `late_threshold_days`) emits no alert; threshold honored from config.

## Dependencies
- US-031 (member compliance / `mv_member_compliance_state`), US-008 (period/cycle infra) — per scope Prerequisites. Meta `Blocked By` is `—`.
