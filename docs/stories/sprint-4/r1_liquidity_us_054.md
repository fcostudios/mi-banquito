# US-054: Treasurer views Liquidez Proyectada single screen with sandbox

> **Sprint 4** | **P0** | **3 SP** | **R1** | FEAT-054

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-054 |
| Feature | FEAT-054 — Treasurer views Liquidez Proyectada single screen with sandbox |
| Sprint | Sprint 4 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant liquidity |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008 |
## User Story
As a treasurer, I want to see whether my group can sustain new loans plus the year-end share-out on one screen, so that I avoid liquidity surprises.

## Acceptance Criteria
- [ ] AC-1: `/liquidez` (SCR-cash-flow-projection) renders a 12-month projection line chart in the calm "Azul Cuenta" brand color, sourced from `mv_liquidez_proyectada`.
- [ ] AC-2: A narrative summary is shown in es-EC, e.g.: "Tu mes mínimo es noviembre con USD X. Llegarás a fin de año con USD Y, lo cual está USD Z {por debajo|por encima} del compromiso." with X (min-month value), Y (year-end value), Z (delta vs the year-end share-out commitment) interpolated.
- [ ] AC-3: The available-capital figure is shown prominently and equals `pool − base fund` (from `mv_available_capital`), with the base-fund subtraction visible/explained on-screen.
- [ ] AC-4: An optional "Considerar un préstamo" sandbox input lets the treasurer enter a hypothetical loan; the projection + narrative recompute client-side without persisting anything (read-only what-if).
- [ ] AC-5: All figures are org-scoped to the active group; the year-end commitment uses `GroupConfig.year_end_share_out_formula`.

## Technical Notes
- **Data model:** read-only derived views `mv_liquidez_proyectada` (12-month projected balance) and `mv_available_capital` (= pool − base fund). If absent, add via HR-25 timestamp-slug migrations (`slug=liquidez_proyectada`, `slug=available_capital`). Reads `GroupConfig.year_end_share_out_formula`.
- **API / surface:** server action returning the projection series + available capital + commitment for the active org; SCR-cash-flow-projection extended with the available-capital figure and base-fund subtraction. Sandbox recompute is client-side (no write).
- **Business-rule execution:** no locked BR enforced here — this is the S4 TO-BE liquidity projection (P9 ProjectCashFlow). The base-fund quota concept aligns with BR-08, and the year-end commitment with the BR-09/BR-21 share-out, but this story only *projects/reads*, it does not compute the share-out.
- **Multi-tenancy / audit:** projection queries filtered by active `org_id`; read-only, no audit entry. The sandbox what-if never mutates state.

## Test Strategy
- Unit: narrative string assembly — min-month detection, `{por debajo|por encima}` selection by sign of Z, USD formatting.
- Golden-file: a seeded ledger fixture yields a deterministic 12-point projection and available-capital figure.
- Integration: entering a sandbox loan shifts the projected curve + narrative without writing to the DB; cross-org isolation on the views.

## Dependencies
- Blocked By: — (no story-level blocker declared). Functional prerequisite per scope: US-008 (group/config foundation that the projection and `year_end_share_out_formula` depend on).
