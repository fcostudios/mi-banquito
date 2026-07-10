# Effectiveness-critical paths

> Generated from `nous.db` — do not hand-edit. The few areas where a silent fault is
> materially costly. Mutation testing (the effectiveness gate) runs on the diff intersected
> with this set. Governed by the **Test Effectiveness Standard** §3.1.

## Always-mandated (Standard §3.1)

- **Tenant isolation** — every path that touches tenant-scoped data (filtered by `org_id`). → explicit isolation assertions (a query for tenant A must never return tenant B's rows).
- **Authorization** — role/permission gates on commands/mutations. → integration tests for allowed vs forbidden (expect 403).
- **Money / tax / financial math** (if present) — amounts, rounding, and idempotency of charge/ledger events. → property-based + a provider contract test.

## Critical business rules

_No business rules declared `critical: true` yet. Declare them in `09b_business_rules` (oracle + critical) and re-hydrate._

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
