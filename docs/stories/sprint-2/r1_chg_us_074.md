# US-074: Treasurer records a contribution as cash, bank, or petty cash

> **Sprint 2** | **P0** | **3 SP** | **R1** | REVIEW_F3

## User Story
As La Tesorera, I want to declare where a contribution's money came in (bank, cash at the meeting, or petty cash), so that the reconciliation flow knows what balance to reconcile it against.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-074 |
| Feature | REVIEW_F3 — Treasurer records a contribution as cash, bank, or petty cash |
| Sprint | Sprint 2 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## Acceptance Criteria
- [ ] AC-1: `SCR-record-contribution` gains a `payment_source` field defaulting to `bank_transfer`, with alternatives `cash_in_meeting` and `petty_cash_deposit`.
- [ ] AC-2: When `payment_source = cash_in_meeting`, the slip photo is not required (the meeting cash has no bank slip); for `bank_transfer` / `petty_cash_deposit` the existing slip behavior is unchanged.
- [ ] AC-3: The system tracks a virtual `petty_cash_balance` per org alongside the existing `bank_balance`, derived from the append-only contribution ledger; a contribution increments the balance matching its `payment_source`.
- [ ] AC-4: The reconciliation flow (US-044) handles the bank balance and the petty-cash balance separately; `SCR-monthly-close` is extended with a petty-cash row so both balances reconcile independently.
- [ ] AC-5: The `payment_source` value is persisted on the `Contribution` row and written with the audit-log row in the same transaction; money columns are `decimal(18,4)`; the ledger remains append-only (NFR-SEC-02/04).

## Technical Notes
- **Data model:** `Contribution.payment_source` enum (`bank_transfer` | `cash_in_meeting` | `petty_cash_deposit`); a derived/MV `petty_cash_balance` per org alongside `bank_balance`. New migration per HR-25 timestamp-slug for the enum column.
- **API / surface:** `SCR-record-contribution` (extended) Server Action; `SCR-monthly-close` (extended with a petty-cash row). Consumed by reconciliation US-044.
- **Business-rule execution:** no new BR — this is a process-realism change (Meta `Business Rules` = `—`); the slip-required predicate becomes conditional on `payment_source` rather than always-on.
- **Multi-tenancy / audit:** `petty_cash_balance` and `bank_balance` are org-scoped derived views with RLS; `payment_source` + audit row written atomically with the `Contribution`.

## Test Strategy
- Unit: slip-required predicate is false only for `cash_in_meeting`; enum rejects unknown values.
- Integration: a `petty_cash_deposit` contribution moves `petty_cash_balance` and not `bank_balance`, and vice versa; `SCR-monthly-close` shows both balances and reconciles them independently.

## Dependencies
- Blocked By: — (none declared). Prerequisites from scope: US-029 (record-contribution base), US-044 (reconciliation flow that consumes the two balances).
