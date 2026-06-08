# US-096: Treasurer starts an extraordinary / solidarity collection

> **Sprint 9** | **P1** | **3 SP** | **R2** | FEAT-CHG001-06

## User Story

As a treasurer, I want to open a colecta solidaria for a member's calamidad doméstica (or to recognize a gestión), so that contributions are tracked fairly and visibly instead of in my head.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-096 |
| Feature | FEAT-CHG001-06 — Treasurer starts an extraordinary / solidarity collection |
| Sprint | Sprint 9 |
| Priority | P1 |
| Size | 3 SP |
| Release | R2 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |


## Acceptance Criteria

- [ ] AC-1: On `SCR-solidarity-collection` (NEW), the treasurer creates an `ExtraordinaryCollection` (status `open`) with a `purpose`, a `beneficiary_member_id` (a `Member`), an optional `target_amount`, and a `kind ∈ {solidarity, treasurer_recognition}` discriminator (default `solidarity`).
- [ ] AC-2: Adding the first `ExtraordinaryCollectionLine` (member + amount + `account_id`) transitions the header `open → collecting` (BR-14 lifecycle); subsequent lines accumulate while in `collecting`.
- [ ] AC-3: Any line whose `account_id` resolves to a non-`is_group_fund` account is born `reconciliation_status = pending` and is flagged in the UI as pending regularization (BR-12); lines into a group-fund account are `regularized`/clear.
- [ ] AC-4: A live progress affordance shows "X de Y socias han aportado — recaudado {currency} {sum}" computed from the lines; `sum` is decimal(18,4) money math, with the collected total split into regularized vs pending.
- [ ] AC-5: All money fields are `decimal(18,4)`; line writes are validated for non-negative amounts and a resolvable `account_id` belonging to the org.
- [ ] AC-6: Header create and every line write are append-only and emit an `AuditLogEntry` (BR-16); no in-place edit/delete of a posted line (corrections via reversing entry).
- [ ] AC-7: This collection never enters the share-out base (BR-09/BR-14): an `ExtraordinaryCollection` is not a `ContributionCycle`.

## Technical Notes
- **Data model:** `ExtraordinaryCollection` header (`id`, `org_id`, `kind`, `purpose`, `beneficiary_member_id`, `target_amount?`, `status`, `paid_out_expense_id?`) + `ExtraordinaryCollectionLine` (`member_id`, `amount` decimal(18,4), `account_id`, `reconciliation_status`). Both new per CHG-001; migration via HR-25 timestamp-slug (`slug=extraordinary_collection`). Lines append-only; header status machine `open → collecting → paid_out → closed` (+ `cancelled`).
- **API / surface:** NEW screen `SCR-solidarity-collection` (collect mode). Server Actions: create-collection (header), add-line. Components `molecule.member-picker`, `molecule.currency-input`, `organism.collection-progress`. Process `P_ExtraordinaryCollect`.
- **Business-rule execution:** BR-14 lifecycle (open → collecting), Layer 2 state machine; BR-12 borns a line `pending` when `account.is_group_fund = false` (Layer 1 default + Layer 2); BR-16 append-only + audit.
- **Multi-tenancy / audit:** all rows `org_id`-scoped (RLS); every write emits `AuditLogEntry` (BR-16). `beneficiary_member_id`/line `member_id` must resolve within the same org.

## Test Strategy
- Unit: header create sets `open`; first line flips to `collecting`; progress string + collected sum (regularized vs pending) compute correctly.
- Property: a line into a non-group-fund account is always born `pending` (BR-12); posted lines are immutable (BR-16).
- Integration: create → add lines across mixed accounts → assert progress, pending flags, and one `AuditLogEntry` per write; assert the collection is excluded from any share-out base query (BR-09).

## Dependencies
- Functional prerequisites (scope): **US-091** (CHG-001 account/movement foundation) and **US-026** (member registry, for beneficiary + line members). `Blocked By` Meta row is `—`; these are the upstream stories whose data this screen reads/writes.
