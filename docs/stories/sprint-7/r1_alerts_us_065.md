# US-065: System emits A5 compromiso reparto excede proyeccion alert

> **Sprint 7** | **P1** | **2 SP** | **R1** | FEAT-065

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-065 |
| Feature | FEAT-065 — System emits A5 compromiso reparto excede proyeccion alert |
| Sprint | Sprint 7 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Backstage alerts |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-051, US-054 |
## User Story
As a treasurer, I want the system to warn me when the projected year-end share-out commitment exceeds the projected available capital, so that I don't approve a distribution the group cannot actually pay.

## Acceptance Criteria
- [ ] AC-1: The emitter runs **post-commit on `EvaluateYearEndCommitment` (P11)**.
- [ ] AC-2: When the **projected year-end commitment** (computed per BR-09 time-weighted interest + BR-11 per-member breakdown) exceeds the **projected available capital**, an `Alert` row is written with `kind = A5`, `severity = high`, `audience = treasurer`.
- [ ] AC-3: The Spanish copy cites the three concrete figures: projected payout, projected available, and the shortfall.
- [ ] AC-4: The alert **remains active** until a subsequent P11 evaluation shows it resolved (commitment ≤ available); de-dup uses `dedup_window = 7d` on `(org_id, A5, subject_id, window)`.
- [ ] AC-5: While an A5 is active at share-out **approval time**, the approval flow (US-053) requires an explicit treasurer **override with reason** before it proceeds (per Review Pass F16) — this emitter exposes the active-A5 state the approval guard reads.

## Technical Notes
- **Data model:** Append-only `Alert`. Inputs: `YearEndShareOut` projected lines (BR-09/BR-11 computation) and the projected available capital from the liquidity projection. No migration (A5 exists in the catalogue).
- **API / surface:** Surfaced by the alert bell; no dedicated screen. Emitter is `comp_alert_engine_009` via the post-commit hook on `EvaluateYearEndCommitment` (FEAT-P17 EmitAlert). The active-A5 flag is queried by the US-053 approval Server Action.
- **Business-rule execution:** BR-09 (time-weighted interest on savings) and BR-11 (treasurer-overridable per-member share, broken down by source) drive the projected commitment; the share-out engine (`SYS_ShareOutEngine` / `packages/domain/rules/share-out/time-weighted.ts`) produces the figure compared against available capital.
- **Multi-tenancy / audit:** Org-scoped under RLS; the approval override + reason (when A5 active) is itself audited via the US-053 flow.

## Test Strategy
- Unit: comparator — commitment vs available, emits only when commitment > available; copy contains all three figures.
- Property: the commitment figure equals the BR-09/BR-11 projected sum (consistency with the share-out engine output).
- Integration: A5 active → US-053 approval blocked without override; resolved P11 → alert no longer active.

## Dependencies
- Blocked By row is `—`. Scope prerequisites US-054 (liquidity projection / available capital) and US-051 (year-end share-out wizard producing the commitment) feed both sides of the comparison; coupled to US-053 (approval override at F16).
