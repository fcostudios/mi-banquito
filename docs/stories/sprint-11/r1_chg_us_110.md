# US-110: System computes the distributable surplus (BR-19, CHG-004)

> **Sprint 11** | **P1** | **3 SP** | **R1** | — System computes the distributable surplus (BR-19, CHG-004)

## User Story

As a System (BR-19), I want to derive the year's distributable surplus so that the Assembly governs a correct figure.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-110 |
| Feature | — System computes the distributable surplus (BR-19, CHG-004) |
| Sprint | Sprint 11 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | BR-19 |
| Backstage Process | S6; ComputeSurplus |
| Blocked By | US-100, US-101, US-105 |

## Acceptance Criteria

- [ ] AC-1: `ComputeSurplus` derives the year's distributable surplus as `(interest gains + solicitudes/admin fees + mora) − CxC_anterior`, materialized as `mv_distributable_surplus` per fiscal year and group.
- [ ] AC-2: Enforces BR-19: admin/solicitud (BR-03) and mora (BR-17) fees are included only when `LoanFee.feeds_surplus=true` (reconciles OQ-BR11-1); `CxC_anterior` is read from the prior-year `YearEndBalanceSnapshot` (BR-18) — still-uncollected receivables roll forward (O2); all arithmetic in `decimal(18,4)`, no float intermediates.
- [ ] AC-3: Interest-gain input is sourced from `mv_interest_gains_per_fiscal_year`; the computed surplus is the single figure the Assembly governs (US-111) — `reparto_total + reserva_amount ≤ distributable_surplus` is enforced downstream against this value.
- [ ] AC-4: The materialized view is refreshed at/after year-end close with period-locked version semantics — recomputing for a closed year is deterministic and replayable (same inputs → same surplus).
- [ ] AC-5: Computation is org/group-scoped (RLS) and audit-logged; the result is read-only/derived (no editable surplus — corrections flow through the ledger + a new snapshot).

## Technical Notes
- **Data model:** Materialized view `mv_distributable_surplus` (per group, per fiscal year). Inputs: `mv_interest_gains_per_fiscal_year`, `LoanFee(feeds_surplus)`, prior `YearEndBalanceSnapshot.cxc_anterior`. If a new MV/index is introduced, declare an HR-25 timestamp-slug migration (`slug=mv_distributable_surplus`).
- **API / surface:** Server-side `ComputeSurplus` step in the year-end (S6) pipeline; no dedicated screen (the figure feeds `SCR-year-end-share-out` step 0 via US-111). 
- **Business-rule execution:** BR-19 in the Layer-2 enforcement layer (`ComputeSurplus`). `feeds_surplus` flag gates fee inclusion; `cxc_anterior` from BR-18 snapshot. Config-free (fully derived).
- **Multi-tenancy / audit:** Org/group RLS; computation audit-logged. Derived/read-only — no EntityVersion (the governed write is the BR-20 decision in US-111, not the surplus figure).

## Test Strategy
- Golden file: 2025 distributable surplus == 2487 (`3087 income − 600.3 CxC`), tied to the client workbook and the US-109 seed.
- Property test: surplus == Σ(interest gains + feeds_surplus fees) − cxc_anterior exactly in `decimal(18,4)`; excluding a `feeds_surplus=false` fee changes nothing.
- Replay test: recompute for a closed/period-locked year is idempotent and deterministic.

## Dependencies
- **US-100** (Blocked By) — loan interest/fee accrual feeding `mv_interest_gains_per_fiscal_year` and the `LoanFee.feeds_surplus` flag.
- **US-101** (Blocked By) — repayment/receivable ledger underpinning the income and CxC figures.
- **US-105** (Blocked By) — prior-year `YearEndBalanceSnapshot` supplying `cxc_anterior` (BR-18).
