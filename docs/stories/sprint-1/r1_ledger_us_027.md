# US-027: Treasurer changes a member status to en pausa or baja with refund A/P entry

> **Sprint 1** | **P0** | **3 SP** | **R1** | FEAT-027

## User Story

As a treasurer, I want to freeze or exit a member cleanly, so that the historical record stays intact and the refund is bookkept.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-027 |
| Feature | FEAT-027 — Treasurer changes a member status to en pausa or baja with refund A/P entry |
| Sprint | Sprint 1 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant ledger |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-026 |
## Acceptance Criteria

- [ ] AC-1: `SCR-member-detail` exposes a status-action sub-section with two actions: "Pausar" (`en_pausa`) and "Dar de baja" (`baja`).
- [ ] AC-2: Choosing "Dar de baja" prompts for a refund amount **defaulting to the member's accumulated savings**; the treasurer may adjust it. A reason is captured for the transition.
- [ ] AC-3: On submit, the status transition writes an `EntityVersion` for the `Member` status change (HR-1), and a `baja` additionally inserts an `Expense` of `kind = member_refund` for the refund amount.
- [ ] AC-4: The member is **never deleted** — status changes only, preserving the historical ledger; the action is audit-logged (`AuditLogEntry`).
- [ ] AC-5: The action is org-scoped (RLS) and operates only on a member of the active group; `en_pausa` records no refund (status-only transition).

## Technical Notes
- **Data model:** appends an `EntityVersion` snapshot for the `Member` status transition (`activo → en_pausa | baja`); a `baja` also inserts an `Expense` (`kind = member_refund`, categorized per BR-13's enum lane). Writes `AuditLogEntry`. No new migration required.
- **API / surface:** Server Action triggered from the `SCR-member-detail` status sub-section; refund-amount prompt on `baja`. Default refund = accumulated savings (computed read-model).
- **Business-rule execution:** Meta Business Rules `—`. The refund is bookkept as a categorized `Expense` consistent with the append-only/categorized-outflow pattern (no uncategorized money leaves an account); no loan-engine BR fires.
- **Multi-tenancy / audit:** org-scoped under RLS; status transition is HR-1 versioned (`EntityVersion`) and the transition + refund are audit-logged (audit-before-action).

## Test Strategy
- Integration: `baja` creates one `Member` status `EntityVersion` + one `member_refund` `Expense` + one `AuditLogEntry`; `en_pausa` creates the `EntityVersion` only (no `Expense`).
- Unit: refund amount defaults to accumulated savings and is overridable; reason required.
- Property: the `Member` row is never hard-deleted; history before the transition remains queryable.

## Dependencies
- US-026 — a member must exist (created via the add-member flow) before its status can be paused or exited.
