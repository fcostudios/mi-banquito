# US-009: Set up Tailwind 4 with design tokens and strings.es-EC.json and Lucide allow-list

> **Sprint 0** | **P0** | **5 SP** | **R1** | FEAT-009

## User Story
As an operator, I want the design system codegen-ready (Tailwind 4 preset, locked tokens, locked Spanish vocabulary, Lucide allow-list), so that feature stories consume locked tokens and locked strings instead of ad-hoc values.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-009 |
| Feature | FEAT-009 — Set up Tailwind 4 with design tokens and strings.es-EC.json and Lucide allow-list |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-007 |
## Acceptance Criteria
- [ ] AC-1: A Tailwind 4 preset at `packages/config/tailwind-preset` is consumed by both `apps/web` and `packages/ui`.
- [ ] AC-2: `packages/ui/src/tokens/tokens.v1.json` ships the locked tokens per `06_design_system.md §SEC9`.
- [ ] AC-3: `packages/ui/src/strings/strings.es-EC.json` ships the locked es-EC vocabulary.
- [ ] AC-4: A Lucide icon allow-list is exported as a TypeScript constant from `packages/ui`.
- [ ] AC-5: The Tailwind theme is derived from `tokens.v1.json` (single source of truth — no duplicated raw values in the preset).
- [ ] AC-6: A representative `packages/ui` component renders using preset tokens to prove the wiring end-to-end.

## Technical Notes
- **Data model / infra:** No DB. Establishes the shared design substrate consumed across `apps/web` and `packages/ui`.
- **API / surface:** `packages/config/tailwind-preset`, `packages/ui/src/tokens/tokens.v1.json`, `packages/ui/src/strings/strings.es-EC.json`, Lucide allow-list constant. These feed PWA theming (US-010) and every feature screen.
- **Business-rule execution:** None.
- **Multi-tenancy / audit:** None.

## Test Strategy
- Golden-file assertion that the Tailwind theme is derived from `tokens.v1.json` (no drift between token file and preset).
- Type-check that the Lucide allow-list constant is the only icon source imported by UI components.
- Render a sample UI component and assert token-driven styling.

## Dependencies
- US-007 — the App Router app must exist to consume the Tailwind preset and UI package (scope Prerequisite: US-007).
