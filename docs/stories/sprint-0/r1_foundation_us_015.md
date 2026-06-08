# US-015: Set up Auth0 magic-link passwordless email flow

> **Sprint 0** | **P0** | **5 SP** | **R1** | FEAT-015

## User Story
As an operator, I want treasurers to log in without passwords via a magic-link email flow, so that the device-fluent but password-averse treasurer can authenticate effortlessly.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-015 |
| Feature | FEAT-015 — Set up Auth0 magic-link passwordless email flow |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-004, US-007 |
## Acceptance Criteria
- [ ] AC-1: A catch-all route `app/auth/[auth0]/route.ts` handles the Auth0 auth endpoints (login, callback, logout).
- [ ] AC-2: Login triggers `passwordless.start({ connection: 'email', send: 'link' })` against the Auth0 email connection enabled in US-004.
- [ ] AC-3: The `/auth/callback` step exchanges the magic-link and establishes a session carrying the `org_id` claim (consumed by US-011 middleware).
- [ ] AC-4: The flow is verified end-to-end for a real treasurer email (Francisco's mother's email per scope) — request link, click, land authenticated.
- [ ] AC-5: An expired or already-used magic link is rejected with a clear, Spanish (es-EC) message.
- [ ] AC-6: A failed/abandoned login does not create a partial session.

## Technical Notes
- **Data model / infra:** No new tables. Relies on the Auth0 tenant + passwordless email connection + FcoStudios org from US-004 and the `AUTH0_*` env vars from US-006.
- **API / surface:** `app/auth/[auth0]/route.ts` (catch-all), `/auth/callback` handling, Auth0 SDK config. Error/expiry copy sourced from `strings.es-EC.json` (US-009) where available.
- **Business-rule execution:** None.
- **Multi-tenancy / audit:** The session established here is the input to US-011's tenant scoping — the `org_id` claim must be present and correct for RLS to apply.

## Test Strategy
- E2E: request a magic link, follow it, assert an authenticated session with the expected `org_id`.
- Negative: expired/used link rejected with es-EC messaging; abandoned login leaves no session.
- Real-email verification documented (the design partner's target user).

## Dependencies
- US-004 — the Auth0 tenant, org, and passwordless email connection must exist (scope Prerequisite: US-004).
- US-007 — the App Router must exist to host the `app/auth/[auth0]/route.ts` catch-all (scope Prerequisite: US-007).
