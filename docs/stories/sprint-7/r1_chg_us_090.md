# US-090: System emits A11 *Aporte sin foto de comprobante (≥ N consecutivos)* (Low, treas

> **Sprint 7** | **P1** | **2 SP** | **R1** | POST_REVIEW_A11_no_slip_n_consecutive

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-090 |
| Feature | POST_REVIEW_A11_no_slip_n_consecutive — System emits A11 *Aporte sin foto de comprobante (≥ N consecutivos)* (Low, treas |
| Sprint | Sprint 7 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008, US-029 |
## User Story
As a treasurer, I want a gentle alert when a member's last few contributions all lack a slip photo, so that I can ask for the receipts and keep the records well-backed.

## Acceptance Criteria
- [ ] AC-1: The emitter runs **post-commit on `RecordContribution` (P1)**.
- [ ] AC-2: For the contributing member, if the **last N contributions** (default `N = 3`) all have `slip_photo_id IS NULL`, an `Alert` is written with `kind = A11`, `severity = low`, `audience = treasurer`.
- [ ] AC-3: The Spanish copy is: *"Los últimos {n} aportes de {member} no tienen foto adjunta. Considera pedirla para mantener el respaldo."* with `{n}` the configured threshold.
- [ ] AC-4: De-dup honors `dedup_window = 7d` on `(org_id, A11, subject_id=member_id, window)` — a follow-up no-photo contribution within 7 days does not re-emit.
- [ ] AC-5: Recording a contribution **with** a slip photo breaks the streak, so the next evaluation no longer trips A11 for that member.
- [ ] AC-6: The threshold `N` is configurable (default 3) via `GroupConfig.config` rather than hardcoded.

## Technical Notes
- **Data model:** Append-only `Alert`; `subject_id = member_id`. Reads the member's most-recent N `Contribution` rows and their `slip_photo_id`. Threshold from `GroupConfig.config` (e.g. `no_slip_consecutive_threshold`, default 3). No migration (A11 exists in the catalogue; added as a new emit story per Verifier F2).
- **API / surface:** No dedicated screen — surfaced by the alert bell. Emitter is `comp_alert_engine_009` via FEAT-P17 EmitAlert on the post-commit hook of `RecordContribution` (US-029, S2 journey).
- **Business-rule execution:** No BR-NN; the streak threshold is config-driven (`GroupConfig.config`). Evaluation considers only the contiguous most-recent N contributions for the member.
- **Multi-tenancy / audit:** Org-scoped `Alert` under RLS; emitted within the contribution write's transaction context.

## Test Strategy
- Unit: streak detector — N consecutive null-`slip_photo_id` trips; a photo within the window breaks the streak (no emit).
- Integration: record N photo-less contributions → exactly one low A11 with correct `{n}`/`{member}`; a subsequent photo-less contribution within 7d → no duplicate (dedup); changing `N` in `GroupConfig.config` shifts the trigger point.

## Dependencies
- Blocked By row is `—`. Scope prerequisites US-029 (record a contribution with slip photo) and US-008 (member/contribution substrate) supply the contributions and `slip_photo_id` this emitter inspects (addresses Verifier F2).
