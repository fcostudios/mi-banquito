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
| Business Rules | BR-07, BR-11, BR-14, BR-15, BR-16 |
| Backstage Process | — |
| Blocked By | US-096 |


## Acceptance Criteria

- [ ] AC-1: A treasurer-compensation payout is recorded as an `Expense` (`category = treasurer_comp_payout`, label "pago a tesorera") to the treasurer (a `Member` with `role = 'tesorera'`).
- [ ] AC-2 (amended per CHG-011): The payout is accepted only up to `payable_now` per amended BR-15, computed EXACTLY as: per-year `recognized_amount(Y) = max(BR-07 accrued compensation attributed to Y, Σ closed ExtraordinaryCollection kind = treasurer_recognition with recognition_fiscal_year = Y)` — **`max()`, never sum: the group recognizes the gestión once per year**; `cumulative_entitlement(Y) = Σ over y ≤ Y of recognized_amount(y)`; `cumulative_paid(Y) = Σ(Withdrawal kind = treasurer_compensation_disbursement, period_label in any y ≤ Y) + Σ(Expense category = treasurer_comp_payout attributed to any y ≤ Y)`; `payable_now(Y) = max(0, cumulative_entitlement(Y) − cumulative_paid(Y))`. All sums run from org inception **through** the selected fiscal year (this is the carry rule made exact). **The US-050 cron already pays the BR-07 entitlement as real `Withdrawal` rows — they are part of `cumulative_paid`; the two payment paths draw from one shared entitlement (DEC-MB-002).** The ceiling is recomputed server-side **inside the same transaction** as the payout write (no TOCTOU — same org-row-lock/serializable pattern as US-092 expense idempotency).
- [ ] AC-3: The UI shows the full breakdown ("Reconocido $X · pagado $Y · disponible $Z" = `cumulative_entitlement` · `cumulative_paid` (cron withdrawals AND prior manual payouts) · `payable_now`, all through the selected fiscal year) with decimal(18,4) money math.
- [ ] AC-4: **No double-dip is the `max()` in AC-2, not prose** — a `treasurer_recognition` collection for a year already covered by the BR-07 accrual can only raise that year's `recognized_amount` above the accrual, never stack on top of it; the `kind` discriminator (not free-text `purpose`) is what makes the ceiling deterministically computable, so a `solidarity` collection never counts toward it. Attribution keys: accruals/cron-withdrawals by `period_label`'s fiscal year; recognition collections by `recognition_fiscal_year` (INSERT-only, never `opened_on`); manual payouts by `dated_on`'s fiscal year.
- [ ] AC-5: Accrued-but-unpaid BR-07 compensation carries forward automatically because AC-2's sums are cumulative through Y; a catch-up payout can never exceed `payable_now` (BR-15 carry rule — no separate computation, it IS AC-2's formula).
- [ ] AC-6: The payout is deducted at share-out exactly as BR-11 states (a withdrawal, not part of the distributable pool) and appears on public-verify + per-member statements (BR-16 transparency).
- [ ] AC-7: The payout `Expense` is append-only and emits an `AuditLogEntry` (BR-16); corrections via reversing entry only.
- [ ] AC-8 (new per CHG-011): A payout with `amount > payable_now` returns the typed domain error `compensation_ceiling_exceeded` carrying `{cumulative_entitlement, cumulative_paid, payable_now}`; the screen renders these three figures in plain Spanish both in the pre-submit preview and in the error state; when `payable_now ≤ 0` the submit action is disabled with the exact reason (already paid via cron / via prior payout).
- [ ] AC-9 (new per CHG-011 — regression fence): A real-PostgreSQL test seeds a US-050 cron `Withdrawal` for period P, then (a) a payout of the full `cumulative_entitlement` for the same fiscal year is **rejected**; (b) a payout of `cumulative_entitlement − withdrawal` is **accepted**; (c) replaying the same payout (same `client_request_id`) yields exactly one `Expense` (US-092 idempotency); (d) a year with both an accrual and a larger recognition colecta yields `recognized_amount = ` the colecta amount, not their sum (`max()` fence).

## Technical Notes
- **Data model:** new `Expense` row (`category = treasurer_comp_payout`, decimal(18,4)). Recognition inputs: `GroupConfig.treasurer_compensation` JSONB (BR-07 `fixed_periodic`) plus `TreasurerCompensationDisbursement` accruals, and `ExtraordinaryCollection` rows with `kind = treasurer_recognition AND status = closed` (attributed by `recognition_fiscal_year` — CHG-011 column added by US-096's migration). **Already-paid inputs (CHG-011): `Withdrawal` rows with `kind = treasurer_compensation_disbursement` (written by the US-050 cron — see `packages/domain/src/compensation.ts`) plus prior `Expense` rows with `category = treasurer_comp_payout`.** No new table; reuses CHG-001 / BR-07 entities. Migration only if a ceiling materialized view is added (HR-25 timestamp-slug).
- **API / surface:** `SCR-record-movement` (treasurer-comp mode) or `SCR-solidarity-collection` (recognition variant). Server Action: record-treasurer-comp-payout (computes `recognized_amount`, blocks over-ceiling). Components `molecule.currency-input`, `molecule.confirmation-modal`. Process `P_TreasurerCompPayout`.
- **Business-rule execution:** BR-15 (composes BR-07 accrual + BR-14 recognition collections) at Layer 2; ceiling = accrual + Σ closed `treasurer_recognition` collections, with no-double-dip net and carry-forward. Config-driven via `GroupConfig.treasurer_compensation` (BR-07).
- **Multi-tenancy / audit:** `org_id`-scoped; recognized_amount computed per `fiscal_year`; payout emits an `AuditLogEntry` (BR-16) and is reflected at share-out (BR-11) and public-verify.

## Test Strategy
- Unit: `payable_now = max(0, cumulative_entitlement − cumulative_paid)` with per-year `recognized_amount = max(accrual, recognition)`; over-ceiling payout rejected with `compensation_ceiling_exceeded` + figures; disabled-state reasons; breakdown string.
- Golden file: a fiscal year with both a BR-07 accrual and a larger `treasurer_recognition` collection yields the collection amount as `recognized_amount` (max, not sum); a prior year with unpaid accrual carries into the next year's `payable_now`.
- Property (BR-15, oracle `property` per CHG-011): `0 ≤ payable_now ≤ cumulative_entitlement`; monotone non-increasing in `cumulative_paid`; paying exactly `payable_now` then recomputing yields 0; seeding a US-050 cron `Withdrawal` shrinks `payable_now` by its face value; per-year `recognized_amount` never exceeds `max(accrual, recognition)`.
- Integration (real PostgreSQL — AC-9): cron withdrawal seeded → full-ceiling payout rejected / netted payout accepted / replay idempotent / max() fence; record payout → assert share-out deducts it (BR-11) and it appears on public-verify + statement (BR-16).

## Dependencies
- `Blocked By` Meta row: **US-096** (its migration adds `recognition_fiscal_year` and the CHG-011 columns this story's ceiling query reads — schema prerequisite even for solidarity-free ceilings).
- Functional prerequisites (scope): **US-091** (CHG-001 movement foundation), **US-017** (BR-07 compensation config), **US-050** (CHG-011: the cron whose emitted `Withdrawal` rows are part of `cumulative_paid` — shared entitlement, DEC-MB-002). These supply the accrual, already-paid, and recognition inputs the ceiling reads.
