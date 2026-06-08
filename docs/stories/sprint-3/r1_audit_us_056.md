# US-056: Treasurer views Historial as plain-Spanish audit narration

> **Sprint 3** | **P0** | **2 SP** | **R1** | FEAT-056

## User Story

As a treasurer, I want to see what happened in the banquito rendered in plain Spanish, so that I can defend any number to a member.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-056 |
| Feature | FEAT-056 — Treasurer views Historial as plain-Spanish audit narration |
| Sprint | Sprint 3 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant audit |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008 |
## Acceptance Criteria

- [ ] AC-1: Route `/historial` (SCR-history) lists **every `AuditLogEntry`** for the active org, each rendered as **plain-Spanish narration** — e.g. *"12 de mayo, 14:23 — Registraste un aporte de María por USD 50."*
- [ ] AC-2: Narration is produced by mapping each entry's **`action_kind`** to a Spanish copy template, interpolating the entry's payload values (actor, amount, member name, date) with correct es-EC date/number formatting.
- [ ] AC-3: The list is **sorted by date descending** (most recent first).
- [ ] AC-4: Where the entry references an underlying entity (contribution, loan, repayment, etc.), the row provides a **link to that entity**; entries without a linkable entity render without a link.
- [ ] AC-5: An **Export to PDF** action produces a document of the narrated history.
- [ ] AC-6: The view is **org-scoped** (RLS, US-072) and read-only over the append-only `AuditLogEntry` table — it never mutates audit rows; every `action_kind` present in the data must resolve to a template (unmapped kinds fall back to a safe generic narration, surfaced as a defect, never a crash).

## Technical Notes
- **Data model:** reads append-only `AuditLogEntry` (`action_kind`, actor `created_by`/`created_by_kind`, `created_at`, payload, optional entity FK). No migration; `AuditLogEntry` is written by every tenant write (P18 PlatformAuditWrite).
- **API / surface:** Next.js route `/historial` → server component reading org-scoped audit rows; a Spanish copy-template registry keyed by `action_kind`; PDF export via a server action/route handler. Screen SCR-history.
- **Business-rule execution:** none — narration + presentation only.
- **Multi-tenancy / audit:** org-scoped reads (RLS + app predicate); the audit table itself is append-only and immutable per the substrate constraint.

## Test Strategy
- Unit / golden-file: each `action_kind` template renders the expected es-EC narration string for a fixture payload (golden file over the full template registry); date/number formatting asserted.
- Unit: unmapped `action_kind` yields the safe generic fallback (no exception).
- Integration: seed audit rows for two orgs; assert descending order, entity links resolve, org-A never sees org-B entries, and PDF export contains the narrated lines.

## Dependencies
- Blocked By: — (none declared). Builds on US-008 (auth/session) per the scope Prerequisites; US-057 (Historial search) extends this screen and depends on it.
