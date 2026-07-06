# US-052: Treasurer overrides a per-member share with required reason and audit

> **Sprint 6** | **P1** | **3 SP** | **R1** | FEAT-052

## User Story

As a treasurer, I want to adjust a member's two-pool share total when equity demands it, recording a required reason, so that social rules can complement the formula while staying auditable.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-052 |
| Feature | FEAT-052 — Treasurer overrides a per-member share with required reason and audit |
| Sprint | Sprint 6 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant reporting |
| Business Rules | BR-11 |
| Backstage Process | — |
| Blocked By | US-051, US-113 |
## Acceptance Criteria
- [x] AC-1: On `SCR-year-end-share-out` (`/reparto`) step 2, each per-member row exposes an `ajuste` numeric input (positive or negative, `decimal(18,4)`) and a `motivo` (reason) text field.
- [x] AC-2 (BR-11): Setting `ajuste` writes `YearEndShareOutLine.override_share_amount` and requires a non-empty `override_reason` — the row cannot be saved with a non-zero override and an empty reason.
- [x] AC-3: The override recomputes `final_share_amount` over the two-pool draft (`= override_share_amount` if set, else `draft_share_amount = loan_bonus_c + savings_interest`).
- [x] AC-4 (BR-22): Any override **re-runs the exact reconciliation** so `Σ final_share === reparto_total` exactly (`decimal(18,4)`); the residue is absorbed into the single explicit `YearEndShareOut.ajuste_amount` line, never silently spread across members.
- [x] AC-5: Each override writes an `AuditLogEntry` (`action_kind=shareout.line.overridden`, `reason` = the motivo — required per the reversal/override audit invariant) in the same transaction as the line update; the override is only permitted while the `YearEndShareOut` is `status=draft` (not after approval/distribution).

## Technical Notes
- **Data model:** `YearEndShareOutLine.override_share_amount`, `override_reason`, derived `final_share_amount`; parent `YearEndShareOut.ajuste_amount` (reconciliation residual). No new entity; no migration unless these columns are absent (timestamp-slug per HR-25).
- **API / surface:** Server Action `overrideShareOutLine(lineId, ajuste, motivo)` → updates the line, re-invokes the BR-22 reconciliation step, recomputes `ajuste_amount`. Screen `SCR-year-end-share-out` (`/reparto`), `organism.year-end-share-out-editor` row.
- **Business-rule execution:** **BR-11** (treasurer-overridable per-member share with required reason), Layer 2; composes with **BR-22** (exact reconciliation re-run on every override). Override operates on the two-pool total (`loan_bonus_c + savings_interest`), not the legacy single pool.
- **Multi-tenancy / audit:** `org_id`-scoped; `reason` mandatory on the audit row; only mutable while parent share-out is `draft`.

## Test Strategy
- Unit: a non-zero `ajuste` with empty `motivo` is rejected.
- Property (BR-22): for any member set + override, `Σ final_share + ajuste_amount === reparto_total` exactly (no float intermediates).
- Golden-file: an override on one member rebalances `ajuste_amount` and leaves other lines unchanged.
- Integration (permission/state): override blocked once the share-out is `approved`/`distributed`; non-treasurer denied (403).

## Dependencies
- US-051 (the draft two-pool share-out + lines must exist), US-113 (override/reconciliation support) — per scope Prerequisites. Meta `Blocked By` is `—`; **Business Rules** row (BR-11) preserved verbatim (BR-22 cited in body).
