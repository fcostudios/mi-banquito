# US-014: Set up business-rule test infrastructure golden files property-based

> **Sprint 0** | **P0** | **5 SP** | **R1** | FEAT-014

## User Story
As an operator, I want business-rule fidelity guaranteed in CI through golden-file and property-based tests, so that BR-XX behavior cannot regress unnoticed.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-014 |
| Feature | FEAT-014 — Set up business-rule test infrastructure golden files property-based |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-001 |
## Acceptance Criteria
- [ ] AC-1: A `packages/domain/rules/__fixtures__/*.json` directory exists for golden-file fixtures.
- [ ] AC-2: A property-based testing harness (fast-check, or vitest-integrated equivalent) is set up.
- [ ] AC-3: The BR-01 declining-balance fixture `BR-01__1000_4pct_10mo_with_admin_fee.json` reproduces the worked example in `09b_business_rules.md §4 BR-01` bit-for-bit ($1000 principal, 4% monthly, 10-month term, 1% admin fee → installments 150.00, 136.00, … 104.00; totals 1230.00).
- [ ] AC-4: CI (US-013, `pnpm test`) runs both the golden-file tests and the property tests.
- [ ] AC-5: A representative property invariant is asserted (e.g. BR-01 `interest_due` is monotonically non-increasing across periods).
- [ ] AC-6: A deliberate change to the rule output fails the golden-file test (the gate actually bites).

## Technical Notes
- **Data model / infra:** No DB. Establishes the fixture + property-test scaffold under `packages/domain`. The BR-01 reference value comes from `09b_business_rules.md §4 BR-01`; the rule implementation it guards lives at `packages/domain/rules/loans/declining-balance.ts` (built in a later loan story).
- **API / surface:** `packages/domain/rules/__fixtures__/`, the property-test config, and the golden-file runner wired into `pnpm test`.
- **Business-rule execution:** This story does not author the rules themselves; it builds the harness that locks them. BR-01 is referenced only as the seed fixture and example — no new BRs are introduced (the Meta Business Rules row stays `—`).
- **Multi-tenancy / audit:** None.

## Test Strategy
- Golden-file: the BR-01 fixture matches `09b §4` bit-for-bit; mutate the expected output and confirm the test fails.
- Property-based: `interest_due[p]` non-increasing; `sum(principal_due) == principal`; `sum(installments) == principal + total_interest + admin_fee`.
- CI smoke confirms both suites run under `pnpm test`.

## Dependencies
- US-001 — the `packages/domain` workspace must exist to host the fixtures and harness (scope Prerequisite: US-001). The harness is later exercised by US-013's CI `pnpm test` gate.
