# US-120: Monthly group summary report (RESUMEN MENSUAL, CHG-007)

> **Sprint 12** | **P1** | **3 SP** | **R1** | — Monthly group summary report (RESUMEN MENSUAL, CHG-007)

## User Story

As a Treasurer, I want a monthly group summary by rubro (inflows/outflows), so that I have month-to-month transparency.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-120 |
| Feature | — Monthly group summary report (RESUMEN MENSUAL, CHG-007) |
| Sprint | Sprint 12 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | — |
| Backstage Process | S5/S6; report layer |
| Blocked By | US-046, US-047 |

## Acceptance Criteria

- [ ] AC-1: (R2) The system produces a monthly group-summary PDF (`StatementArchive kind=monthly_summary`) — the `RESUMEN MENSUAL` — listing group-level inflows and outflows aggregated by rubro for a given month.
- [ ] AC-2: Figures are derived from the monthly close (US-046) — the summary reflects the closed month's ledger and never recomputes from open/mutable data.
- [ ] AC-3: Each generated summary carries a verify-hash; re-generation for the same group+month is idempotent (same inputs → same hash) and produces no duplicate archive entry.
- [ ] AC-4: The rubro breakdown (categories) is consistent with the expense/movement categorization used elsewhere (BR-13), so the monthly summary reconciles against the daily ledger total for the month.
- [ ] AC-5: This is an R2 report with no R1 screen — the artifact is a PDF in the statements archive; it is active-group scoped (BR-25 isolation). No governing BR (Business Rules row `—`).

## Technical Notes
- **Data model (read-only):** consumes the monthly `PeriodClose` (US-046) + categorized ledger movements (US-047); writes a `StatementArchive` row (`kind=monthly_summary`, verify-hash). No new tables.
- **API / surface:** report-generation server action producing the monthly-summary PDF (R2). No R1 screen/route; surfaced via the statements archive when R2 lands.
- **Business-rule execution:** no governing BR (Business Rules `—`); rubro aggregation reuses BR-13 categorization for consistency.
- **Multi-tenancy / audit:** org + active-group scoped (RLS); archived PDF is immutable with a verify-hash.

## Test Strategy
- Golden file: a month's `RESUMEN MENSUAL` ties to the client's `resumen` sheet (inflows/outflows by rubro).
- Reconciliation test: the sum of rubro inflows minus outflows equals the month's net ledger movement (BR-13 categories).
- Idempotency test: re-generating a group+month yields an identical verify-hash with no duplicate archive entry.

## Dependencies
- **US-046** (Blocked By) — provides the monthly `PeriodClose`; the summary is derived from the closed month, so the close must exist first.
- **US-047** (Blocked By) — provides categorized/rubro-tagged ledger movements that the summary aggregates by rubro.
