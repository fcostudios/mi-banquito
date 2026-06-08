# US-098: Treasurer records a treasurer-compensation payout gated by a recognized amount

> **Sprint 9** | **P1** | **3 SP** | **R2** | FEAT-CHG001-08

## User Story

As a treasurer, I want to receive the value the group recognizes for my gestión, recorded properly, so that it is transparent and never looks like I paid myself an arbitrary sum.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-098 |
| Feature | FEAT-CHG001-08 — Treasurer records a treasurer-compensation payout gated by a recognized amount |
| Sprint | Sprint 9 |
| Priority | P1 |
| Size | 3 SP |
| Release | R2 |
| Domain | review/chg |
| Business Rules | BR-07 |
| Backstage Process | — |
| Blocked By | — |


## Acceptance Criteria

- [ ] AC-1: A treasurer-compensation payout is recorded as an `Expense` (`category = treasurer_comp_payout`, label "pago a tesorera") to the treasurer (a `Member` with `role = 'tesorera'`).
- [ ] AC-2: The payout is accepted only up to `recognized_amount(fiscal_year) = ` BR-07 accrued compensation `+ Σ(closed ExtraordinaryCollection rows with kind = treasurer_recognition)` (BR-15); a payout above this ceiling is **blocked** (BR-15 guard, Layer 2). BR-07 supplies the accrual term.
- [ ] AC-3: The guard is cumulative: `Σ(treasurer_comp_payout in fiscal year) ≤ recognized_amount`; the UI shows the remaining ceiling ("Reconocido $X · pagado $Y · disponible $Z") with decimal(18,4) money math.
- [ ] AC-4: **No double-dip** — a `treasurer_recognition` collection for a period already covered by the BR-07 accrual nets against it rather than stacking (BR-15); the `kind` discriminator (not free-text `purpose`) is what makes the ceiling deterministically computable, so a `solidarity` collection never counts toward it.
- [ ] AC-5: Accrued-but-unpaid BR-07 compensation carries forward (cumulative entitlement minus cumulative paid); a catch-up payout cannot exceed the cumulative entitlement (BR-15 carry rule).
- [ ] AC-6: The payout is deducted at share-out exactly as BR-11 states (a withdrawal, not part of the distributable pool) and appears on public-verify + per-member statements (BR-16 transparency).
- [ ] AC-7: The payout `Expense` is append-only and emits an `AuditLogEntry` (BR-16); corrections via reversing entry only.

## Technical Notes
- **Data model:** new `Expense` row (`category = treasurer_comp_payout`, decimal(18,4)). Recognition inputs: `GroupConfig.treasurer_compensation` JSONB (BR-07 `fixed_periodic`) plus `TreasurerCompensationDisbursement` accruals, and `ExtraordinaryCollection` rows with `kind = treasurer_recognition AND status = closed`. No new table; reuses CHG-001 / BR-07 entities. Migration only if a ceiling materialized view is added (HR-25 timestamp-slug).
- **API / surface:** `SCR-record-movement` (treasurer-comp mode) or `SCR-solidarity-collection` (recognition variant). Server Action: record-treasurer-comp-payout (computes `recognized_amount`, blocks over-ceiling). Components `molecule.currency-input`, `molecule.confirmation-modal`. Process `P_TreasurerCompPayout`.
- **Business-rule execution:** BR-15 (composes BR-07 accrual + BR-14 recognition collections) at Layer 2; ceiling = accrual + Σ closed `treasurer_recognition` collections, with no-double-dip net and carry-forward. Config-driven via `GroupConfig.treasurer_compensation` (BR-07).
- **Multi-tenancy / audit:** `org_id`-scoped; recognized_amount computed per `fiscal_year`; payout emits an `AuditLogEntry` (BR-16) and is reflected at share-out (BR-11) and public-verify.

## Test Strategy
- Unit: `recognized_amount` = accrual + Σ closed recognition collections; over-ceiling payout rejected; remaining-ceiling string.
- Golden file: a fiscal year with both a BR-07 accrual and a `treasurer_recognition` collection for an overlapping period nets (no double-dip) to the correct ceiling.
- Property: cumulative `Σ treasurer_comp_payout ≤ recognized_amount` holds across multiple payouts; carry-forward of accrued-but-unpaid does not exceed cumulative entitlement.
- Integration: record payout → assert share-out deducts it (BR-11) and it appears on public-verify + statement (BR-16).

## Dependencies
- Functional prerequisites (scope): **US-091** (CHG-001 movement foundation), **US-017** (BR-07 compensation config), and **US-096** (recognition-collection path, optional). `Blocked By` Meta row is `—`; these supply the accrual and recognition inputs the ceiling reads.
