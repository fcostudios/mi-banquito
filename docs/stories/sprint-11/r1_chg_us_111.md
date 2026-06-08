# US-111: Surplus governance: Assembly sets reparto vs reserva (BR-20, CHG-004)

> **Sprint 11** | **P1** | **3 SP** | **R1** | — Surplus governance: Assembly sets reparto vs reserva (BR-20, CHG-004)

## User Story

As a Treasurer (recording the Assembly), I want to set how much is distributed vs reserved, before the reparto so that the distribution reflects the group's decision, versioned + auditable.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-111 |
| Feature | — Surplus governance: Assembly sets reparto vs reserva (BR-20, CHG-004) |
| Sprint | Sprint 11 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | BR-20 |
| Backstage Process | S6 Assembly; BR-20 |
| Blocked By | US-110 |

## Acceptance Criteria

- [ ] AC-1: Before any reparto runs, the Treasurer records a `SurplusGovernanceDecision` for the fiscal year capturing `reparto_total`, `reserva_amount`, `reserva_disposition ∈ {reserva, capital}` (default `reserva`), and a snapshot of the pool-split `{loan_pct, savings_pct}` taken from `GroupConfig.config.distribution` at decision time (O8).
- [ ] AC-2: Enforces BR-20: the decision is HR-1 versioned with full history (`EntityVersion`) and is revisable until `approved`; once approved it locks. The constraint `reparto_total + reserva_amount ≤ distributable_surplus` (US-110) is asserted on every save in `decimal(18,4)`.
- [ ] AC-3: `RunTwoPoolShareOut` (US-112) refuses to run unless an `approved` `SurplusGovernanceDecision` exists for the year — a pre-flight precondition gate, NOT a period-lock trigger.
- [ ] AC-4: A `reserva_disposition = capital` increases the lending pool at next-year open (O3); `reserva` is retained as reserve. The chosen disposition is recorded on the decision and carried forward.
- [ ] AC-5: Surfaces on `SCR-year-end-share-out` (step 0 — governance); all reads/writes are org/group-scoped (RLS) and audit-logged.

## Technical Notes
- **Data model:** `SurplusGovernanceDecision` (`fiscal_year`, `reparto_total`, `reserva_amount`, `reserva_disposition`, snapshotted `loan_pct`/`savings_pct`, `status ∈ {draft, approved}`, HR-1 version columns). HR-25 timestamp-slug migration (`slug=surplus_governance_decision`).
- **API / surface:** Server actions to create/revise/approve the decision; `SCR-year-end-share-out` step-0 governance panel (nav map). Approval flips `status` and freezes the pool-split snapshot.
- **Business-rule execution:** BR-20 — Layer 1 (`RunTwoPoolShareOut` asserts an `approved` decision exists before computing) + Layer 3 (versioned writes + `EntityVersion`). Pool-split from `config.distribution {loan_pct, savings_pct}`, snapshotted on the decision.
- **Multi-tenancy / audit:** Org/group RLS; HR-1 `EntityVersion` append-only history for the governed decision; approval + revisions audit-logged.

## Test Strategy
- Golden file: 2025 decision — reparto 2100 + reserva 327.5 = 2427.5 ≤ 2487 distributable (passes); a decision exceeding distributable surplus is rejected.
- Property test: `RunTwoPoolShareOut` cannot run without an `approved` decision; an approved decision is immutable while a draft is freely revisable; pool-split snapshot is frozen at approval.
- Integration: revision history is captured in `EntityVersion`; `capital` disposition is carried to next-year open.

## Dependencies
- **US-110** (Blocked By) — provides `distributable_surplus`, the ceiling the governance decision is validated against (`reparto + reserva ≤ surplus`).
