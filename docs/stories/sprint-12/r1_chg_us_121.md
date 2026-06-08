# US-121: Identity + membership model: one treasurer manages many groups (CHG-008)

> **Sprint 12** | **P1** | **3 SP** | **R1** | — Identity + membership model: one treasurer manages many groups (CHG-008)

## User Story

As a System / Operator, I want to decouple identity from a single org, so that one treasurer manages several banquitos with one login.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-121 |
| Feature | — Identity + membership model: one treasurer manages many groups (CHG-008) |
| Sprint | Sprint 12 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | chg |
| Business Rules | — |
| Backstage Process | platform identity |
| Blocked By | US-008 |

## Acceptance Criteria

- [ ] AC-1: An HR-25 timestamp-slug migration (`slug=user_account_org_membership`) creates `UserAccount` (identity) and `UserOrgMembership` (user↔org link) with `UNIQUE(user_id, org_id)`.
- [ ] AC-2: The migration **lifts the global UNIQUE on `Member.auth_subject`** — identity moves from `Member` to `UserAccount`, so the same person can be a Member across multiple groups under one login.
- [ ] AC-3: Greenfield provisioning — at launch the treasurer's single `UserAccount` is created plus one `UserOrgMembership` row per group she runs; there is **no** identity-merge migration (the source of truth is the notebooks, not pre-existing app data).
- [ ] AC-4: A `UserAccount` may hold multiple `UserOrgMembership` rows; the `UNIQUE(user_id, org_id)` constraint forbids a duplicate membership in the same group while allowing many distinct groups.
- [ ] AC-5: Grant and revoke of a `UserOrgMembership` are versioned via append-only `EntityVersion` (HR-1) — membership history is auditable; a revoked membership is retained, not deleted.
- [ ] AC-6: This is the data-model substrate for active-group resolution (US-122/BR-25); no governing BR applies to this story itself (Business Rules row `—`).

## Technical Notes
- **Data model:** new `UserAccount` (id, auth_subject, display_name, …) and `UserOrgMembership` (id, user_id FK → UserAccount, org_id FK → Organization, role, status {active, revoked}, `UNIQUE(user_id, org_id)`); `Member.auth_subject` global UNIQUE dropped (made nullable / non-unique). Single HR-25 timestamp-slug migration `slug=user_account_org_membership`; never allocate a `Vxxx`.
- **API / surface:** no treasurer screen (platform identity); operator/greenfield provisioning path creates the `UserAccount` + per-group `UserOrgMembership` rows. Consumed by US-122 middleware.
- **Business-rule execution:** none directly (Business Rules `—`); this story is the identity substrate that BR-25 (US-122) resolves against.
- **Multi-tenancy / audit:** `UserOrgMembership` is the membership-set RLS resolves against; grant/revoke versioned via `EntityVersion` (HR-1); revoke is a status transition, not a delete.

## Test Strategy
- Migration test: `UserAccount` + `UserOrgMembership` created with `UNIQUE(user_id, org_id)`; `Member.auth_subject` UNIQUE dropped; greenfield provisioning yields one UserAccount + one membership per group.
- Constraint test: inserting a duplicate `(user_id, org_id)` membership is rejected; the same user across two different orgs is accepted.
- Versioning test (HR-1): a grant and a subsequent revoke each write an `EntityVersion` row; the revoked membership row persists with `status=revoked`.

## Dependencies
- **US-008** (Blocked By) — establishes the `Member` / auth model whose `auth_subject` UNIQUE this story lifts; the existing identity model must be in place before identity is moved to `UserAccount`.
