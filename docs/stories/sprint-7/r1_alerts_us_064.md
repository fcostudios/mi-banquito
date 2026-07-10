# US-064: System emits A4 liquidez bajo margen alert

> **Sprint 7** | **P1** | **2 SP** | **R1** | FEAT-064

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-064 |
| Feature | FEAT-064 — System emits A4 liquidez bajo margen alert |
| Sprint | Sprint 7 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Backstage alerts |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-054 |
## User Story
As a treasurer, I want the system to alert me when the projected cash flow dips below the group's safety margin, so that I can act before the banquito runs short of liquidity.

## Acceptance Criteria
- [ ] AC-1: The emitter runs **post-commit on `ProjectCashFlow` (P9)** — i.e. whenever the `liquidez_proyectada` projection is (re)materialized.
- [ ] AC-2: If **any** monthly projection across the 12-month horizon falls below `GroupConfig.config.safety_margin_amount`, an `Alert` row is written with `kind = A4`, `severity = high`, `audience = treasurer`.
- [ ] AC-3: The alert copy is in Spanish and cites the **specific month** that breached and the **shortfall amount** (margin − projected) for that month.
- [ ] AC-4: De-dup honors `dedup_window = 7d` — the engine suppresses a duplicate by the natural key `(org_id, alert_kind=A4, subject_id, window)` so a re-projection within 7 days does not re-emit the same breach.
- [ ] AC-5: When a later P9 projection shows all 12 months at/above the margin, no new A4 is emitted (resolution is implicit; the bell stops surfacing it once outside the window).

## Technical Notes
- **Data model:** Append-only `Alert` (`alerts_context`). Reads the `liquidez_proyectada` materialized view (PRIN-07) and `GroupConfig.config.safety_margin_amount`. No migration (A4 is an existing alert kind in the 14-kind catalogue, `03b §6`).
- **API / surface:** No screen of its own — surfaced by the alert bell (SWR poll ~30s). Emitter is the `comp_alert_engine_009` AlertEngine consuming the Postgres LISTEN/NOTIFY channel populated by the post-commit refresh hook on the cash-flow projection (FEAT-P17 EmitAlert).
- **Business-rule execution:** No BR; threshold is config-driven via `GroupConfig.config.safety_margin_amount`. Comparison is against every month in the rolling 12-month horizon.
- **Multi-tenancy / audit:** Alert rows are org-scoped under RLS; emitted within the projection's transaction context so a failed write rolls back consistently.

## Test Strategy
- Unit: breach detector — given a 12-month projection vector + margin, returns the breaching month(s) and shortfall(s); no breach → no emit.
- Integration: refresh `ProjectCashFlow` with a sub-margin month, assert exactly one A4 `Alert` (correct month + shortfall in copy).
- Integration: idempotency — re-run P9 within 7d, assert no duplicate (dedup natural key).

## Dependencies
- Blocked By row is `—`. Scope prerequisite US-054 (Liquidez Proyectada screen + `ProjectCashFlow`/P9 projection) supplies the projection this emitter watches.
