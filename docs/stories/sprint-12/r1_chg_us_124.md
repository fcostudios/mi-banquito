# US-124: Group-picker landing (SCR-group-picker, CHG-008)

> **Sprint 12** | **P1** | **3 SP** | **R1** | — Group-picker landing (SCR-group-picker, CHG-008)

## User Story

As a Treasurer with more than one group, I want to choose which group to manage after login, so that I start in the right group (single-group users skip it).

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-124 |
| Feature | — Group-picker landing (SCR-group-picker, CHG-008) |
| Sprint | Sprint 12 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | — |
| Backstage Process | login / switch entry-point |
| Blocked By | US-122 |

## Acceptance Criteria

- [ ] AC-1: `SCR-group-picker` (route `/grupos`) lists the user's groups, each showing name, role, and last activity.
- [ ] AC-2: Selecting a group sets the active org via the US-122 set-active-org path (re-validated server-side per BR-25) and redirects to home, scoped to the chosen group.
- [ ] AC-3: When the user belongs to exactly **1** group, the picker is auto-selected/skipped — login lands directly in that group's home without showing the picker.
- [ ] AC-4: The nav map gains the route/node/edge + role-based view for `SCR-group-picker`, but it is **NOT** a sidebar destination (it is a login/switch entry-point, not a navigable section).
- [ ] AC-5: The list shows only the user's *active* memberships (revoked groups absent); choosing a group the user is not an active member of is impossible from the list and would be rejected by US-122 (BR-25 isolation).

## Technical Notes
- **Data model:** read-only against the user's `UserOrgMembership` set (US-121) for the group list (name, role, last activity); no new tables.
- **API / surface:** `SCR-group-picker` at route `/grupos`; selection invokes the US-122 set-active-org action then redirects home. Nav-map route/node/edge + role-based view added; NOT in `app_shell.sidebar.items[]`. HR-31: no dynamic route params (`_No dynamic route parameters._`).
- **Business-rule execution:** consumes BR-25 via US-122 on selection; Meta `Business Rules` is `—`.
- **Multi-tenancy / audit:** the picker only offers active memberships; the actual scope set + re-validation is owned by US-122; single-group auto-skip avoids a needless choice.

## Test Strategy
- Integration test: a multi-group user sees the picker, selects a group, lands in that group's home scoped correctly.
- Auto-skip test: a single-group user bypasses the picker entirely on login.
- Isolation test: a revoked membership is absent from the list; nav-map validation confirms `SCR-group-picker` is a route/role-view but not a sidebar item.

## Dependencies
- **US-122** (Blocked By) — provides the validated set-active-org path the picker invokes on selection; without it, selecting a group could not safely set the active org.
