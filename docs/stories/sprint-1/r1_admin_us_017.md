# US-017: Platform operator configures group rules including 11 business rules

> **Sprint 1** | **P0** | **2 SP** | **R1** | FEAT-017

## User Story

As a platform operator, I want to capture the group's specific rules at setup, so that the loan engine and share-out engine operate per the group's actual policy.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-017 |
| Feature | FEAT-017 — Platform operator configures group rules including 11 business rules |
| Sprint | Sprint 1 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Platform |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-016 |
## Acceptance Criteria

- [ ] AC-1: `SCR-admin-org-config` (route `/admin/orgs/[id]/config`) exposes form sub-sections for every group rule: contribution cycle (kind, amount, opens-on day), loan rate model (default `declining_balance`), loan rate values (member + non-member captured separately), period unit (default monthly), grace periods, loan-to-savings cap, admin fee pct, referral commission amount, treasurer compensation (kind + amount + period), base-fund quota for the current fiscal year, fiscal-year start month + day, year-end share-out formula, reconciliation tolerance, and late + mora thresholds.
- [ ] AC-2: Saving the form writes a **new `GroupConfig` version** (HR-1): the prior version's `valid_to` is set and the new version becomes current; no in-place mutation of an existing version row.
- [ ] AC-3: An `AuditLogEntry` records the config change (operator, before/after, version), and a treasurer-readable "lee esto con tu tesorera" summary is surfaced in es-EC after save.
- [ ] AC-4: Hot/queried values (rates, thresholds) persist as typed columns; the rule-param long-tail (`config.mora`, `config.distribution`) persists in the typed, zod-validated `config jsonb` lane and is rejected loudly on schema-invalid input (D-ARCH-1).
- [ ] AC-5: Config is org-scoped (RLS); the operator may only edit the org named in the route. The base-fund quota entry creates/updates the `BaseFundQuotaConfig` row for the current fiscal year (UNIQUE `org_id, fiscal_year`).

## Technical Notes
- **Data model:** appends a `GroupConfig` version via the `EntityVersion` sink (HR-1; `requires_versioning: yes`); upserts `BaseFundQuotaConfig` for the fiscal year; writes `AuditLogEntry`. Typed columns for hot values + `config jsonb` lane for the long-tail. No `Vxxx` migration introduced.
- **API / surface:** Server Action behind `/admin/orgs/[id]/config`; single screen `SCR-admin-org-config` with one sub-section per rule group (significant form UX — all rules on one screen).
- **Business-rule execution:** Meta Business Rules is `—` (this story *configures* parameters; it does not itself enforce a BR). The values it captures are the inputs consumed by BR-01..BR-11 (rate/period → BR-01/02/04, admin fee → BR-03, referral → BR-06, treasurer comp → BR-07, base-fund quota → BR-08, fiscal year → BR-10, mora thresholds → BR-17) via `comp_business_rule_engine_013` / `loadConfig(orgId, asOf)`.
- **Multi-tenancy / audit:** org-scoped under RLS; every save is HR-1 versioned and audit-logged; rule functions later read the stamped version (`group_config_version_at_origination`) so existing loans are unaffected by a later edit (OQ-BR2-1).

## Test Strategy
- Integration: a save creates a new `GroupConfig` version (old `valid_to` set, new current) + one `AuditLogEntry`; base-fund-quota field upserts `BaseFundQuotaConfig`.
- Unit/validation: each sub-section validates (member vs non-member rate captured separately; required fiscal-year fields); `config jsonb` rejected when it fails the `RuleConfig` zod schema.
- Golden/replay: a versioned config round-trips through `loadConfig` and reproduces the expected `RuleContext`.

## Dependencies
- US-016 — the `Organization` + seeded `GroupConfig` v1 must already exist; this story refines v1 into the group's actual policy.
