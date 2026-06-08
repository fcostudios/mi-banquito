# US-123: Group-switcher chip + active-group banner in the shell (consumes IMP-229)

> **Sprint 12** | **P1** | **3 SP** | **R1** | — Group-switcher chip + active-group banner in the shell (consumes IMP-229)

## User Story

As a Treasurer, I want to see and switch the active group from any screen, so that I always know which group I'm working in.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-123 |
| Feature | — Group-switcher chip + active-group banner in the shell (consumes IMP-229) |
| Sprint | Sprint 12 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | misc |
| Business Rules | — |
| Backstage Process | shell |
| Blocked By | US-122 |

## Acceptance Criteria

- [ ] AC-1: The nav map configures `app_shell.header.active_context` (enabled, icon, switch labels es/en, current group, member groups); the IMP-229 archetype renders a group-switcher chip — active group name + a switch list of the user's memberships — on **every** screen.
- [ ] AC-2: Selecting a different group from the chip sets the active group via the US-122 session/middleware path (re-validated server-side per BR-25) and reloads the UI scoped to the newly active group.
- [ ] AC-3: A single-group user sees only the active group name (no chooser/dropdown noise) — the chip degrades to a static label.
- [ ] AC-4: The active group is unmistakably shown on every treasurer screen (name; per-group accent/logo where configured), so the operator always knows which banquito they are working in.
- [ ] AC-5: The switcher only lists the user's *active* memberships — a revoked group never appears; switching to a non-member group is impossible from the chip (the list is the authoritative source) and would be rejected by US-122 regardless.

## Technical Notes
- **Data model:** read-only against the user's `UserOrgMembership` set (US-121) for the switch list + active group; no new tables.
- **API / surface:** `app_shell.header.active_context` configured in `07c_navigation_map.json`; rendered shell-wide by the IMP-229 archetype (no per-screen TOON edits). Switching reuses the US-122 set-active-org action.
- **Business-rule execution:** consumes BR-25 via US-122 (re-validation on switch); Meta `Business Rules` is `—`. The "group switched" audit event is owned by US-122/US-125's audit path.
- **Multi-tenancy / audit:** the chip surfaces the active-group context everywhere (the "always-clear which group" correctness requirement of BR-25); the switch list is the active-membership set only.

## Test Strategy
- Integration test: switching groups from the chip changes `app.current_org` and reloads scoped data for the new group.
- UI test: a multi-group user sees the switch list; a single-group user sees a static name with no chooser.
- Isolation test: a revoked membership is absent from the switch list; the active-group banner renders on every screen archetype.

## Dependencies
- **US-122** (Blocked By) — provides the validated set-active-org session/middleware path the chip drives; the switcher cannot safely change groups without it. (Also consumes the IMP-229 shell archetype that renders the chip.)
