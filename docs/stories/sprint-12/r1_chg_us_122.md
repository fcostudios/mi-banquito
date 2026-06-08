# US-122: Active-org session + middleware re-validation (BR-25, CHG-008)

> **Sprint 12** | **P1** | **3 SP** | **R1** | — Active-org session + middleware re-validation (BR-25, CHG-008)

## User Story

As the System, I want to resolve and isolate the active group safely, so that there is no cross-group data leakage.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-122 |
| Feature | — Active-org session + middleware re-validation (BR-25, CHG-008) |
| Sprint | Sprint 12 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | — |
| Backstage Process | auth/session |
| Blocked By | US-121 |

## Acceptance Criteria

- [ ] AC-1: Given a session has selected an active org, when any request is handled, then middleware sets `app.current_org` **only after re-validating** that the selected org ∈ the user's *active* `UserOrgMembership` set — the value is never trusted from the client.
- [ ] AC-2: BR-25 — selecting a non-member or revoked org is **rejected** (not silently downgraded); RLS (`org_id = current_setting('app.current_org')`) remains the isolation boundary and is unchanged — only its input changes from "the user's single org" to "the validated selected membership."
- [ ] AC-3: Integration test: "selecting a non-member org is rejected, and RLS serves only the active group's rows" passes — a user cannot read/write another group's data even by tampering with the session-selected org.
- [ ] AC-4: With no/invalid selection, the request is rejected (or routed to the group-picker, US-124) rather than defaulting to an arbitrary org.
- [ ] AC-5: Re-validation happens on every request (not just at switch time), so a membership revoked mid-session is enforced on the next request.

## Technical Notes
- **Data model:** read-only against `UserOrgMembership` (US-121) — resolves the user's active membership set; no new tables. Active org is a session value, never persisted as trusted state.
- **API / surface:** auth/session middleware that re-validates `selected_org ∈ active memberships` before `SET app.current_org`; rejects otherwise. No treasurer screen (n/a). Documented in `09_architecture.md` auth/session section.
- **Business-rule execution:** BR-25 enforced at Layer 1 (auth middleware re-validates before the scope set; rejects non-member/revoked). Meta `Business Rules` is `—`, but the scope/architecture (SEC20) and BR-25 in `09b` govern the behavior; the group-switch audit event itself is US-123/US-125.
- **Multi-tenancy / audit:** this story IS the cross-group isolation gate — RLS input is the validated active org; cross-group leakage is the cardinal risk this prevents.

## Test Strategy
- Integration test: a non-member/revoked org selection is rejected; RLS serves only the active group's rows; tampering with the session-selected org cannot cross the boundary.
- Property/security test: for any membership set, the resolved `app.current_org` is always ∈ the user's active memberships.
- Revocation test: a membership revoked mid-session is enforced on the next request (re-validation per request).

## Dependencies
- **US-121** (Blocked By) — defines `UserAccount` + `UserOrgMembership`, the membership set this middleware re-validates against; without it there is nothing to validate.
