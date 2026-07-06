# US-062: System emits A2 prestamo proximo a vencer alert

> **Sprint 6** | **P1** | **2 SP** | **R1** | FEAT-062

## User Story

As a treasurer, I want the system to alert me when a loan is about to fall due, so that I can follow up with the member before it goes overdue.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-062 |
| Feature | FEAT-062 — System emits A2 prestamo proximo a vencer alert |
| Sprint | Sprint 6 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Backstage alerts |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008, US-040 |
## Acceptance Criteria
- [x] AC-1: Post-commit on `RecomputeARAging` (P8 / `mv_ar_aging`), the system scans for loans with a `LoanSchedule.due_on ≤ today + 7 days AND status = pendiente`.
- [x] AC-2: For each matching loan it emits an `Alert` with `alert_kind=A2`, `severity=medium`, `audience=treasurer`.
- [x] AC-3: The Spanish copy is: *"El préstamo de {member} vence en 7 días. Saldo actual: USD {outstanding}."* — `{member}` and `{outstanding}` resolved into the `payload` template variables.
- [x] AC-4: The alert de-duplicates over a 24h window — UNIQUE(`org_id`, `alert_kind`, `subject_kind`, `subject_id`, `dedup_window_end`); the same loan does not produce a duplicate within the window.
- [x] AC-5: Loans not within the 7-day window, or not `pendiente`, do not trigger an alert.
- [x] AC-6: The alert is `org_id`-scoped and surfaces on the treasurer's alert bell (30 s poll); `subject_kind=Loan`, `subject_id` = the loan.

## Technical Notes
- **Data model:** `Alert` (`alerts_context`, append-only) — `alert_kind=A2`, `severity=medium`, `audience=treasurer`, `subject_kind=Loan`, `payload` jsonb with `{member}`/`{outstanding}`, 24h `dedup_window_end`. Reads `LoanSchedule` (`due_on`, `status`) + `mv_ar_aging` (outstanding). No new migration unless the enum lacks `A2`.
- **API / surface:** `SYS_AlertEngine` (`comp_alert_engine_009`) `EmitAlert` (P17), triggered on the post-commit hook of `RecomputeARAging` (DB LISTEN/NOTIFY consumer). UI alert bell via SWR (30 s).
- **Business-rule execution:** No BR governs this story (Business Rules row `—`); trigger is the A2 rule from the `03b §6` alert catalogue.
- **Multi-tenancy / audit:** `org_id`-scoped; append-only emission; idempotent on the dedup key.

## Test Strategy
- Integration: a `pendiente` loan due in ≤ 7 days → one A2 alert with the exact copy + `{member}`/`{outstanding}` substituted.
- Property/idempotency: re-run within 24h emits no duplicate.
- Integration: loan due > 7 days or non-`pendiente` → no alert.

## Dependencies
- US-040 (`mv_ar_aging` / A/R aging recompute), US-008 (loan/period infra) — per scope Prerequisites. Meta `Blocked By` is `—`.
