# US-094: Treasurer regularizes a deposit that landed in a non-group account *(crown jewel

> **Sprint 8** | **P1** | **3 SP** | **R1** | FEAT-CHG001-04

## User Story
As a treasurer, I want to handle the case where a member deposited into my personal account and then move it into the group account "para regularizar", so that nobody can ever read my personal-account movement as me taking group money.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-094 |
| Feature | FEAT-CHG001-04 — Treasurer regularizes a deposit that landed in a non-group account *(crown jewel |
| Sprint | Sprint 8 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## Acceptance Criteria
- [ ] AC-1: A contribution/repayment recorded against a **non-`is_group_fund`** account is born `reconciliation_status = pending` and shows a "pendiente de regularizar" pill (`atom.status-pill`).
- [ ] AC-2: A "Regularizar" action opens a `Transfer` with `purpose = regularization`, `to_account_id` = a group-fund account, and `regularizes_kind` / `regularizes_id` set to the pending source row; on save the source row flips to `regularizado`.
- [ ] AC-3: The fund balance is **unchanged** by the original pending deposit and **only increases** when the regularizing transfer lands (BR-12).
- [ ] AC-4: The regularizing `Transfer.to_account_id` MUST resolve to an `is_group_fund = true` account — regularizing between two personal accounts is rejected (BR-12 guard a, Layer-1 CHECK + Layer-2).
- [ ] AC-5: The flip to `regularizado` happens only when `Σ regularizing transfers ≥ source.amount` — a partial transfer cannot clear the pending row (BR-12 guard b).
- [ ] AC-6: Both the pending source row and the regularizing transfer appear on the member statement and public-verify (never hidden); an `AuditLogEntry` is written for both (BR-16).

## Technical Notes
- **Data model:** Money-touching entities (`Contribution`, `Repayment`, `ExtraordinaryCollectionLine`, etc.) carry `account_id` + `reconciliation_status` (`pending`/`regularized`); regularization writes a `Transfer` (`purpose = regularization`, `regularizes_kind`, `regularizes_id` polymorphic FK). Migration per HR-25.
- **API / surface:** SCR-record-movement (regularization mode); the pending pill is surfaced on SCR-treasurer-home, member-detail, and SCR-monthly-close. Components: `atom.status-pill` (pendiente/regularizado), `molecule.confirmation-modal`.
- **Business-rule execution:** Implements BR-12 (the crown jewel). Both guards are enforced server-side: (a) target must be `is_group_fund`, (b) full-coverage before flip. The fund-balance contract (pending deposit does not increase the fund until regularized) is the core invariant.
- **Multi-tenancy / audit:** All rows `org_id`-scoped; pending + regularizing rows are transparently visible on member-facing surfaces; audit on both the pending creation and the regularization (BR-16).

## Test Strategy
- Golden file: a pending deposit leaves the fund balance flat; the regularizing transfer raises it by exactly the amount.
- Property: a transfer whose `to_account_id` is non-group, or whose summed amount < source amount, never flips the row to `regularizado`.
- Integration: pending + regularizing rows both render on member statement and public-verify; audit entries on both.

## Dependencies
- `Blocked By` is `—`. Scope prerequisites US-091 (accounts, incl. a group-fund target), US-029 (contribution), and US-036 (repayment) — the pending inflows this story regularizes. US-091 + US-029/036 are the hard upstream sources.
