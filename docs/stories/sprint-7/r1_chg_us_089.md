# US-089: System emits A9 *Cambio de configuración del grupo* (Low, treasurer)

> **Sprint 7** | **P1** | **2 SP** | **R1** | POST_REVIEW_A9_config_changed

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-089 |
| Feature | POST_REVIEW_A9_config_changed — System emits A9 *Cambio de configuración del grupo* (Low, treasurer) |
| Sprint | Sprint 7 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-017, US-028 |
## User Story
As a treasurer, I want a low-severity confirmation alert whenever I change a group-config setting, so that I have a clear record of what changed and what it affects.

## Acceptance Criteria
- [x] AC-1: The emitter runs **post-commit on any new `GroupConfig` version** (created via the HR-1 / `EntityVersion` versioning path).
- [x] AC-2: An `Alert` is written with `kind = A9`, `severity = low`, `audience = treasurer`, `dedup_window = none` (every config-version change is surfaced — no suppression window).
- [x] AC-3: The Spanish copy is **specific to which field changed**, e.g. for an interest-rate change: *"Cambiaste la tasa de interés de {old}% a {new}%. Préstamos nuevos usarán la nueva tasa; los existentes mantienen la anterior (per OQ-BR2-1)."*
- [x] AC-4: The old/new values are read from the diff between the new `GroupConfig` `EntityVersion` and its predecessor, so the copy reflects the actual change.
- [x] AC-5: A config save that produces no effective field change does not emit (no spurious A9).

## Technical Notes
- **Data model:** Append-only `Alert`; `subject_id = group_config_version_id`. Reads the new vs. prior `GroupConfig` `EntityVersion` (HR-1 / IMP-105 version sink) to compute the changed-field diff. No migration (A9 exists in the catalogue; added as a new emit story per Verifier F2).
- **API / surface:** No dedicated screen — surfaced by the alert bell. Emitter is `comp_alert_engine_009` via FEAT-P17 EmitAlert on the post-commit hook of the `GroupConfig` version write (triggered from the group-rules edit, US-028). Copy template is selected per changed field.
- **Business-rule execution:** No BR-NN gates emission; the copy references the rate-application policy (new loans use the new rate, existing keep theirs — OQ-BR2-1) but A9 itself only reports the change.
- **Multi-tenancy / audit:** Org-scoped `Alert` under RLS; the config change is independently versioned (HR-1) and audited (P18), so the alert complements the version history.

## Test Strategy
- Unit: field-diff → copy selection (rate change renders the OQ-BR2-1 template with old/new); no-op save → no emit.
- Integration: save a new `GroupConfig` version (rate change) → exactly one A9 low alert with correct old/new values; `dedup_window=none` → two distinct changes emit two alerts.

## Dependencies
- Blocked By row is `—`. Scope prerequisites US-028 (view/edit group rules with HR-1 versioning) and US-017 (group config bootstrap) supply the versioned `GroupConfig` whose changes this emitter reports (addresses Verifier F2).
