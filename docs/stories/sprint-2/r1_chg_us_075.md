# US-075: System supports a "partial aporte" state and treasurer records partial payments

> **Sprint 2** | **P0** | **3 SP** | **R1** | REVIEW_F4

## User Story
As La Tesorera, I want to record a member's partial monthly contribution, so that their compliance state reflects "parcial" instead of being mislabeled "atrasado".

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-075 |
| Feature | REVIEW_F4 — System supports a "partial aporte" state and treasurer records partial payments |
| Sprint | Sprint 2 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## Acceptance Criteria
- [ ] AC-1: The `Contribution.kind` enum is extended with `partial`, letting a treasurer record a contribution below the expected monthly amount.
- [ ] AC-2: `mv_member_compliance_state` returns `parcial` for a member when `SUM(contributions) < expected_amount AND SUM(contributions) > 0` for the period; it returns the existing states (`al_dia` / `atrasado`) at the full-paid and zero-paid boundaries respectively.
- [ ] AC-3: The status pill renders `parcial` per the design system (distinct from `atrasado`).
- [ ] AC-4: A member can complete the shortfall in a later transaction with no reversal of the partial contribution — the additional contribution simply moves the running `SUM` toward `expected_amount`, flipping the compliance state to `al_dia` when reached.
- [ ] AC-5: Contributions remain append-only and money columns are `decimal(18,4)`; the compliance MV recomputes via `RecomputeMemberCompliance` (P7) after each contribution; audit row written in the same transaction (NFR-SEC-02/04).

## Technical Notes
- **Data model:** `Contribution.kind` enum extended with `partial`; `mv_member_compliance_state` boundary updated to emit `parcial`. New migration per HR-25 timestamp-slug for the enum value + MV definition.
- **API / surface:** `SCR-record-contribution` accepts a partial amount; the compliance status pill component renders the `parcial` state.
- **Business-rule execution:** no new BR (Meta `Business Rules` = `—`); the change is to the compliance-state derivation (`parcial` = partially-but-not-fully paid). `RecomputeMemberCompliance` (P7) drives the MV refresh.
- **Multi-tenancy / audit:** `mv_member_compliance_state` is org-scoped with RLS; contributions append-only; completing the shortfall never reverses the prior partial row.

## Test Strategy
- Unit: compliance-state function returns `parcial` for `0 < sum < expected`, `al_dia` at `sum ≥ expected`, `atrasado` at `sum = 0` past due.
- Property: recording a completing contribution after a partial never produces a reversal and monotonically advances the running sum to `al_dia`.
- Integration: status pill renders `parcial`; the MV refreshes after each contribution write.

## Dependencies
- Blocked By: — (none declared). Prerequisites from scope: US-029 (record-contribution base), US-031 (member compliance state / MV).
