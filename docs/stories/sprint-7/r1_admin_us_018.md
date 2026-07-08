# US-018: Platform operator invites the treasurer via Auth0 organization invite

> **Sprint 7** | **P1** | **3 SP** | **R1** | FEAT-018

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-018 |
| Feature | FEAT-018 — Platform operator invites the treasurer via Auth0 organization invite |
| Sprint | Sprint 7 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Platform |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-015, US-016 |
## User Story
As a platform operator, I want to invite the treasurer of a banquito org via an Auth0 Organization invitation, so that she can log in with a magic link and the platform never holds her credentials.

## Acceptance Criteria
- [x] AC-1: On `SCR-admin-org-detail` the invite section shows a form with two fields — treasurer **email** and **display name** — both required; the email is format-validated before submit.
- [x] AC-2: On submit, a Server Action creates a `Member` row scoped to the target org with `role = 'tesorera'` and `auth_subject = NULL` (left unset until the Auth0 invite is accepted).
- [x] AC-3: The action sends an Auth0 **Organization** invitation email to the supplied address for the org's Auth0 organization; the magic-link / passwordless flow is the only login path (no platform-stored password).
- [x] AC-4: When the treasurer accepts the invite, the returned Auth0 subject is written to the `Member.auth_subject` of the matching pending row (matched by email), completing the binding.
- [x] AC-5: An `AuditLogEntry` is written with `actor_kind = 'platform_operator'` for both the invite-sent action and the invite-acceptance binding (P18 same-transaction trigger).
- [x] AC-6: Re-inviting an email that already has an accepted (`auth_subject` set) `Member` is rejected with a clear message; re-inviting a still-pending row re-sends the invitation without creating a duplicate `Member`.

## Technical Notes
- **Data model:** `Member` (org-scoped) with `role='tesorera'`, nullable `auth_subject`; no schema change expected (column already exists). `AuditLogEntry` for both transitions.
- **API / surface:** Server Action behind `/admin/orgs/[id]` invite section (`SCR-admin-org-detail`). Auth0 Management API: create/get Organization, send Organization invitation; passwordless email connection. Acceptance callback resolves the Auth0 subject and patches `Member.auth_subject`.
- **Business-rule execution:** No domain BR. Role assignment is fixed (`tesorera`) at invite time.
- **Multi-tenancy / audit:** Org-scoped `Member` write under RLS; platform-operator actions audited with `actor_kind='platform_operator'` (P18) so they appear in the cross-org bitácora (US-022).

## Test Strategy
- Unit: form validation (missing/invalid email and display name rejected).
- Integration: invite Server Action mocks Auth0 invitation send, asserts the pending `Member` row (`role='tesorera'`, null `auth_subject`) and the audit entry.
- Integration: acceptance callback binds `auth_subject` to the pending row by email; duplicate/accepted-email guard (AC-6).

## Dependencies
- Blocked By row is `—` (no upstream story-level blocker declared). Scope prerequisites US-016 (org created) and US-015 (Auth0 tenant/magic-link auth) provide the org + auth substrate this invite rides on.
