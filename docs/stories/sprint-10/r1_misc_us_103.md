# US-103: Mora fee shown in loan detail, repayment split, and A/R aging

> **Sprint 10** | **P1** | **3 SP** | **R1** | — Mora fee shown in loan detail, repayment split, and A/R aging

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-103 |
| Feature | — Mora fee shown in loan detail, repayment split, and A/R aging |
| Sprint | Sprint 10 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | misc |
| Business Rules | — |
| Backstage Process | S4 collections |
| Blocked By | US-102 |

## User Story
As La Tesorera, I want to see accrued mora per loan and per overdue member, so that I can communicate and collect it transparently.

## Acceptance Criteria
- [ ] AC-1: `SCR-loan-detail` (Cronograma / Pagos) surfaces accrued mora by reading the loan's `LoanFee(fee_kind='mora')` rows, shown alongside principal and interest with `decimal(18,4)` precision.
- [ ] AC-2: A repayment applies mora alongside the existing interest-first waterfall (mora settled in the agreed order with interest), with no change to the underlying accrual.
- [ ] AC-3: `SCR-ar-aging` adds a mora column that reconciles with `CxCobrar` reality (the displayed mora ties to the sum of un-reversed `LoanFee` mora rows).
- [ ] AC-4: es-EC copy is used ("Mora", "Por día") on both screens.

## Technical Notes
- **Data model:** read-only over `LoanFee(fee_kind='mora')` (un-reversed rows = accrued − reversals via `reverses_id`); reconciliation against `CxCobrar`.
- **API / surface:** `SCR-loan-detail` Cronograma/Pagos tabs + `SCR-ar-aging` mora column; S4 collections. Read paths only — no new writes.
- **Business-rule execution:** display surfaces the output of BR-17 accrual (US-102); repayment split honors the interest-first ordering with mora; no new BR introduced.
- **Multi-tenancy / audit:** `org_id`-scoped reads; mora figures are derived from stamped `LoanFee` rows so the display is replay-consistent.

## Test Strategy
- Integration: `SCR-loan-detail` renders accrued mora matching the `LoanFee` mora rows for a fixture loan.
- Integration: `SCR-ar-aging` mora column total reconciles with `CxCobrar` for the overdue cohort.
- Repayment test: a payment splits across interest and mora per the waterfall without altering accrual.
- i18n test: es-EC labels ("Mora", "Por día") present.

## Dependencies
- **US-102** (Blocked By) — produces the `LoanFee(fee_kind='mora')` rows these screens read and reconcile against; nothing to display until accrual exists.
