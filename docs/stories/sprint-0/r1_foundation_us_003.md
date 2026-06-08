# US-003: Provision Neon project with branching per Vercel preview

> **Sprint 0** | **P0** | **5 SP** | **R1** | FEAT-003

## User Story
As an operator, I want a managed Postgres on Neon with an isolated database branch per Vercel preview, so that migrations and test data never contaminate production.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-003 |
| Feature | FEAT-003 — Provision Neon project with branching per Vercel preview |
| Sprint | Sprint 0 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Infra |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-002 |
## Acceptance Criteria
- [ ] AC-1: A Neon project and its `main` branch are provisioned.
- [ ] AC-2: The Neon-Vercel integration is installed and links the Neon project to the Vercel project from US-002.
- [ ] AC-3: A preview database branch is auto-created when a Vercel preview deploy is created.
- [ ] AC-4: Preview branches are auto-cleaned 7 days after the PR closes.
- [ ] AC-5: `DATABASE_URL` is injected into each environment (production points at `main`; each preview points at its own branch).
- [ ] AC-6: Idempotency: re-running the integration setup does not create duplicate projects or branches.

## Technical Notes
- **Data model / infra:** Neon serverless Postgres. No tables yet (US-008 owns the schema). Connection pooling string used by the app; non-pooled string reserved for migrations (US-008/US-013).
- **API / surface:** No app routes. The Neon-Vercel integration manages branch lifecycle and env injection; the 7-day cleanup window is configured in the integration settings.
- **Business-rule execution:** None.
- **Multi-tenancy / audit:** Branch-per-preview gives migration isolation, not tenant isolation; tenant isolation is RLS (US-008) + session var (US-011).

## Test Strategy
- Open a PR and confirm a dedicated Neon branch is created with its own `DATABASE_URL`.
- Run a migration on the preview branch and confirm `main` is unaffected.
- Close the PR and confirm the branch is scheduled for cleanup within the 7-day window.

## Dependencies
- US-002 — the Vercel project must exist before the Neon-Vercel integration can bind branches to previews (scope Prerequisite: US-002).
