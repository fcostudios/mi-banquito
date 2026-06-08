# US-118: BALANCE BANQUITO balance sheet + screen (CHG-007, GAP-4)

> **Sprint 12** | **P1** | **3 SP** | **R1** | — BALANCE BANQUITO balance sheet + screen (CHG-007, GAP-4)

## User Story

As a Treasurer / President, I want to see the year-end balance sheet (ACTIVOS = PASIVOS), so that the Assembly reads a credible `BALANCE BANQUITO al 31/dic`.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-118 |
| Feature | — BALANCE BANQUITO balance sheet + screen (CHG-007, GAP-4) |
| Sprint | Sprint 12 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | BR-24 |
| Backstage Process | S6; `GenerateBalanceBanquito`; BR-24 |
| Blocked By | US-105, US-110 |

## Acceptance Criteria

- [ ] AC-1: `SCR-balance-banquito` (route `/balance`) renders the `BALANCE BANQUITO al 31/dic` with ACTIVOS (préstamos por cobrar, intereses por cobrar, banco/caja) on one side and PASIVOS/PATRIMONIO (ahorros, cuota anual acumulada, excedente del año = reparto + reserva) on the other.
- [ ] AC-2: BR-24 — the balance is **derived** (read-only) from the immutable `YearEndBalanceSnapshot` (CHG-003/BR-18) + the year's surplus/reparto (CHG-004/BR-19/BR-20); there is no editable balance, and `GenerateBalanceBanquito` MUST assert `ACTIVOS === PASIVOS` (`decimal(18,4)`) before producing any output.
- [ ] AC-3: When `ACTIVOS !== PASIVOS`, generation fails loudly (no PDF archived) — corrections flow through the ledger + a new snapshot, never through editing the balance.
- [ ] AC-4: Exporting produces an immutable `StatementArchive` (`kind=balance_banquito`) PDF carrying a verify-hash (US-085); re-export of the same snapshot+surplus is idempotent (same content → same hash).
- [ ] AC-5: The nav map gains the route/node/edge + role-based view for `SCR-balance-banquito` and a sidebar item `nav-balance` (HR-30: id/route/icon/roles/label_en/label_es/labelKey, and each (item, role) mirrored in `role_based_views.<role>.sidebar`).
- [ ] AC-6: The screen is scoped to the active group only — the balance reflects the active group's snapshot, never another group's (composes BR-25 isolation).

## Technical Notes
- **Data model (read-only):** consumes `YearEndBalanceSnapshot` + `YearEndBalanceSnapshotLine` (BR-18) and the surplus/reparto figures (BR-19/BR-20); writes a `StatementArchive` row (`kind=balance_banquito`, verify-hash). No new tables.
- **API / surface:** `GET /balance` server action / read endpoint backing `SCR-balance-banquito`; PDF export action invoking `GenerateBalanceBanquito`. Nav-map updates per HR-30 (`nav-balance` sidebar item) + HR-31 (route has no dynamic params → `_No dynamic route parameters._`).
- **Business-rule execution:** BR-24 enforced at Layer 2 in `GenerateBalanceBanquito` — derive from snapshot + surplus, assert `ACTIVOS === PASIVOS`, then archive. The CxC sign is netted once in the surplus base (BR-19, per OQ-BR24-1) so balance and economic summary stay consistent.
- **Multi-tenancy / audit:** org + active-group scoped (RLS); the archived PDF is immutable with a verify-hash; corrections never mutate — a new snapshot supersedes.

## Test Strategy
- Property test: for any `YearEndBalanceSnapshot` + surplus inputs, `GenerateBalanceBanquito` yields `ACTIVOS === PASIVOS` or refuses to archive.
- Golden file: the 2025 balance ties exactly to the client's `BALANCE BANQUITO al 31/dic` workbook figures.
- Idempotency test: re-export of the same snapshot+surplus produces an identical verify-hash; an imbalanced fixture fails generation with no archived PDF.
- Nav-map / sidebar consistency test (HR-30) for the `nav-balance` item.

## Dependencies
- **US-105** (Blocked By) — provides the immutable year-end snapshot pipeline (BR-18); the balance sheet is derived from that snapshot, so it must exist first.
- **US-110** (Blocked By) — provides the surplus/reparto figures (BR-19/BR-20) that feed the PASIVOS/PATRIMONIO "excedente del año" line; without them the balance cannot reconcile.
