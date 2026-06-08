# US-116: Account product-type + institution + Country/Institution reference seed (CHG-006)

> **Sprint 12** | **P1** | **3 SP** | **R1** | — Account product-type + institution + Country/Institution reference seed (CHG-006)

## User Story

As a System / Operator, I want to enrich accounts with product type + institution and seed the reference data, so that accounts and reports are institution-aware.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-116 |
| Feature | — Account product-type + institution + Country/Institution reference seed (CHG-006) |
| Sprint | Sprint 12 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | — |
| Backstage Process | S1 setup / S7 accounts |
| Blocked By | US-091 |

## Acceptance Criteria

- [ ] AC-1: A single HR-25 timestamp-slug migration (`slug=account_product_type_institution_ref`) creates the `Country` and `Institution` reference tables and adds `Account.product_type` (enum `{savings, checking}`, nullable) + `Account.institution_id` (nullable FK → `Institution.id`).
- [ ] AC-2: Given the migration runs, when seed data is applied, then `Country` contains `Ecuador (currency USD)` and `Institution` contains exactly: Banco Pichincha, Banco Guayaquil, Banco Produbanco, Cooperativa Andalucía, Cooperativa 29 de Octubre — each linked to the Ecuador `Country` row.
- [ ] AC-3: Reference data (`Country`, `Institution`) is admin-owned and read-only to treasurers — no treasurer-facing create/update/delete surface exists (the R3+ admin CRUD is deferred to US-117).
- [ ] AC-4: `SCR-accounts` surfaces each account's `product_type` and `institution` (institution display name); a group bank/savings account can carry both fields.
- [ ] AC-5: For accounts of kind `cash_box` or `treasurer_personal`, both `product_type` and `institution_id` are NULL and the screen renders no product-type/institution chip for them (validation rejects a non-null value for these kinds).
- [ ] AC-6: The migration is idempotent/replayable — re-running the seed does not duplicate `Country`/`Institution` rows (upsert on natural key).

## Technical Notes
- **Data model:** new reference tables `Country` (id, name, currency_code) and `Institution` (id, country_id FK → Country, name, kind {bank, cooperative}); altered `Account` gains `product_type enum`, `institution_id FK → Institution` (both nullable, NULL for `cash_box`/`treasurer_personal`). Single HR-25 timestamp-slug migration declared `slug=account_product_type_institution_ref`; never allocate a `Vxxx`.
- **API / surface:** `SCR-accounts` read surface adds product-type + institution columns/chips; account create/edit server action validates the `cash_box`/`treasurer_personal` → NULL constraint. No treasurer write path to reference tables.
- **Business-rule execution:** no BR governs this story (Business Rules row `—`); it is the data-model + seed substrate that downstream institution-aware reporting builds on.
- **Multi-tenancy / audit:** `Country`/`Institution` are org-agnostic platform reference data (shared, not org-scoped); `Account` rows remain org-scoped under existing RLS. Reference rows are admin-owned; grant/revoke of admin edit access is out of scope until US-117.

## Test Strategy
- Migration test: tables created, `Account` columns added, seed yields exactly the 5 institutions + Ecuador; idempotency test asserts a re-run produces no duplicates.
- Unit/validation test: setting `product_type`/`institution_id` on a `cash_box`/`treasurer_personal` account is rejected; NULL is accepted.
- Integration/UI test: `SCR-accounts` renders product type + institution for a savings/checking account and omits them for cash-box/personal accounts.

## Dependencies
- **US-091** (Blocked By) — establishes the `Account`/`Movement` model (CHG-001 multi-account); this story extends `Account` with product-type + institution, so the account entity and its kind enum (`cash_box`/`treasurer_personal`) must exist first.
