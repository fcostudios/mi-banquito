# US-010: Set up Serwist service worker and PWA manifest installable Android and iOS

> **Sprint 0** | **P0** | **5 SP** | **R1** | FEAT-010

## User Story
As an operator and treasurer, I want Mi Banquito installable as a PWA, so that it appears on the home screen without going through an app store.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-010 |
| Feature | FEAT-010 — Set up Serwist service worker and PWA manifest installable Android and iOS |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-009 |
## Acceptance Criteria
- [ ] AC-1: `app/manifest.ts` declares the es-EC app name, a theme color sourced from the design tokens (US-009), and icons at 192px and 512px plus an `apple-touch-icon`.
- [ ] AC-2: A Serwist service worker is registered in the app.
- [ ] AC-3: The Android install prompt appears at the appropriate moment (deferred `beforeinstallprompt`, surfaced via UI).
- [ ] AC-4: iOS install instructions ("Add to Home Screen") are documented/surfaced since iOS gives no automatic prompt.
- [ ] AC-5: Lighthouse PWA score is ≥ 90.
- [ ] AC-6: The service worker registers without breaking SSR/hydration in the Next.js 16 App Router.

## Technical Notes
- **Data model / infra:** No DB. Serwist service worker + Web App Manifest. Theme color and naming pull from `tokens.v1.json` / `strings.es-EC.json` (US-009).
- **API / surface:** `app/manifest.ts`, Serwist service-worker registration, icon assets. Offline/runtime caching strategy can be minimal here; richer offline behavior belongs to feature stories.
- **Business-rule execution:** None.
- **Multi-tenancy / audit:** None.

## Test Strategy
- Lighthouse PWA audit asserts score ≥ 90 in CI or a documented manual run.
- Manifest validation: required fields present, icons resolve, theme color matches the token value.
- Manual install verification on Android (prompt) and iOS (Add to Home Screen) documented.

## Dependencies
- US-009 — the theme color and es-EC name come from the locked tokens/strings (scope Prerequisite: US-009).
