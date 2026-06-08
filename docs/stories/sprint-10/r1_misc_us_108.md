# US-108: Period/method-freeze guard at year-end (BR-09 / BR-18)

> **Sprint 10** | **P1** | **3 SP** | **R1** | — Period/method-freeze guard at year-end (BR-09 / BR-18)

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-108 |
| Feature | — Period/method-freeze guard at year-end (BR-09 / BR-18) |
| Sprint | Sprint 10 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | misc |
| Business Rules | — |
| Backstage Process | S5 close |
| Blocked By | US-046, US-100 |

## User Story
As the close-time integrity guard, I want to freeze the savings method and the `GroupConfig` version for a closed period, so that a closed year's computations never change retroactively and remain editable only for the next period.

## Acceptance Criteria
- [ ] AC-1: At `PeriodClose(is_year_end)`, the year-end snapshot and the share-out both stamp the `group_config_version` in force at close (period-locked / governance-snapshot temporal mode). (BR-18)
- [ ] AC-2: A later `GroupConfig` edit (incl. the BR-09 savings method/rate) applies only to the **next** period — it never alters the closed period's stamped version. All affected money math stays `decimal(18,4)`.
- [ ] AC-3: Reads for the closed period resolve the **frozen** version via `loadConfig` (governance-snapshot mode), reproducing the same figures regardless of subsequent config edits (replay-safe).
- [ ] AC-4: A post-close config edit produces a new `GroupConfig` version (HR-1) without mutating the frozen one; the closed period's reads are unaffected.

## Technical Notes
- **Data model:** the year-end snapshot (US-105) + share-out records carry the frozen `group_config_version`; closed periods are not re-versioned.
- **API / surface:** close-time guard at `PeriodClose(is_year_end)` (Layer 2/3); S5 close. No screens (n/a).
- **Business-rule execution:** period-locked / governance-snapshot temporal mode — `loadConfig` for a closed period resolves the version frozen at `PeriodClose`; forward edits resolve the new version for the next period (BR-09 method/rate included).
- **Multi-tenancy / audit:** `org_id`-scoped; HR-1 `EntityVersion` history shows the version frozen at each close; replay reproduces closed-period figures from the stamped version.

## Test Strategy
- Property test: after a close, a `GroupConfig` edit leaves closed-period reads byte-identical; only next-period reads change.
- Replay test: recomputing a closed period from the frozen `group_config_version` reproduces the snapshot/share-out figures.
- Versioning test: a post-close edit creates a new version without mutating the frozen one.

## Dependencies
- **US-046** (Blocked By) — provides the `PeriodClose(is_year_end)` event at which the version is frozen.
- **US-100** (Blocked By) — provides the temporal-mode resolver (`loadConfig`, period-locked / governance-snapshot mode) that enforces the frozen-version read for closed periods.
