# US-095: Period close blocks while unregularized movements exist (reconciliation panel)

> **Sprint 8** | **P1** | **8 SP** | **R1** | FEAT-CHG001-05

## User Story
As a treasurer, I want to be stopped from closing the month while a deposit is still sitting unregularized, so that a locked period is always a true, reconciled period.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-095 |
| Feature | FEAT-CHG001-05 — Period close blocks while unregularized movements exist (reconciliation panel) |
| Sprint | Sprint 8 |
| Priority | P1 |
| Size | 5 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## Acceptance Criteria
- [ ] AC-1: SCR-monthly-close is extended with a reconciliation panel (`organism.reconciliation-panel`) listing every `reconciliation_status = pending` row whose `dated_on` falls inside the period.
- [ ] AC-2: The "Cerrar el mes" / lock action is **disabled** in the UI while any pending row exists in the period (composes the `period_lock_invariant` of BR-12).
- [ ] AC-3: Each pending row has a one-tap "Regularizar" entry that opens the US-094 regularization flow; once zero pending rows remain, the lock action enables.
- [ ] AC-4: The lock is **rejected server-side** too, not only via the disabled button — a request to close a period with any pending row is refused (BR-12 is a hard invariant, not UI text).
- [ ] AC-5: The close PDF itemizes the month's fund movements by category (comisiones / insumos / gastos compartidos / transferencias) and shows the net-of-expenses fund balance, plus asserts "cero movimientos pendientes de regularizar".

## Technical Notes
- **Data model:** Reads pending rows (`reconciliation_status = pending`, `dated_on` in period) across the money-touching entities; reads `PeriodClose` state. The PDF aggregates `Movement` rows by BR-13 `category`. No new table beyond the close-PDF content; migration per HR-25 only if a column is added.
- **API / surface:** SCR-monthly-close (extended) + the period-lock Server Action with the server-side pending-rows guard. Component: `organism.reconciliation-panel`, `atom.status-pill`.
- **Business-rule execution:** Composes BR-12's `period_lock_invariant` — the close is blocked while any pending row exists, enforced at both the UI (disabled) and the server (rejected). The PDF gives El Presidente (P02), whose only artifact is the WhatsApp PDF, both *where the money went* (category itemization, BR-13) and *that nothing is unreconciled* at a glance.
- **Multi-tenancy / audit:** Period + pending rows `org_id`-scoped; the lock attempt and the eventual successful close write `AuditLogEntry` rows (BR-16).

## Test Strategy
- Property: a period with ≥1 pending row cannot be locked — server rejects even when the UI guard is bypassed.
- Golden file: close PDF itemizes movements by category, shows net-of-expenses balance, and asserts zero pending.
- Integration: regularizing the last pending row (via US-094) flips the lock action to enabled.

## Dependencies
- `Blocked By` is `—`. Scope prerequisites US-094 (regularization — supplies the pending→regularizado mechanism this panel drives) and US-044 (monthly close — the period-lock surface being extended). Both are hard upstream; US-095 is the integration point that makes the lock invariant binding.
