# US-087: Operator runs the design-partner onboarding ceremony with parity-check log

> **Sprint 4** | **P0** | **3 SP** | **R1** | REVIEW_F40

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-087 |
| Feature | REVIEW_F40 — Operator runs the design-partner onboarding ceremony with parity-check log |
| Sprint | Sprint 4 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## User Story
As an operator, I want to onboard the mother (design partner) through a structured parity-check process, so that the pilot's success criteria (3 clean months + "would not go back to paper") are measurable.

## Acceptance Criteria
- [ ] AC-1: A dedicated `/admin/orgs/[id]/pilot-log` page lets the operator log each bi-weekly observation for the design-partner org.
- [ ] AC-2: Each log entry captures a vocabulary-validation answer (per OQ-BR / brand questions) and a side-by-side parity check: paper notebook → system → discrepancy.
- [ ] AC-3: A 3-month pilot exit checklist auto-checks each criterion when its condition is met (e.g. 3 consecutive clean months recorded, "would not go back to paper" affirmed).
- [ ] AC-4: The operator can output a single "pilot exit report" PDF summarizing observations, parity results, and the exit-checklist state.
- [ ] AC-5: The pilot log is scoped to the selected design-partner org and is operator-only; entries are append-only and audited (BR-16).

## Technical Notes
- **Data model:** new `PilotLogEntry` (`id, org_id, observed_on, vocabulary_answer, paper_value, system_value, discrepancy, note, logged_by`) + a derived/auto-evaluated exit-checklist state. Add via HR-25 timestamp-slug migration (`slug=pilot_log`).
- **API / surface:** operator route `/admin/orgs/[id]/pilot-log` (SCR for pilot log) with entry form + checklist + "generate pilot exit report" PDF action. Recognizes the design-partner relationship as operationally distinct from a generic tenant (scope gap callout).
- **Business-rule execution:** no locked financial BR; this is an operator/onboarding ceremony. Composes with BR-16 (append-only, audited) for the log entries.
- **Multi-tenancy / audit:** entries `org_id`-scoped to the design-partner org; operator-role gated; append-only + audited. The exit report is a deterministic render of logged entries.

## Test Strategy
- Unit: exit-checklist auto-evaluation (3-consecutive-clean-month detection; affirmation flags).
- Integration: logging entries across periods flips the checklist; generating the pilot exit report PDF renders all logged observations + parity results.
- Access: non-operator roles cannot reach `/admin/orgs/[id]/pilot-log`; entries are scoped to the chosen org.

## Dependencies
- Blocked By: — (no story-level blocker declared). Functional prerequisites per scope: US-016 and US-018 (operator/org-admin foundation the pilot ceremony builds on).
