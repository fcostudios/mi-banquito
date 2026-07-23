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
| Business Rules | BR-12, BR-14, BR-16 |
| Backstage Process | — |
| Blocked By | US-096 |


## Acceptance Criteria

- [ ] AC-1: From `SCR-solidarity-collection` in payout mode, "Registrar pago" disburses a single `Expense` (`category = solidarity_payout`, label "pago solidario") to the beneficiary, linked from the header via `paid_out_expense_id`.
- [ ] AC-2: The payout amount is **capped** at the regularized collected total: `payout_amount ≤ Σ(lines that are regularized or in a group-fund account)` (BR-14 arithmetic invariant); the UI prevents requesting a payout above this ceiling (decimal(18,4) comparison).
- [ ] AC-3: The collection **cannot reach `paid_out`** while any line is `reconciliation_status = pending` (composes BR-12); the action is blocked with a clear message until all lines are regularized.
- [ ] AC-4: On a successful payout the header transitions `collecting → paid_out → closed` (BR-14 lifecycle); `closed` is immutable.
- [ ] AC-5 (amended per CHG-011; return model fixed by CHG-012 / DEC-MB-006): Surplus is handled explicitly via the header columns. At the transition to `closed` (or `cancelled` with regularized funds): `surplus_amount` is set exactly once to `Σ(regularized lines) − payout` (payout = 0 for `cancelled` and for zero-payout recognition closes); when `surplus_amount > 0`, `disposition ∈ {returned, retained}` is REQUIRED — `returned` creates **ONE aggregate return `Transfer`** (`purpose = collection_surplus_return`, `regularizes_kind = extraordinary_collection`) **in the same transaction** from a group-fund account to a single treasurer-selected active same-org NON-group return-channel account (`collection_return_account_unavailable` otherwise), stores its id in the UNIQUE `surplus_transfer_id`, and the trigger revalidates direction/amount/purpose (`collection_surplus_return_invalid`); the UI states in plain Spanish that the channel account receives the total for distribution to contributors off-ledger. `retained` REQUIRES `disposition_motive` (trimmed ≥ 3 chars — the group-vote reference). When surplus = 0, all three stay NULL. All four fields append to the `AuditLogEntry` (no silent surplus).
- [ ] AC-6: The payout `Expense` is append-only and emits an `AuditLogEntry` (BR-16); a correction is a reversing entry (`reverses_id`), never an edit/delete.
- [ ] AC-7: Contributors' per-member statements and the public-verify document show the collection and that it was paid out (BR-16 transparency).

## Technical Notes
- **Data model:** new `Expense` row (`category = solidarity_payout`, decimal(18,4)) linked from `ExtraordinaryCollection.paid_out_expense_id`; header `status` advances to `paid_out` then `closed`, writing the CHG-011 surplus columns (`surplus_amount`, `disposition`, `disposition_motive`, `surplus_transfer_id`) at the closing transition. Surplus return is a `Transfer` (append-only) linked via `surplus_transfer_id`. Reuses CHG-001 entities (no new table); status transitions run through US-096's replacement trigger (`allow_extraordinary_collection_transition()` — this story depends on US-096's migration having replaced the blanket append-only triggers, see US-096 AC-8) and are guarded by the BR-14 arithmetic invariant. A `treasurer_recognition` colecta uses the SAME payout flow with no expense: `collecting→paid_out` (expense forbidden) then `paid_out→closed` retaining the full regularized total under a required motive (DEC-MB-005). Canonical error codes (CHG-012): `collection_disposition_invalid`, `collection_surplus_mismatch`, `collection_pending_regularization`, `collection_surplus_return_invalid`, `recognition_payout_expense_forbidden`, `cancelled_collection_payout_forbidden`, `collection_return_account_unavailable`, `collection_return_source_ambiguous`.
- **API / surface:** `SCR-solidarity-collection` (payout mode). Server Action: record-solidarity-payout (validates ceiling + no-pending guard, writes Expense, advances status, records surplus disposition). Components `molecule.currency-input`, `molecule.confirmation-modal`. Process `P_SolidarityPayout`.
- **Business-rule execution:** BR-14 (`paid_out → closed` + `payout ≤ Σ regularized lines`), Layer 2 enforcement + Layer 1 CHECK on the no-pending guard (composes BR-12); BR-16 append-only + audit + statement/public-verify visibility.
- **Multi-tenancy / audit:** `org_id`-scoped; payout, surplus transfer, and status change each emit an `AuditLogEntry` (BR-16). Beneficiary must match the header `beneficiary_member_id`.

## Test Strategy
- Unit: ceiling computation (Σ regularized lines), over-payout rejection, surplus = collected − paid.
- Golden file: a collection with mixed regularized/pending lines yields the exact allowable payout ceiling and surplus.
- Property: payout while any line is `pending` is rejected (BR-12/BR-14); a posted payout cannot be mutated (BR-16).
- Integration: collect → regularize → pay out → assert `paid_out → closed`, surplus disposition recorded, and the collection + payout appear on the contributor statement and public-verify.

## Dependencies
- `Blocked By` Meta row: **US-096** (the collection must exist in `collecting` with regularized lines, and US-096's migration must have replaced the append-only triggers, before this payout flow can transition the header).
