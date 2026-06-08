# US-114: Derived data: loan-activity points + distributable-surplus views (CHG-004)

> **Sprint 11** | **P1** | **3 SP** | **R1** | — Derived data: loan-activity points + distributable-surplus views (CHG-004)

## User Story

As a System, I want to materialize Σ(A+B) per member and the distributable surplus so that the two-pool engine reads stable, replayable inputs.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-114 |
| Feature | — Derived data: loan-activity points + distributable-surplus views (CHG-004) |
| Sprint | Sprint 11 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | BR-19 |
| Backstage Process | S6 derived layer |
| Blocked By | US-101, US-105 |

## Acceptance Criteria

- [ ] AC-1: `mv_loan_activity_points` materializes, per member per fiscal year, `Σ(A+B)` = principal repaid on the member's own loans **A** plus guaranteed/referred non-member loans **B**, where B is resolved via the `LoanGuarantor` join and only `Repayment.applied_to_principal` is summed (principal only — interest & mora excluded, O9).
- [ ] AC-2: `mv_distributable_surplus` materializes the BR-19 inputs and result (`(interest gains + feeds_surplus fees + mora) − cxc_anterior`); both views are computed in `decimal(18,4)` with no float intermediates and enforce BR-19's input rules.
- [ ] AC-3: Both views are refreshed at/after year-end close and carry period-locked version semantics — once a fiscal year is locked, the materialized rows are stable and replayable (recompute yields identical values).
- [ ] AC-4: The views are the sole stable input surface for the two-pool engine (US-112) and surplus computation (US-110), so downstream runs read deterministic, replayable data rather than recomputing from the live ledger.
- [ ] AC-5: Org/group-scoped (RLS); refreshes are audit-logged; the views are read-only/derived (no editable rows).

## Technical Notes
- **Data model:** Two materialized views — `mv_loan_activity_points` (per member/year Σ(A+B) via `Repayment.applied_to_principal` joined through `LoanGuarantor` for B) and `mv_distributable_surplus` (BR-19 inputs: `mv_interest_gains_per_fiscal_year`, `LoanFee(feeds_surplus)`, prior `YearEndBalanceSnapshot.cxc_anterior`). HR-25 migration (`slug=loan_activity_and_surplus_mvs`).
- **API / surface:** No screen — derived/refresh layer in the S6 year-end pipeline. Refresh hook fires at/after year-end close.
- **Business-rule execution:** BR-19 inputs in the Layer-2 derived layer. The A+B principal-only rule (O9) and the guarantor→non-member mapping (`LoanGuarantor`) are the correctness contract for `loan_activity_basis` consumed by BR-21 (US-112).
- **Multi-tenancy / audit:** Org/group RLS; refresh audit-logged; period-locked version semantics keep closed-year rows immutable. No EntityVersion (derived, not governed).

## Test Strategy
- Golden file: 2025 `mv_loan_activity_points` per member (e.g. ANGELITA A+B=729) and `mv_distributable_surplus` = 2487, tied to the client workbook.
- Property test: B counts only guaranteed non-member loan principal (via `LoanGuarantor`), excludes interest/mora; A+B == principal repaid; `decimal(18,4)` exact.
- Replay test: refreshing a period-locked year is deterministic (identical rows).

## Dependencies
- **US-101** (Blocked By) — repayment ledger (`Repayment.applied_to_principal`) and loan/guarantor relations (`LoanGuarantor`) feeding A and B.
- **US-105** (Blocked By) — prior-year `YearEndBalanceSnapshot` supplying `cxc_anterior` for `mv_distributable_surplus` (BR-19).
