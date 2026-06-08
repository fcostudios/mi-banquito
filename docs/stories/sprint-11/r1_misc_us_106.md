# US-106: Point-in-time balance query (any date)

> **Sprint 11** | **P1** | **3 SP** | **R1** | — Point-in-time balance query (any date)

## User Story

As a La Tesorera / auditor, I want to see a member's (and the group's) balance as of any past date so that balances are auditable without a per-year reseed.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-106 |
| Feature | — Point-in-time balance query (any date) |
| Sprint | Sprint 11 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | misc |
| Business Rules | — |
| Backstage Process | S6 statements |
| Blocked By | US-105 |

## Acceptance Criteria

- [ ] AC-1: A derived query/materialized view computes a member's balance — and the group's balance — as of an arbitrary date by folding the append-only ledger (Contributions, Repayments, Withdrawals) up to and including that date; no per-year reseed is required.
- [ ] AC-2: The point-in-time balance as of 31/dic of any closed fiscal year equals the corresponding `YearEndBalanceSnapshotLine` for that member (the immutable BR-18 snapshot), proving the derived query and the frozen snapshot agree.
- [ ] AC-3: All monetary aggregation is computed in `decimal(18,4)` with no float intermediates; the as-of date is inclusive (transactions dated on the chosen day are counted).
- [ ] AC-4: A date affordance is surfaced on `SCR-member-detail` and `SCR-statements-archive` (per the nav map); changing the date re-runs the query and re-renders balances without mutating any ledger row.
- [ ] AC-5: The query is read-only and org-scoped — it never crosses group/organization boundaries (RLS), and every invocation is attributable in the audit log when run by an auditor.

## Technical Notes
- **Data model:** No new tables. Reads the append-only ledger (`Contribution`, `Repayment`, `Withdrawal`) and validates equality against `YearEndBalanceSnapshot` / `YearEndBalanceSnapshotLine` (BR-18). No HR-25 migration needed unless an index on `(member_id, occurred_on)` is added — declare `slug=ledger_asof_index` if so.
- **API / surface:** Read-only server action `getBalanceAsOf(memberId | groupId, asOfDate)` returning a `decimal(18,4)` balance. Surfaced as a date-picker affordance on `SCR-member-detail` and `SCR-statements-archive`.
- **Business-rule execution:** No BR enforcement of its own; it is the auditable read path that the snapshot (BR-18) and downstream surplus rules (BR-19) rely on. Equality to the 31/dic snapshot line is the correctness contract.
- **Multi-tenancy / audit:** Org/group scoping via RLS; auditor reads are recorded in the audit log. No EntityVersion (read-only, no governed write).

## Test Strategy
- Golden file: as-of-31/dic balance for each 2025 member equals the seeded `YearEndBalanceSnapshotLine` (US-109 fixture).
- Property test: balance(asOf = t) + Σ(ledger entries in (t, t']) == balance(asOf = t') for any t < t' (ledger fold is monotonic and exact, no float drift).
- Integration: date affordance on `SCR-member-detail` re-queries and renders without ledger mutation.

## Dependencies
- **US-105** (Blocked By) — provides the append-only ledger + `YearEndBalanceSnapshot`/`YearEndBalanceSnapshotLine` schema this query folds and reconciles against.
