# US-031: Treasurer views live compliance state per member with green amber red encoding

> **Sprint 1** | **P0** | **2 SP** | **R1** | FEAT-031

## User Story

As a treasurer, I want to know who's up-to-date, so that I chase the right people.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-031 |
| Feature | FEAT-031 — Treasurer views live compliance state per member with green amber red encoding |
| Sprint | Sprint 1 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant ledger |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008, US-029 |
## Acceptance Criteria

- [ ] AC-1: Both `SCR-members-list` (`/socias`) and `SCR-treasurer-home` render each member row with a `status-pill` showing `al_día` / `atrasado` / `en_mora`.
- [ ] AC-2: The pill encoding is the **single source of truth** read from `mv_member_compliance_state` — no screen recomputes compliance independently.
- [ ] AC-3: `mv_member_compliance_state` is derived from contributions + the active cycle + `GroupConfig` late/mora thresholds; the green/amber/red ↔ `al_día`/`atrasado`/`en_mora` mapping is consistent across both screens.
- [ ] AC-4: The displayed state updates within seconds of any contribution (the materialized view refreshes on the post-commit hook for contribution writes).
- [ ] AC-5: The view is org-scoped (RLS) — a treasurer sees compliance only for members of the active group.

## Technical Notes
- **Data model:** read-only consumer of the `mv_member_compliance_state` materialized view (per A-ER-8, refreshed on post-commit hooks). No table writes; no migration introduced by this story. Thresholds come from `GroupConfig` (late + mora).
- **API / surface:** server-rendered rows on `SCR-members-list` and `SCR-treasurer-home`; shared `status-pill` component (single rendering path). Process `P7 RecomputeMemberCompliance` maintains the view.
- **Business-rule execution:** Meta Business Rules `—`; compliance binning uses the configured thresholds (the same `GroupConfig` values BR-17 / fiscal config feed) but this story only *displays* the derived state — it enforces no BR itself.
- **Multi-tenancy / audit:** org-scoped under RLS; the view is the single source of truth so the two surfaces can never diverge; read-only (no audit write).

## Test Strategy
- Integration: recording/reversing a contribution flips a member's pill within seconds (view refresh on post-commit hook); both screens show the identical state for the same member.
- Unit: the `al_día`/`atrasado`/`en_mora` → green/amber/red mapping is total and consistent.
- Multi-tenant: members of org B never appear in org A's compliance list under RLS.

## Dependencies
- US-029 — contributions must be recordable; the compliance view is derived from contribution data.
- US-008 — the contribution-cycle model (active cycle + thresholds) the view bins against must exist.
