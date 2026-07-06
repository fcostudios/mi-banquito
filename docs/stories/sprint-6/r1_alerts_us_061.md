# US-061: System emits A1 conciliacion pendiente alert

> **Sprint 6** | **P1** | **2 SP** | **R1** | FEAT-061

## User Story

As a treasurer, I want the system to alert me when the prior month's reconciliation is still pending, so that I close it before the next assembly.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-061 |
| Feature | FEAT-061 — System emits A1 conciliacion pendiente alert |
| Sprint | Sprint 6 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Backstage alerts |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008, US-012 |
## Acceptance Criteria
- [x] AC-1: A daily cron (Vercel Cron `/api/cron/*` with the shared bearer secret) checks, on day 5 of each new cycle, whether the prior cycle has a `PeriodClose`.
- [x] AC-2: If the prior cycle has **no** `PeriodClose`, the system emits an `Alert` with `alert_kind=A1`, `severity=high`, `audience=treasurer`.
- [x] AC-3: The Spanish copy is: *"El mes de {prev_month} aún no está cerrado. Te recomiendo cerrar antes de la próxima reunión."* — `{prev_month}` resolved into the `payload` template variables.
- [x] AC-4: The alert de-duplicates over a 24h window — UNIQUE(`org_id`, `alert_kind`, `subject_kind`, `subject_id`, `dedup_window_end`); a same-day re-run does not produce a duplicate Alert row.
- [x] AC-5: If the prior cycle is already closed, no alert is emitted.
- [x] AC-6: The emitted alert surfaces on the treasurer's alert bell (polled every 30 s) and is `org_id`-scoped.

## Technical Notes
- **Data model:** `Alert` (`alerts_context`, append-only) — `alert_kind=A1`, `severity=high`, `audience=treasurer`, `subject_kind` = the prior `ContributionCycle`/period, `payload` jsonb with `{prev_month}`, `dedup_window_end` (= emit + 24h). De-dup via the UNIQUE constraint. No new migration unless the enum lacks `A1`.
- **API / surface:** `SYS_AlertEngine` (`comp_alert_engine_009`) `EmitAlert` (P17). Cron route handler under `app/api/cron/*` runs the day-5 check per org; UI alert bell consumes via SWR (30 s poll).
- **Business-rule execution:** No BR governs this story (Business Rules row `—`); the trigger is the A1 rule from the `03b §6` alert catalogue.
- **Multi-tenancy / audit:** `org_id`-scoped; emission is append-only; idempotent on the dedup key (NFR-RELIAB-01 — cron idempotent on retry).

## Test Strategy
- Integration: prior cycle without `PeriodClose` on day 5 → one A1 alert with the exact Spanish copy + `{prev_month}` substituted.
- Property/idempotency: re-running the cron within 24h emits no duplicate (dedup UNIQUE holds).
- Integration: prior cycle already closed → no alert.

## Dependencies
- US-008 (PeriodClose / close lifecycle), US-012 (cycle/reconciliation) — per scope Prerequisites. Meta `Blocked By` is `—`.
