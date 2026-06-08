# US-025: Treasurer first-run group setup wizard 3 screens

> **Sprint 1** | **P0** | **5 SP** | **R1** | FEAT-025

## User Story

As a treasurer (P01), I want to name my group and confirm its rules, so that I can start recording aportes.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-025 |
| Feature | FEAT-025 — Treasurer first-run group setup wizard 3 screens |
| Sprint | Sprint 1 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Tenant onboarding |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-018 |
## Acceptance Criteria

- [ ] AC-1: `SCR-first-run-wizard` runs a 3-screen flow: (a) group name + optional logo, (b) a **read-only** rules summary of the operator-set `GroupConfig` headed "Esto es lo que tu grupo decidió", (c) a confirmation screen "¡Listo! Vamos a registrar las socias".
- [ ] AC-2: Screen (b) renders the *current* `GroupConfig` version's values verbatim; the treasurer cannot edit rules here (editing is US-028). The wizard reads `Organization` + current `GroupConfig` only.
- [ ] AC-3: The wizard is **resumable**: if abandoned mid-flow, re-entry returns the treasurer to the last incomplete step rather than restarting.
- [ ] AC-4: Group name / logo entered on screen (a) persists to the `Organization` row; completing the wizard marks first-run as done so the treasurer lands on the normal home thereafter.
- [ ] AC-5: The wizard is org-scoped (RLS): it only ever shows the active group's name and config; the write is audit-logged.

## Technical Notes
- **Data model:** updates `Organization` (display name, logo); reads current `GroupConfig` (seeded by US-016, refined by US-017). A first-run-completed flag (org-level) gates the wizard. No new migration required.
- **API / surface:** Next.js App Router multi-step route backing `SCR-first-run-wizard`; Server Action persists the name/logo and the completion flag. Resumability via persisted wizard step state.
- **Business-rule execution:** none enforced (Meta Business Rules `—`); screen (b) is a pure read-only projection of the op-set config — the treasurer confirms, does not author.
- **Multi-tenancy / audit:** org-scoped under RLS (`org_id = current_setting('app.current_org')`); the name/logo write is audit-logged.

## Test Strategy
- Integration: completing all 3 steps persists name/logo and sets first-run-complete; abandoning at step (b) and re-entering resumes at step (b).
- Unit: screen (b) renders the current `GroupConfig` values and exposes no editable controls.
- Accessibility: 18px body, ≥48px tap targets per the tenant-simplicity surface.

## Dependencies
- US-018 — the treasurer must have accepted the Auth0 organization invite (be an authenticated org member) before the first-run wizard can run.
