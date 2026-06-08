# US-113: Exact reconciliation with ajuste line (BR-22, CHG-004)

> **Sprint 11** | **P1** | **3 SP** | **R1** | — Exact reconciliation with ajuste line (BR-22, CHG-004)

## User Story

As a System (BR-22), I want to guarantee Σ(shares) === reparto_total exactly so that the books always balance and trust holds.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-113 |
| Feature | — Exact reconciliation with ajuste line (BR-22, CHG-004) |
| Sprint | Sprint 11 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | BR-22 |
| Backstage Process | S6; BR-22 |
| Blocked By | US-112 |

## Acceptance Criteria

- [ ] AC-1: After the two-pool computation (US-112), a reconciliation step asserts `Σ(member final_share) + ajuste_amount === reparto_total` exactly in `decimal(18,4)`.
- [ ] AC-2: Enforces BR-22: any rounding residue is absorbed into a single explicit `YearEndShareOut.ajuste_amount` line — never silently spread across members. The ajuste is recorded and auditable (the client tolerates ~$6 slop; we make it explicit and balanced).
- [ ] AC-3: Reconciliation gates approval — a share-out whose lines do not reconcile to `reparto_total` (within the explicit ajuste) cannot be approved.
- [ ] AC-4: Reconciliation re-runs after any treasurer override (US-052 / BR-11) — recomputing shares recomputes the ajuste so the invariant always holds post-override.
- [ ] AC-5: Computation is org/group-scoped (RLS), audit-logged, and uses no float intermediates (pure `decimal(18,4)` arithmetic end to end).

## Technical Notes
- **Data model:** Adds/uses `YearEndShareOut.ajuste_amount` (`decimal(18,4)`), persisted on the share-out alongside the per-member `YearEndShareOutLine.final_share` totals (US-112). HR-25 migration if the column is new (`slug=share_out_ajuste`).
- **API / surface:** Post-computation reconciliation step inside `RunTwoPoolShareOut` / the approval path; surfaced as the ajuste line on `SCR-year-end-share-out`. Blocks approval on a reconciliation failure.
- **Business-rule execution:** BR-22 — Layer 2 post-computation step gating approval; pairs with BR-11 override (US-052) which re-triggers reconciliation. The single ajuste line is the only place residue lands.
- **Multi-tenancy / audit:** Org/group RLS; the ajuste value + reconciliation outcome are audit-logged.

## Test Strategy
- Property test: for any member set and pool split, `Σ(final_share) + ajuste === reparto_total` exactly with no float intermediates.
- Golden file: 2025 share-out reconciles to `reparto_total` with an explicit ajuste (ties to the client workbook's ~$6 slop made explicit).
- Integration: an override (US-052) re-runs reconciliation and re-derives the ajuste; an unreconciled share-out cannot be approved.

## Dependencies
- **US-112** (Blocked By) — produces the per-member `final_share` lines and `reparto_total` that this story reconciles into an exact total via the ajuste line.
