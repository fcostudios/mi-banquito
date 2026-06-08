# US-112: System computes the two-pool distribution (BR-21, CHG-004)

> **Sprint 11** | **P1** | **3 SP** | **R1** | — System computes the two-pool distribution (BR-21, CHG-004)

## User Story

As a System (BR-21), I want to split the reparto into a loan pool + savings pool and compute each member's share so that borrowers/guarantors and savers are both rewarded per the group's real model.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-112 |
| Feature | — System computes the two-pool distribution (BR-21, CHG-004) |
| Sprint | Sprint 11 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | BR-09, BR-21 |
| Backstage Process | S6; RunTwoPoolShareOut |
| Blocked By | US-009, US-111, US-114 |

## Acceptance Criteria

- [ ] AC-1: `RunTwoPoolShareOut` splits the approved `reparto_total` into `loan_pool = loan_pool_pct × reparto_total` and `savings_pool = savings_pool_pct × reparto_total`, using the pool-split percentages snapshotted on the approved `SurplusGovernanceDecision` (US-111).
- [ ] AC-2: Enforces BR-21 (loan-activity pool): per member `loan_bonus_c = loan_activity_basis × alícuota_préstamos`, where `loan_activity_basis = Σ(A+B)` = total loan **principal** repaid in the year (own loans **A** + guaranteed/referred non-member loans **B** via `LoanGuarantor` join, principal only — excludes interest & mora, O9) from `mv_loan_activity_points` (US-114), and `alícuota_préstamos = loan_pool ÷ Σ_all(A+B)`.
- [ ] AC-3: Enforces BR-09 + BR-21 (savings pool): per member `savings_interest = time_weighted_balance × alícuota_ahorros`, where `time_weighted_balance` is the BR-09 USD-días method (US-009) and `alícuota_ahorros = savings_pool ÷ Σ_all(USD-días)`. Member total = `loan_bonus_c + savings_interest` (± `ajuste` from BR-22, US-113).
- [ ] AC-4: Both alícuotas are derived at run and snapshotted onto `YearEndShareOut`; each member's `loan_activity_basis`, `loan_bonus_c`, `savings_interest`, and `final_share` are persisted on a `YearEndShareOutLine`. All math is `decimal(18,4)` with no float intermediates.
- [ ] AC-5: Org/group-scoped (RLS); the run is audit-logged and reproducible (same approved decision + same period-locked MVs → identical shares).

## Technical Notes
- **Data model:** Writes `YearEndShareOut` (snapshotted `alícuota_préstamos`, `alícuota_ahorros`, `loan_pool`, `savings_pool`) + per-member `YearEndShareOutLine` (`loan_activity_basis`, `loan_bonus_c`, `savings_interest`, `final_share`). Reads `mv_loan_activity_points` (US-114) and the BR-09 time-weighted balance (US-009). HR-25 migration if these tables are new (`slug=year_end_share_out`).
- **API / surface:** `RunTwoPoolShareOut` server action in the S6 year-end pipeline (no direct screen; results render on `SCR-year-end-share-out`). Pre-flight asserts the approved governance decision (US-111).
- **Business-rule execution:** BR-21 two-pool math + BR-09 savings method, Layer 2. `loan_activity_basis` from `mv_loan_activity_points` (Σ(A+B) via `Repayment.applied_to_principal` joined through `LoanGuarantor` for B). Alícuotas derived at run, snapshotted.
- **Multi-tenancy / audit:** Org/group RLS; run audit-logged. Composes with BR-11 (treasurer override) and BR-22 (reconciliation re-runs after any override).

## Test Strategy
- Golden file: 2025 worked example — ANGELITA `A+B=729 × alícuota_préstamos 0.0231112 = 16.85` loan bonus; MONICA largest C≈257; ties to the client workbook.
- Property test: `Σ loan_bonus_c === loan_pool` and `Σ savings_interest === savings_pool` (each modulo `ajuste`, BR-22); `decimal(18,4)`, no float intermediates.
- Integration: alícuotas snapshotted on `YearEndShareOut`; per-member lines persisted with all four computed columns.

## Dependencies
- **US-009** (Blocked By) — BR-09 time-weighted (USD-días) savings balance, the input to `savings_interest`.
- **US-111** (Blocked By) — the approved `SurplusGovernanceDecision` supplying `reparto_total` + the frozen pool-split percentages (pre-flight gate).
- **US-114** (Blocked By) — `mv_loan_activity_points` (Σ(A+B) per member) feeding `loan_activity_basis`.
