# US-058: Treasurer views balance for any member via partial-name search on home

> **Sprint 6** | **P1** | **2 SP** | **R1** | FEAT-058

## User Story

As a treasurer, I want to answer "¿cuánto tengo?" instantly by searching any member by partial name from the home screen, so that members get an immediate answer over WhatsApp.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-058 |
| Feature | FEAT-058 — Treasurer views balance for any member via partial-name search on home |
| Sprint | Sprint 6 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant ledger |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-026, US-031 |
## Acceptance Criteria
- [x] AC-1: `SCR-treasurer-home` (`/`) has a member-picker that accepts a partial name and filters the member list as the treasurer types.
- [x] AC-2: Selecting a result opens `SCR-member-detail` (`/socias/[id]`) in a single tap.
- [x] AC-3: On member-detail the current balance is prominent — rendered at 28 px in tabular figures.
- [x] AC-4: The balance is read from the `mv_member_compliance_state` materialized view (the UI reads the derived view, it does not compute the balance live).
- [x] AC-5: A "Compartir saldo por WhatsApp" share intent is available from member-detail, pre-filling the share template with the member's name + current balance (`pattern.share-via-whatsapp`).
- [x] AC-6: The picker is scoped to the treasurer's own group — members of other orgs never appear.

## Technical Notes
- **Data model:** Read-only. `Member` (name search) + `mv_member_compliance_state` (current balance per member). No new entity / no migration.
- **API / surface:** RSC query for the member list + balance; the picker is a client component filtering by partial name (debounced). Screens: `SCR-treasurer-home` (`/`), `SCR-member-detail` (`/socias/[id]`). Share via `pattern.share-via-whatsapp`.
- **Business-rule execution:** No BR governs this story (Business Rules row `—`).
- **Multi-tenancy / audit:** All reads `org_id`-scoped; balance derived from the compliance view, not computed in the request path (consistent with the materialized-view read principle).

## Test Strategy
- Integration: partial-name query returns matching members within the org and excludes other orgs' members.
- Unit: balance rendering uses the `mv_member_compliance_state` value and tabular-figure typography (28 px).
- E2E: home → type partial name → tap result → member-detail with prominent balance + WhatsApp share affordance.

## Dependencies
- US-026 (member-detail screen), US-031 (member compliance / `mv_member_compliance_state`) — per scope Prerequisites. Meta `Blocked By` is `—`.
