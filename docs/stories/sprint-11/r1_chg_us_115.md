# US-115: Treasurer records each member's withdraw|retain disposition (CHG-005)

> **Sprint 11** | **P1** | **3 SP** | **R1** | — Treasurer records each member's withdraw|retain disposition (CHG-005)

## User Story

As a Treasurer (per member), I want to record whether each socia takes her excedente as cash or leaves it in savings, with a motive so that the choice is transparent, audited, and tied to the bank movement.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-115 |
| Feature | — Treasurer records each member's withdraw|retain disposition (CHG-005) |
| Sprint | Sprint 11 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | BR-22, BR-23 |
| Backstage Process | S6 annual; BR-23 |
| Blocked By | US-053, US-091, US-092 |

## Acceptance Criteria

- [ ] AC-1: At share-out approval, the Treasurer sets, per `YearEndShareOutLine`, `disposition ∈ {withdraw, retain}` plus a **required** `disposition_motive` (free-text reason); a line cannot be approved without both.
- [ ] AC-2: Enforces BR-23 (withdraw): a `withdraw` disposition creates a `Withdrawal` (`kind=year_end_share_out`, `account_id` per CHG-001) for the member's `final_share`, linked from the line via `withdrawal_id`. There is no `Movement` entity — the bank leg is `Withdrawal.account_id`.
- [ ] AC-3: Enforces BR-23 (retain): a `retain` disposition creates a `Contribution` (savings credit) **dated at the credit date**, linked from the line via `retained_contribution_id`; the retained amount joins next year's BR-09 time-weighted base from that credit date (O10).
- [ ] AC-4: Enforces BR-22: the sum of all dispositioned amounts `Σ === reparto_total` exactly in `decimal(18,4)` (each member's dispositioned amount equals her reconciled `final_share`, US-113); a mismatch blocks approval.
- [ ] AC-5: Surfaces on `SCR-year-end-share-out`; every disposition (and its motive) is org/group-scoped (RLS) and recorded in the audit log; created `Withdrawal`/`Contribution` rows are immutable ledger entries.

## Technical Notes
- **Data model:** `YearEndShareOutLine` gains `disposition`, `disposition_motive`, `withdrawal_id`, `retained_contribution_id`. Withdraw → `Withdrawal` (`kind=year_end_share_out`, `account_id` from member's account, CHG-001). Retain → `Contribution` dated at the credit date. HR-25 migration (`slug=share_out_line_disposition`).
- **API / surface:** Per-line disposition server action on `SCR-year-end-share-out` (treasurer, at approval); creates the linked ledger entry and back-links the id. No `Movement` entity.
- **Business-rule execution:** BR-23 (withdraw→Withdrawal, retain→Contribution at credit date, joins next-year time-weighted base, O10) + BR-22 (Σ dispositioned === reparto_total). Disposition is recorded only at/through approval.
- **Multi-tenancy / audit:** Org/group RLS; each disposition + motive audit-logged; ledger entries (Withdrawal/Contribution) immutable. Composes with CHG-001 member accounts.

## Test Strategy
- Golden file: 2025 dispositioned share-out — Σ(withdraw + retain amounts) === reparto_total; a `retain` Contribution's credit date carries into the next year's USD-días base (US-009).
- Property test: a line cannot be approved without `disposition` + `disposition_motive`; withdraw creates exactly one `Withdrawal` (correct `account_id`), retain exactly one `Contribution`.
- Integration: `Σ` dispositioned === `reparto_total` in `decimal(18,4)`; mismatch blocks approval; ledger entries immutable.

## Dependencies
- **US-053** (Blocked By) — the year-end share-out approval flow this disposition step hooks into.
- **US-091** (Blocked By) — member bank accounts / `Withdrawal` machinery (`account_id`, CHG-001) used by the withdraw leg.
- **US-092** (Blocked By) — `Contribution` (savings credit) machinery used by the retain leg.
