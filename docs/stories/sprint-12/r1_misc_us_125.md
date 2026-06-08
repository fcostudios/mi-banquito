# US-125: Onboard an additional group for an existing treasurer + switch audit (O13)

> **Sprint 12** | **P1** | **3 SP** | **R1** | — Onboard an additional group for an existing treasurer + switch audit (O13)

## User Story

As an Operator, I want to provision a new group for an existing treasurer, so that the mother's new banquitos appear under one login.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-125 |
| Feature | — Onboard an additional group for an existing treasurer + switch audit (O13) |
| Sprint | Sprint 12 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | misc |
| Business Rules | BR-25 |
| Backstage Process | platform provisioning (operator-provisioned, O13) |
| Blocked By | US-016, US-025, US-121 |

## Acceptance Criteria

- [ ] AC-1: An operator provisions a new `Organization` plus a `UserOrgMembership` linking it to the existing treasurer's `UserAccount` (no new login created — the existing identity gains a group).
- [ ] AC-2: The newly provisioned group immediately appears in that treasurer's group-picker (US-124) and group-switcher chip (US-123).
- [ ] AC-3: After provisioning, the treasurer runs the per-group first-run setup wizard for the new group (reusing the existing onboarding flow, US-016/US-025) to configure it.
- [ ] AC-4: BR-25 — switching into the new group emits an audited **"group switched"** event (an `AuditLogEntry` recording from-org → to-org); every audited action thereafter records the active group.
- [ ] AC-5: The new `UserOrgMembership` honours `UNIQUE(user_id, org_id)` (US-121) — re-provisioning the same group for the same user does not create a duplicate membership; the grant is versioned (HR-1).
- [ ] AC-6: The new group is isolated under RLS via US-122 — the treasurer's other groups' data is never visible from the new group and vice versa.

## Technical Notes
- **Data model:** writes a new `Organization` row + a `UserOrgMembership` (existing `UserAccount`, new org) honouring `UNIQUE(user_id, org_id)`; grant versioned via `EntityVersion` (HR-1). Reuses the per-group first-run config entities (US-016/US-025). Writes an `AuditLogEntry` for the group-switch event.
- **API / surface:** operator provisioning path (no treasurer screen for provisioning); the new group surfaces through the existing picker (US-124) / switcher (US-123) and the per-group setup wizard (operator-provisioned, O13).
- **Business-rule execution:** BR-25 — the "group switched" audit event (Layer 3) fires on the first switch into the new group; active-group re-validation/isolation is enforced by US-122 (Layer 1).
- **Multi-tenancy / audit:** new org is fully RLS-isolated; the switch audit records from/to org; membership grant is append-only versioned.

## Test Strategy
- Integration test: operator provisions a new org + membership for an existing `UserAccount`; the group appears in the picker/switcher and the first-run wizard runs for it.
- Audit test (BR-25): switching into the new group emits an `AuditLogEntry` with from-org → to-org.
- Constraint/idempotency test: re-provisioning the same group for the same user does not duplicate the membership (`UNIQUE(user_id, org_id)`); grant writes an `EntityVersion`.
- Isolation test: the new group's data is invisible from the treasurer's other groups (RLS via US-122).

## Dependencies
- **US-016** (Blocked By) — provides the group/first-run setup flow the newly provisioned group reuses to configure itself.
- **US-025** (Blocked By) — provides the onboarding wizard the treasurer runs for the new group after provisioning.
- **US-121** (Blocked By) — provides `UserAccount` + `UserOrgMembership`; provisioning attaches a new membership to the existing account, so the identity/membership model must exist first.
