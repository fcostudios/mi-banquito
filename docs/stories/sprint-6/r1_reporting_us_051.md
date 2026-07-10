# US-051: Treasurer opens year-end share-out wizard with time-weighted breakdown by source

> **Sprint 6** | **P1** | **8 SP** | **R1** | FEAT-051

## User Story

As **La Tesorera**, I want to run the two-pool year-end share-out wizard and see each member's share computed transparently across the loan-activity pool and the savings pool, so that I can defend the distribution at the year-end assembly.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-051 |
| Feature | FEAT-051 — Treasurer opens year-end share-out wizard with time-weighted breakdown by source |
| Sprint | Sprint 6 |
| Priority | P1 |
| Size | 8 SP |
| Release | R1 |
| Domain | Tenant reporting |
| Business Rules | BR-09, BR-10 |
| Backstage Process | — |
| Blocked By | US-008, US-046, US-100, US-105, US-110, US-111, US-112 |
## Acceptance Criteria
- [ ] AC-1: `SCR-year-end-share-out` (`/reparto`) opens as a multi-step wizard for the selected fiscal year (fiscal year derived per **BR-10** from `GroupConfig.fiscal_year_start_month/day`).
- [ ] AC-2 (Step 0 — Assembly governance): The wizard confirms/records the approved `SurplusGovernanceDecision` for the year (`reparto_total`, `reserva_amount`, `reserva_disposition ∈ {reserva, capital}`); the pool-split % is read from `GroupConfig.config.distribution {loan_pct, savings_pct}` and snapshotted onto the decision (`loan_pool_pct`, `savings_pool_pct`) per **BR-20**.
- [ ] AC-3 (Step 1 — group summary): The wizard shows the computed `distributable_surplus` = (interest + solicitudes/admin + mora) − `cxc_anterior` (from `mv_distributable_surplus` / `YearEndBalanceSnapshot.cxc_anterior`, BR-19), and derives `loan_pool_amount = loan_pool_pct × reparto_total`, `savings_pool_amount = savings_pool_pct × reparto_total`, `alícuota_préstamos = loan_pool_amount ÷ Σ_all(A+B)`, `alícuota_ahorros = savings_pool_amount ÷ Σ_all(USD-días)` per **BR-21**.
- [ ] AC-4 (Step 2 — per-member two-pool grid): For each member the wizard displays `accumulated_savings`, `saldo_ponderado_usd_dias` (from `mv_member_time_weighted_balance`), `loan_activity_basis` = Σ(A+B) principal repaid (from `mv_loan_activity_points`), `loan_bonus_c = loan_activity_basis × alícuota_préstamos`, `savings_interest = time_weighted_balance × alícuota_ahorros`, `total_borrador = loan_bonus_c + savings_interest`, plus ajuste / total_final / motivo_ajuste columns (override handled in US-052).
- [ ] AC-BR-09: Savings-pool interest uses the **BR-09** time-weighted method (`balance_day` summed over the fiscal year; a member who paid late earns proportionally less — the "Sandra" case); golden-file `BR-09__sandra_jumped_at_year_end.json` matches bit-for-bit and the property test asserts `Σ savings_interest === savings_pool` (modulo `ajuste`).
- [ ] AC-BR-10: Fiscal-year binning follows **BR-10**; property test verifies a Dec 31 → Jan 1 span classifies correctly for the configured `start_month`.
- [ ] AC-BR-21: Loan bonus uses **BR-21** — `loan_activity_basis` is **principal only** (own loans A + guaranteed/referred non-member loans B via `LoanGuarantor`), excluding interest and mora; property test asserts `Σ loan_bonus_c === loan_pool` (modulo `ajuste`).
- [ ] AC-N: The wizard run is read/compute-only at this stage — it creates the `YearEndShareOut` (`status=draft`, alícuotas + pool amounts snapshotted) and its `YearEndShareOutLine` draft rows; no `Withdrawal`/payout yet. Append-only ledger + audit-in-same-transaction invariants hold (NFR-SEC-02/04).

## Technical Notes
- **Data model:** `YearEndShareOut` (draft: `governance_decision_id`, `reparto_total`, `loan_pool_amount`, `savings_pool_amount`, `alicuota_prestamos` `decimal(12,10)`, `alicuota_ahorros`, `distributable_surplus`, `cxc_anterior`, `status=draft`) + per-member `YearEndShareOutLine` (`accumulated_savings_at_run`, `loan_activity_basis`, `loan_bonus_c`, `savings_interest`, `draft_share_amount`, `final_share_amount`). `SurplusGovernanceDecision` (HR-1 versioned) read/confirmed in step 0. Materialized views consumed: `mv_member_time_weighted_balance`, `mv_loan_activity_points`, `mv_distributable_surplus`. New migration only if these views/columns are not yet present — timestamp-slug per HR-25.
- **API / surface:** `RunTwoPoolShareOut` engine (`SYS_ShareOutEngine`, Layer 2) invoked from a Server Action; supersedes the legacy single-pool P16/P25. Screen `SCR-year-end-share-out` (`/reparto`); component `organism.year-end-share-out-editor` rebuilt with loan-bonus + savings-interest columns. All decimal math in `decimal(18,4)` (no float intermediates).
- **Business-rule execution:** BR-10 (fiscal-year fn), BR-09 (time-weighted savings method, period-locked via `group_config_version`), BR-20 (approved-decision pre-flight — see US-053 for the hard gate at approval), BR-21 (two-pool alícuota derivation). Pool-split keys: `GroupConfig.config.distribution`.
- **Multi-tenancy / audit:** `org_id`-scoped; `YearEndShareOut.year` UNIQUE(org_id, year). Draft creation emits an `AuditLogEntry` in the same transaction. `SurplusGovernanceDecision` is HR-1 versioned via `EntityVersion`.

## Test Strategy
- Golden-file: `BR-09__sandra_jumped_at_year_end.json` (time-weighted savings shares) + a 2025 two-pool golden (ANGELITA `A+B=729 × 0.0231112 ≈ 16.85` loan bonus, MONICA largest `C`).
- Property: `Σ savings_interest === savings_pool` and `Σ loan_bonus_c === loan_pool` (each modulo `ajuste`); equal-throughout-year contributors collapse to the simple `current_balance/total` model.
- Property: fiscal-year binning (BR-10) for non-calendar `start_month`.
- Integration: opening the wizard for a year without an approved `SurplusGovernanceDecision` surfaces the step-0 governance prompt (does not compute final shares).
- Integration (permission): non-treasurer role denied (403).

## Dependencies
- US-008 (PeriodClose/year-end close), US-100/US-105 (governance + snapshot infra), US-110/US-111/US-112 (two-pool materialized views: time-weighted balance, loan-activity points, distributable surplus), US-046 (PDF infra) — per scope Prerequisites. Meta `Blocked By` is `—` and **Business Rules** row (BR-09, BR-10) is preserved verbatim; the CHG-004 two-pool rules (BR-20/21/22) are cited in the ACs/Technical Notes as the body is richer than the Meta row.
