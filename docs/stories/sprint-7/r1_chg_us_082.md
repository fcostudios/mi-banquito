# US-082: Operator re-issues a magic-link from /admin when treasurer cannot log in

> **Sprint 7** | **P1** | **3 SP** | **R1** | REVIEW_F36

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-082 |
| Feature | REVIEW_F36 — Operator re-issues a magic-link from /admin when treasurer cannot log in |
| Sprint | Sprint 7 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## User Story
As a platform operator, I want to re-issue a magic-link for a treasurer who never received (or lost) hers, so that treasurer adoption is not blocked by a missed email.

## Acceptance Criteria
- [ ] AC-1: A `/admin/orgs/[id]/reset-treasurer-login` action triggers an Auth0 **passwordless** `passwordless.start` with `connection: 'email'` for the org's treasurer.
- [ ] AC-2: The action is **rate-limit aware**: at least **5 minutes** must elapse between attempts for the same treasurer; an earlier retry is rejected with a clear message and the remaining cooldown.
- [ ] AC-3: Every re-issue attempt (success and rate-limited rejection) writes an `AuditLogEntry` with `actor_kind = 'platform_operator'`.
- [ ] AC-4: The operator can notify the treasurer out-of-band via a **WhatsApp share** containing the operator's manual copy (share intent, not an automated message).
- [ ] AC-5: The action targets only an org that has an existing treasurer `Member` (from US-018); orgs without one surface a clear precondition error.

## Technical Notes
- **Data model:** No new entity; reads the org's treasurer `Member` (`role='tesorera'`). `AuditLogEntry` per attempt. Rate-limit state tracked by last-attempt timestamp (per-member) — a small column or derived from the audit log.
- **API / surface:** Server Action at `/admin/orgs/[id]/reset-treasurer-login`. Auth0 Authentication API `passwordless.start` (`connection: 'email'`). WhatsApp share is a `wa.me`/share-intent affordance with operator-supplied copy (consistent with the project's WhatsApp-share pattern).
- **Business-rule execution:** No domain BR; the only constraint is the ≥ 5-minute rate limit between attempts (operational guard, not a BR-NN).
- **Multi-tenancy / audit:** Platform-scoped operator action; audited with `actor_kind='platform_operator'` so it appears in the cross-org bitácora (US-022). Org targeting is explicit via the `[id]` path param.

## Test Strategy
- Unit: rate-limit guard — second attempt within 5 min rejected with remaining cooldown; after 5 min allowed.
- Integration: action calls `passwordless.start` (mocked) with `connection:'email'` for the right treasurer and writes the audit entry; missing-treasurer org → precondition error.

## Dependencies
- Blocked By row is `—`. Scope prerequisites US-015 (Auth0 magic-link auth) and US-018 (treasurer invited / treasurer `Member` exists) supply the auth connection and the target this recovery action re-issues against (addresses Review finding F36).
