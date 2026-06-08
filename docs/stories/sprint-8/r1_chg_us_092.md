# US-092: Treasurer records a categorized fund movement (fee / supplies / shared expense)

> **Sprint 8** | **P1** | **3 SP** | **R1** | FEAT-CHG001-02

## User Story
As a treasurer, I want to record money leaving the fund — comisión bancaria, tintas/papel/insumos, desayunos para todas — with a category and an optional slip, so that the answer to "¿en qué se fue la plata?" is always complete and evidenced.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-092 |
| Feature | FEAT-CHG001-02 — Treasurer records a categorized fund movement (fee / supplies / shared expense) |
| Sprint | Sprint 8 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## Acceptance Criteria
- [ ] AC-1: NEW SCR-record-movement has an account picker (group accounts only), a **required** `category` selector, an amount field (es-EC currency input), a date defaulting to today, an optional slip photo, and optional notes.
- [ ] AC-2: `category` is enforced against the BR-13 enum (`bank_fee` / `supplies` / `shared_expense` / `operating`, plus `solidarity_payout` / `treasurer_comp_payout` where gated); no uncategorized outflow can be saved (Layer-1 `NOT NULL category` + `CHECK`).
- [ ] AC-3: The Server Action carries a `client_request_id` with a UNIQUE constraint so a double-submit is idempotent (a retry resolves to the same `Movement`, no duplicate).
- [ ] AC-4: On success it writes a typed `Movement` (Expense/Withdrawal) plus an `AuditLogEntry` (BR-16), and shows inline copy "Movimiento registrado — {category}, {currency} {amount}".
- [ ] AC-5: The fund balance and cash-flow projection refresh to reflect the outflow.

## Technical Notes
- **Data model:** Writes a typed `Movement` (Expense/Withdrawal) with `account_id`, required `category` enum, `amount`, `dated_on`, optional `slip_photo_id`, `notes`, and a UNIQUE `client_request_id`. Migration per HR-25 timestamp-slug if a column is added.
- **API / surface:** NEW `SCR-record-movement`; record-movement Server Action. Components: `molecule.currency-input`, `molecule.slip-uploader`, `molecule.confirmation-modal`, `atom.status-pill`.
- **Business-rule execution:** Implements BR-13 (categorization — every outflow categorized, Layer 1 enum + `NOT NULL`; category-specific Layer-2 guards) and BR-16 (audit). R1 policy is treasurer-records, no second-signer; the optional `GroupConfig.expense_ack_threshold_usd` soft-flag is non-blocking in R1.
- **Multi-tenancy / audit:** `Movement` rows `org_id`-scoped; idempotency via UNIQUE `client_request_id`; audit entry on every write (BR-16).

## Test Strategy
- Property: an outflow with no `category` is rejected at Layer 1.
- Golden file: one movement per category with the correct fund-balance effect.
- Idempotency: replaying the same `client_request_id` produces no second row.
- Enum-coverage: every BR-13 catalogue category has a wired option.

## Dependencies
- `Blocked By` is `—`. Scope prerequisites US-091 (accounts must exist + ≥1 group-fund account) and US-009 (existing money-entry/cash-flow surface). US-091 is the hard upstream — without a group account this movement cannot be recorded.
