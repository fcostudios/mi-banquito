# US-086: Per-member statement PDF + year-end PDF explain content richly

> **Sprint 5** | **P0** | **3 SP** | **R1** | REVIEW_F21_F22_F23_F52

## User Story

As a member or president, I want to read a PDF that explains itself, so that dispute resolution is by-evidence rather than by-trust.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-086 |
| Feature | REVIEW_F21_F22_F23_F52 — Per-member statement PDF + year-end PDF explain content richly |
| Sprint | Sprint 5 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |


## Acceptance Criteria

- [ ] AC-1 (per-member monthly PDF, extends US-048): includes an opening-balance row, the month-over-month delta, each contribution/withdrawal with its `SlipPhoto` reference URL, the closing balance, the treasurer's name, and the group's bank-account last-4 digits.
- [ ] AC-2 (monthly-close PDF, extends US-047): includes a per-member month-net summary table, an open-loans-with-next-due roster, an active-alerts snapshot, the annotated discrepancy with `resolution_note`, and a president-friendly headline (F21).
- [ ] AC-3 (year-end per-member PDF, extends US-053): includes accumulated savings, saldo ponderado (USD-días), the group total USD-días, the member's share %, a 3-line plain-Spanish explanation ("Tu participación es proporcional al tiempo que tu dinero estuvo en el fondo durante el año, no al saldo acumulado."), and any applied override + motivo.
- [ ] AC-4: All three sections render via the extended `organism.pdf-statement-template` using design-system tokens; copy is es-EC.
- [ ] AC-5: Adding these content sections does not change the canonical-JSON + SHA-256 hashing contract (US-047) other than incorporating the new payload fields — generation stays deterministic and idempotent (UPSERT on the natural key) so re-render of identical data yields an identical hash.
- [ ] AC-6: PDF generation (a system action) emits its `AuditLogEntry` in the same transaction as the `StatementArchive` write (NFR-SEC-04).

## Technical Notes
- **Data model:** no new entity — extends the payloads written to `StatementArchive` for `kind ∈ {member_monthly, monthly_close, year_end}`. Reads `SlipPhoto` URLs, member balances, open `Loan`/`LoanSchedule`, `Alert` snapshot, `ReconciliationCycle.resolution_note`, and year-end `saldo_ponderado_usd_dias` / share %.
- **API / surface:** extends the renderers behind US-047 (monthly close), US-048 (per-member monthly), and US-053 (year-end). New content sections in `organism.pdf-statement-template`. Surfaced on `SCR-statements-archive`.
- **Business-rule execution:** no numbered BR (Business Rules row = —); this is a content/presentation enrichment of existing artifacts. The USD-días share derivation is owned by US-053/US-110..113; this story only renders it.
- **Multi-tenancy / audit:** org-scoped via RLS; canonical payload remains the hashed source of truth (US-047/US-085 verifier). Generation emits `AuditLogEntry`.

## Test Strategy
- Golden-file: render each of the three PDF kinds from fixed fixtures → assert every required content section is present and the canonical payload/hash is byte-stable.
- Unit: bank-account last-4 masking; USD-días explanation copy in es-EC; override + motivo rendering.
- Integration: re-render with identical data UPSERTs (no duplicate `StatementArchive`, same hash); injected audit failure rolls back (NFR-SEC-04).

## Dependencies
- `Blocked By` row is `—`; scope prerequisites US-047 (monthly-close PDF), US-048 (per-member statement), US-053 (year-end share-out) — this story extends all three renderers. Addresses review findings F21, F22, F23, F52.
