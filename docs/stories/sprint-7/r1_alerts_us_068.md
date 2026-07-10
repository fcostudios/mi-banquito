# US-068: System emits A14 saldo de miembro negativo alert

> **Sprint 7** | **P1** | **2 SP** | **R1** | FEAT-068

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-068 |
| Feature | FEAT-068 — System emits A14 saldo de miembro negativo alert |
| Sprint | Sprint 7 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Backstage alerts |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-031 |
## User Story
As a treasurer, I want the system to alert me (critically) if any member's balance ever computes as negative, so that I can immediately investigate what should be a never-happens data-integrity violation.

## Acceptance Criteria
- [ ] AC-1: The emitter runs **post-event on `RecomputeMemberCompliance` (P7)** — i.e. whenever the `member_compliance_state` materialized view recomputes balances.
- [ ] AC-2: If any member balance computes **< 0**, an `Alert` is written with `kind = A14`, `severity = critical`, `audience = treasurer`.
- [ ] AC-3: The Spanish copy is: *"El saldo de {member} quedó en negativo (USD {amount}). Esto no debería pasar — por favor revisa."* with `{amount}` the negative balance magnitude.
- [ ] AC-4: De-dup uses `dedup_window = immediate` — every distinct negative-balance event is surfaced (no suppression window collapsing repeated integrity violations).
- [ ] AC-5: The **platform operator** is also alerted via the NFR-OBS-01 observability path (this is a data-integrity defect, not a normal treasurer event).

## Technical Notes
- **Data model:** Append-only `Alert`; `subject_id = member_id`. Reads computed balances from the `member_compliance_state` materialized view (PRIN-07). No migration (A14 exists in the catalogue).
- **API / surface:** Surfaced by the alert bell (SWR poll); also routes to the platform-operator observability channel (NFR-OBS-01). Emitter is `comp_alert_engine_009` via FEAT-P17 EmitAlert on the post-commit hook of the compliance recompute (P7).
- **Business-rule execution:** No BR — A14 is an invariant guard: member balance must be `>= 0`; a negative value is by definition a violation that should never occur in normal operation.
- **Multi-tenancy / audit:** Org-scoped `Alert` under RLS; the operator-side fan-out is platform-scoped (NFR-OBS-01) so the substrate owner sees integrity defects across tenants.

## Test Strategy
- Unit: negative-balance detector over the compliance view rows; non-negative → no emit.
- Integration: force a negative computed balance (synthetic ledger), assert critical A14 with the exact Spanish copy + amount, and an operator-side signal.
- Integration: `immediate` window — two distinct negative events both surface (no dedup collapse).

## Dependencies
- Blocked By row is `—`. Scope prerequisite US-031 (live compliance state / `RecomputeMemberCompliance`) supplies the recompute event and balances this critical guard watches.
