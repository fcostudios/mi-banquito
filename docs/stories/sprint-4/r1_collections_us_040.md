# US-040: Treasurer views the A/R aging primary tab sorted by days-late descending

> **Sprint 4** | **P0** | **3 SP** | **R1** | FEAT-040

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-040 |
| Feature | FEAT-040 — Treasurer views the A R aging primary tab sorted by days late descending |
| Sprint | Sprint 4 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant collections |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008, US-029, US-036 |
## User Story
As a treasurer, I want to see who owes what with the right priority on a live A/R aging tab, so that I chase by data, not by mood.

## Acceptance Criteria
- [ ] AC-1: `/atrasos` (SCR-ar-aging) reads live from the `mv_ar_aging` derived view and renders one row per outstanding obligation with columns: member name, reason (aporte or loan/cuota), amount due, days late, last action.
- [ ] AC-2: The list is sorted by `days_late` descending by default; the treasurer can re-sort by any column and filter by reason kind (aporte vs loan).
- [ ] AC-3: Rows reflect any write that affects A/R (a recorded payment, a new overdue installment, an adjustment) in real time — re-querying `mv_ar_aging` after the write removes/recomputes the affected rows without a manual refresh.
- [ ] AC-4: `days_late` is computed against the obligation's due date (installment due date or aporte period cutoff); paid-in-full obligations do not appear.
- [ ] AC-5: All data is scoped to the active org; a treasurer of group A never sees group B rows (org-scoped read; BR-25 cross-group isolation).

## Technical Notes
- **Data model:** read-only — `mv_ar_aging` materialized/derived view aggregating overdue `Aporte` periods and overdue loan `Installment` rows with `member_id`, `reason_kind`, `amount_due`, `due_date`, `days_late`, `last_action_at`. No new table; if `mv_ar_aging` does not yet exist as a materialized view, add it via an HR-25 timestamp-slug migration (`slug=ar_aging_view`).
- **API / surface:** server action / route handler returning the aging rows for the active org; consumed by SCR-ar-aging (`/atrasos`). Real-time updates achieved by re-fetching after any A/R-affecting mutation (P8 RecomputeARAging).
- **Business-rule execution:** no enforcement rule; this is a projection. Aging classification follows the obligation due-date model; org isolation per BR-25.
- **Multi-tenancy / audit:** every query filtered by active `org_id` (RLS / tenant guard). Read-only — no audit entry written.

## Test Strategy
- Unit: `days_late` computation across boundary cases (due today = 0, due yesterday = 1, future due = excluded).
- Golden-file: a seeded fixture with mixed aporte + loan overdue rows produces a deterministic, descending-sorted aging table.
- Integration: recording a payment on an overdue installment drops/recomputes its row on the next `mv_ar_aging` read; cross-org query returns zero foreign rows.

## Dependencies
- Blocked By: — (no story-level blocker declared). Functional prerequisites per scope: US-008 (group/config foundation), US-029 (aporte ledger), US-036 (loan installment schedule) — these supply the obligations that `mv_ar_aging` aggregates.
