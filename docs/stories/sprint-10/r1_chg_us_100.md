# US-100: BR config substrate + resolution contract (CHG-002; precedes the config-driven rules)

> **Sprint 10** | **P1** | **3 SP** | **R1** | — BR config substrate + resolution contract (CHG-002; precedes the config-driven rules)

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-100 |
| Feature | — BR config substrate + resolution contract (CHG-002; precedes the config-driven rules) |
| Sprint | Sprint 10 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | — |
| Backstage Process | cross-cutting (Layer 2 rule execution) |
| Blocked By | US-008 |

## User Story
As the rule-execution substrate (D-ARCH-1/2/3), I want a typed, zod-validated `config` lane plus a deterministic config resolver, so that config-driven rules (mora, two-pool) and action-time rules (payment allocation) read the right values and the right version purely and replayably.

## Acceptance Criteria
- [ ] AC-1: A `GroupConfig.config jsonb` lane exists, parsed by a `RuleConfig` zod schema with `config.mora` and `config.distribution` reserved; the schema validates on both write and read and fails loud on a malformed payload.
- [ ] AC-2: `loadConfig(orgId, asOf)` returns a **frozen** `RuleContext` that (a) resolves the active `GroupConfig` version, (b) parses it through `RuleConfig` zod, (c) deep-merges platform defaults **under** the per-group overrides (defaults-at-read for keys absent on older versions — never backfilling a versioned row). A rule function never reads the DB or the clock; it only receives the `RuleContext`.
- [ ] AC-3: A rule **registry keyed by stable BR-id** (`packages/domain/rules/index.ts`) dispatches each rule; every output records which BR-id and which `group_config_version` produced it. The registry supports both config-driven scheduled rules (`BR-17`, `BR-19`/`BR-21`) and action-time rules such as `BR-26` member-payment allocation.
- [ ] AC-4: All three temporal version-selection modes are implemented — **stamped** (loans read `group_config_version_at_origination`), **period-locked / governance-snapshot** (year-end reads the version frozen at `PeriodClose`/`SurplusGovernanceDecision`), and **per-accrual-day** (mora reads the version in force on each `accrued_on`; a span crossing a config change splits at the new version's `valid_from`).
- [ ] AC-5: All money math is `decimal(18,4)` end-to-end with no float intermediates.
- [ ] AC-6: Golden + property tests cover the resolver, defaults-at-read merge, and zod validation (incl. defaults applied for keys missing on an old version, and version splitting across a `valid_from`).

## Technical Notes
- **Data model:** add `GroupConfig.config jsonb` (the typed rule-param long-tail; hot/queried values stay typed columns). No new tables; HR-1 versioning already applies to `GroupConfig` via its `_history`/`entity_versions` companion.
- **API / surface:** none — cross-cutting Layer 2 substrate; no screens (n/a).
- **Business-rule execution:** `loadConfig(orgId, asOf) → frozen RuleContext`; registry dispatch by BR-id in `packages/domain/rules/index.ts`; temporal modes stamped / period-locked / per-accrual-day (SEC20). Reserved config keys: `config.mora`, `config.distribution`; action-time rules such as `BR-26` receive an explicit input snapshot and return stamped allocation outputs.
- **Multi-tenancy / audit:** `org_id`-scoped; per-group override of platform defaults; HR-1 `EntityVersion` history on every `GroupConfig` change; each rule output stamps the producing BR-id + `group_config_version` for audit-by-replay.

## Test Strategy
- Property test: defaults-at-read deep-merge (per-group override wins; missing keys fall to platform defaults; old versions never backfilled).
- Property test: per-accrual-day span crossing a config-version change splits at `valid_from`.
- Golden file: a fixed config resolves to a stable, frozen `RuleContext`.
- Validation test: malformed `config` fails zod loud on both write and read paths.

## Dependencies
- **US-008** (Blocked By) — the `GroupConfig` entity + versioning substrate this lane and resolver extend; the config lane cannot be added or resolved without it.
