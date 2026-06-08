# US-099: Statements, cash-flow, and public-verify reflect all movements net + collections

> **Sprint 9** | **P1** | **3 SP** | **R2** | FEAT-CHG001-09

## User Story

As a member / presidente / anyone with the public link, I want to see the fund balance net of fees and expenses, plus any solidarity collection I took part in, so that the number I see is the real, spendable fund and nothing is off-ledger.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-099 |
| Feature | FEAT-CHG001-09 — Statements, cash-flow, and public-verify reflect all movements net + collections |
| Sprint | Sprint 9 |
| Priority | P1 |
| Size | 3 SP |
| Release | R2 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |


## Acceptance Criteria

- [ ] AC-1: The per-member statement (US-048), `SCR-statements-archive`, `SCR-cash-flow-projection`, the `SCR-year-end-share-out` base, and `SCR-public-verify-pdf` are all extended to include `Expense` rows (by `category`), `Transfer` rows (regularizations visible), and `ExtraordinaryCollection` lines/payouts for the period/member.
- [ ] AC-2: The fund balance shown is **net** of expenses and fees (not gross inflow); all balances are decimal(18,4) money math.
- [ ] AC-3: The share-out base (BR-09) computes on the **regularized group-fund balance** — pending (non-group-fund) inflows do not inflate it (composes BR-12).
- [ ] AC-4: A transparency test asserts that **every** `Expense`, `Transfer`, and `ExtraordinaryCollection` line/payout in the period appears on the relevant surface — no omissions (BR-16).
- [ ] AC-5: `ExtraordinaryCollection` activity is shown to the contributors who took part (their statement) and on public-verify, but is excluded from the share-out distributable base (BR-14).
- [ ] AC-6: Renderers read append-only ledger rows only; a reversing entry (`reverses_id`) nets correctly in the displayed totals (BR-16), and no row is silently hidden.

## Technical Notes
- **Data model:** read-side only — no new tables. Aggregates over `Expense` (by `category`), `Transfer` (incl. `purpose = regularization`), `ExtraordinaryCollection` + lines/payouts, scoped to a member or period. Net fund balance = group-fund inflows − expenses/fees over regularized rows.
- **API / surface:** extend existing statement/verify renderers across `SCR-statements-archive`, `SCR-cash-flow-projection`, `SCR-year-end-share-out`, `SCR-public-verify-pdf`, and the per-member statement PDF (US-048). Processes `P_RenderStatement` / `P_PublicVerify`.
- **Business-rule execution:** BR-16 (transparency: every movement/transfer/collection visible) at Layer 3 renderers; BR-09 (share-out base on regularized group-fund balance, net) — base query filters to `is_group_fund` + `reconciliation_status = regularized` and nets expenses.
- **Multi-tenancy / audit:** `org_id`-scoped reads; public-verify exposes only the org's own ledger; rendered figures derive from append-only rows so they reconcile to the audit trail (BR-16).

## Test Strategy
- Transparency test: enumerate every `Expense`/`Transfer`/`ExtraordinaryCollection` row in a period and assert each appears on statement + public-verify (BR-16) — fails on any omission.
- Golden file: a period with fees, a regularization transfer, and a solidarity collection produces the exact net fund balance and share-out base (BR-09 on regularized balance).
- Property: a reversing entry nets to zero in displayed totals; pending inflows are excluded from the share-out base (BR-12/BR-09).
- Integration: full period across all four screens + per-member PDF renders consistent net figures.

## Dependencies
- Functional prerequisites (scope): **US-092** + **US-094** (regularization/movement data), **US-097** (solidarity payout/collection to display), and **US-048** (per-member statement being extended). `Blocked By` Meta row is `—`; these produce the ledger rows these surfaces aggregate.
