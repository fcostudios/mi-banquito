# US-119: Year-end per-member economic summary (Saldo Económico, CHG-007)

> **Sprint 12** | **P1** | **3 SP** | **R1** | — Year-end per-member economic summary (Saldo Económico, CHG-007)

## User Story

As a Treasurer, I want a per-member year-end economic summary (aportes semanales/anuales/préstamos), so that each socia sees her year at a glance.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-119 |
| Feature | — Year-end per-member economic summary (Saldo Económico, CHG-007) |
| Sprint | Sprint 12 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | — |
| Backstage Process | S6; P15 |
| Blocked By | US-053, US-105 |

## Acceptance Criteria

- [ ] AC-1: The system produces a per-member year-end economic-summary PDF (`StatementArchive kind=year_end_economic_summary`) showing, for each socia: aportes semanales, aportes anuales, and préstamos for the closed fiscal year (the `Saldo Económico` view).
- [ ] AC-2: Each generated summary carries a verify-hash (US-085) and is immutable once archived; re-generation for the same member+year is idempotent (same inputs → same hash).
- [ ] AC-3: Generated summaries are listed and previewable in `SCR-statements-archive` (one entry per member per year, labelled and dated).
- [ ] AC-4: Figures are **derived** from the closed-year snapshot and the share-out outputs — consistent with the `BALANCE BANQUITO` (US-118): per OQ-BR24-1 the CxC sign is netted once in the surplus base so the economic summary and the balance agree.
- [ ] AC-5: Summaries are active-group scoped — a member's summary reflects only the active group's data (BR-25 isolation); no business rule beyond derivation governs this report (Business Rules row `—`).

## Technical Notes
- **Data model (read-only):** consumes the per-member `YearEndBalanceSnapshotLine` (aportes semanales/anuales) + share-out / loan figures (préstamos) from US-053; writes `StatementArchive` rows (`kind=year_end_economic_summary`, verify-hash). No new tables.
- **API / surface:** report-generation server action producing the per-member PDFs; `SCR-statements-archive` lists + previews them. No new route beyond the archive screen.
- **Business-rule execution:** no governing BR (Business Rules `—`); it is a derived report. Consistency with BR-24 (balance) is maintained by sourcing the same netted surplus base (BR-19).
- **Multi-tenancy / audit:** org + active-group scoped (RLS); archived PDFs are immutable with verify-hashes.

## Test Strategy
- Golden file: a member's 2025 economic summary ties to the client's `Saldo Economico` sheet (aportes semanales/anuales/préstamos).
- Idempotency test: re-generating a member+year yields an identical verify-hash; no duplicate archive entries.
- Integration test: generated summaries appear and preview correctly in `SCR-statements-archive`; consistency check that per-member totals reconcile against the group balance (US-118).

## Dependencies
- **US-053** (Blocked By) — the year-end share-out writes the payout/loan figures (préstamos) the summary reports; those outputs must exist first.
- **US-105** (Blocked By) — provides the immutable year-end snapshot (BR-18) supplying aportes semanales/anuales per member.
