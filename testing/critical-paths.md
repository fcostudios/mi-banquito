# Effectiveness-critical paths

> Generated from `nous.db` — do not hand-edit. The few areas where a silent fault is
> materially costly. Mutation testing (the effectiveness gate) runs on the diff intersected
> with this set. Governed by the **Test Effectiveness Standard** §3.1.

## Always-mandated (Standard §3.1)

- **Tenant isolation** — every path that touches tenant-scoped data (filtered by `org_id`). → explicit isolation assertions (a query for tenant A must never return tenant B's rows).
- **Authorization** — role/permission gates on commands/mutations. → integration tests for allowed vs forbidden (expect 403).
- **Money / tax / financial math** (if present) — amounts, rounding, and idempotency of charge/ledger events. → property-based + a provider contract test.

## Critical business rules

| Rule | Name | Oracle | Governed-by stories |
|------|------|--------|---------------------|
| BR-01 | Declining-balance interest method | property | US-033, US-036, US-037 |
| BR-09 | Time-weighted interest on savings for share-out | property | US-051, US-053, US-096, US-099, US-112 |
| BR-12 | Multi-account regularization (crown jewel) | property | US-096, US-097, US-099 |
| BR-14 | Extraordinary collection lifecycle | behavioral | US-096, US-097, US-098, US-099 |
| BR-15 | Treasurer-compensation payout requires a recognized amount | property | US-096, US-098 |
| BR-16 | Every movement is append-only, audited, and transparent | behavioral | US-096, US-097, US-098, US-099 |
| BR-18 | Year-end cut: immutable balance snapshot + period/method freeze | behavioral | US-105 |
| BR-19 | Distributable surplus | property | US-110, US-114 |
| BR-21 | Two-pool year-end distribution | property | US-112 |
| BR-22 | Exact reconciliation with ajuste line | property | US-113, US-115 |
| BR-24 | Year-end balance sheet integrity (ACTIVOS === PASIVOS) | property | US-118 |
| BR-25 | Active-group resolution & cross-group isolation | behavioral | US-125 |

## Critical entities

| Entity | Why critical | Source |
|--------|--------------|--------|
| Account | auth-sensitive entity (name heuristic) | heuristic |
| InterestAccrual | money-sensitive entity (name heuristic) | heuristic |
| LoanFee | money-sensitive entity (name heuristic) | heuristic |
| Member | auth-sensitive entity (name heuristic) | heuristic |
| Organization | tenant-sensitive entity (name heuristic) | heuristic |
| Repayment | money-sensitive entity (name heuristic) | heuristic |
| UserAccount | auth-sensitive entity (name heuristic) | heuristic |
| UserOrgMembership | auth-sensitive entity (name heuristic) | heuristic |
| YearEndBalanceSnapshot | money-sensitive entity (name heuristic) | heuristic |
| YearEndBalanceSnapshotLine | money-sensitive entity (name heuristic) | heuristic |
| member_compliance_state_view | auth-sensitive entity (name heuristic) | heuristic |
