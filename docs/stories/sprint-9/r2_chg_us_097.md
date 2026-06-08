# US-097: Treasurer records a solidarity payout and closes the collection

> **Sprint 9** | **P1** | **3 SP** | **R2** | FEAT-CHG001-07

## User Story

As a treasurer, I want to pay the collected money to the beneficiary and close the colecta, so that everyone sees it was fully and fairly disbursed.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-097 |
| Feature | FEAT-CHG001-07 — Treasurer records a solidarity payout and closes the collection |
| Sprint | Sprint 9 |
| Priority | P1 |
| Size | 3 SP |
| Release | R2 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |


## Acceptance Criteria

- [ ] AC-1: From `SCR-solidarity-collection` in payout mode, "Registrar pago" disburses a single `Expense` (`category = solidarity_payout`, label "pago solidario") to the beneficiary, linked from the header via `paid_out_expense_id`.
- [ ] AC-2: The payout amount is **capped** at the regularized collected total: `payout_amount ≤ Σ(lines that are regularized or in a group-fund account)` (BR-14 arithmetic invariant); the UI prevents requesting a payout above this ceiling (decimal(18,4) comparison).
- [ ] AC-3: The collection **cannot reach `paid_out`** while any line is `reconciliation_status = pending` (composes BR-12); the action is blocked with a clear message until all lines are regularized.
- [ ] AC-4: On a successful payout the header transitions `collecting → paid_out → closed` (BR-14 lifecycle); `closed` is immutable.
- [ ] AC-5: Surplus (`collected − paid`) is handled explicitly — the treasurer chooses to return it (a `Transfer`) or retain it; the chosen disposition is recorded and audited (no silent surplus).
- [ ] AC-6: The payout `Expense` is append-only and emits an `AuditLogEntry` (BR-16); a correction is a reversing entry (`reverses_id`), never an edit/delete.
- [ ] AC-7: Contributors' per-member statements and the public-verify document show the collection and that it was paid out (BR-16 transparency).

## Technical Notes
- **Data model:** new `Expense` row (`category = solidarity_payout`, decimal(18,4)) linked from `ExtraordinaryCollection.paid_out_expense_id`; header `status` advances to `paid_out` then `closed`. Surplus return is a `Transfer` (append-only). Reuses CHG-001 entities (no new table); status transition guarded by the BR-14 arithmetic invariant.
- **API / surface:** `SCR-solidarity-collection` (payout mode). Server Action: record-solidarity-payout (validates ceiling + no-pending guard, writes Expense, advances status, records surplus disposition). Components `molecule.currency-input`, `molecule.confirmation-modal`. Process `P_SolidarityPayout`.
- **Business-rule execution:** BR-14 (`paid_out → closed` + `payout ≤ Σ regularized lines`), Layer 2 enforcement + Layer 1 CHECK on the no-pending guard (composes BR-12); BR-16 append-only + audit + statement/public-verify visibility.
- **Multi-tenancy / audit:** `org_id`-scoped; payout, surplus transfer, and status change each emit an `AuditLogEntry` (BR-16). Beneficiary must match the header `beneficiary_member_id`.

## Test Strategy
- Unit: ceiling computation (Σ regularized lines), over-payout rejection, surplus = collected − paid.
- Golden file: a collection with mixed regularized/pending lines yields the exact allowable payout ceiling and surplus.
- Property: payout while any line is `pending` is rejected (BR-12/BR-14); a posted payout cannot be mutated (BR-16).
- Integration: collect → regularize → pay out → assert `paid_out → closed`, surplus disposition recorded, and the collection + payout appear on the contributor statement and public-verify.

## Dependencies
- Functional prerequisite (scope): **US-096** (the collection must exist in `collecting` with regularized lines before it can be paid out). `Blocked By` Meta row is `—`; US-096 is the upstream story this payout flow operates on.
