# US-109: Seed the 2025 (+ partial 2026) historical snapshot (O6)

> **Sprint 11** | **P1** | **3 SP** | **R1** | — Seed the 2025 (+ partial 2026) historical snapshot (O6)

## User Story

As a Operator/System, I want to import the 2025 year-end (and partial 2026) balances from the client workbook so that point-in-time queries + the balance sheet work for prior years and 2026's `cxc_anterior` is bootstrapped.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-109 |
| Feature | — Seed the 2025 (+ partial 2026) historical snapshot (O6) |
| Sprint | Sprint 11 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | misc |
| Business Rules | — |
| Backstage Process | brownfield seed |
| Blocked By | US-105 |

## Acceptance Criteria

- [ ] AC-1: A one-time importer reads the client's 2025 workbook (and the partial-2026 data available) and writes a `YearEndBalanceSnapshot` for fiscal year 2025 plus its per-member `YearEndBalanceSnapshotLine` rows.
- [ ] AC-2: The first-year snapshot's `prior_snapshot_id` is NULL (no prior year to chain from); any subsequent seeded year chains to its predecessor so `cxc_anterior` for 2026 is bootstrapped from the 2025 snapshot (feeds BR-19 surplus).
- [ ] AC-3: The importer is idempotent — a re-run detects the already-seeded snapshot for the (group, year) and is a no-op (no duplicate snapshot or lines, no mutation of existing rows).
- [ ] AC-4: All seeded amounts are stored in `decimal(18,4)`; per-member line totals reconcile to the workbook's group totals exactly (Σ lines == snapshot group balance), and ACTIVOS===PASIVOS holds for the seeded snapshot (BR-24 integrity, derived check).
- [ ] AC-5: The seed is org/group-scoped (RLS) and recorded in the audit log as an operator-run import; the resulting snapshot is immutable (BR-18) — corrections require a new snapshot, never an in-place edit.

## Technical Notes
- **Data model:** Writes `YearEndBalanceSnapshot` (`prior_snapshot_id` NULL for first year) + `YearEndBalanceSnapshotLine` rows. Reuses the BR-18 snapshot schema (US-105). No new tables; no HR-25 migration (data import, not schema).
- **API / surface:** One-off idempotent importer/seed script (operator-invoked, brownfield seed) — not a user screen. Keyed on `(group_id, fiscal_year)` for the no-op guard.
- **Business-rule execution:** Bootstraps the inputs for BR-19 (`cxc_anterior` from the prior snapshot) and BR-24 (balance-sheet integrity); the seeded 2025 figures are the golden source for US-106/US-110 golden files (2025 distributable = 2487).
- **Multi-tenancy / audit:** Org/group RLS; import recorded in the audit log. Immutable snapshot — no EntityVersion (re-run is a no-op, not a new version).

## Test Strategy
- Golden file: seeded 2025 snapshot + lines match the client workbook line-for-line (per-member balances, group total).
- Idempotency test: running the importer twice yields exactly one snapshot and one line-set; second run mutates nothing.
- Property/reconciliation: Σ(lines) == snapshot group balance; ACTIVOS===PASIVOS for the seeded snapshot; first-year `prior_snapshot_id` IS NULL.

## Dependencies
- **US-105** (Blocked By) — defines the `YearEndBalanceSnapshot` / `YearEndBalanceSnapshotLine` schema (BR-18) that this importer populates.
