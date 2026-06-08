# US-030: Treasurer reverses a prior contribution with required reason

> **Sprint 1** | **P0** | **3 SP** | **R1** | FEAT-030

## User Story

As a treasurer, I want to undo a wrong entry without deleting it, so that the historical record stays intact and trust is preserved.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-030 |
| Feature | FEAT-030 — Treasurer reverses a prior contribution with required reason |
| Sprint | Sprint 1 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant ledger |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-029 |
## Acceptance Criteria

- [ ] AC-1: From a transaction row on `SCR-history` or `SCR-member-detail`, a "Hacer una reversión" action opens a confirmation modal containing a full Spanish sentence describing the reversal, a **required** reason input, and a destructive-styled confirm button.
- [ ] AC-2: The original contribution is **never deleted or edited**; confirming writes a new `Contribution` row carrying `reverses_id` (FK → the original) and `reverse_reason`.
- [ ] AC-3: The reversal cannot be confirmed without a non-empty reason; the destructive button is disabled until the reason is provided.
- [ ] AC-4: The reversal is audit-logged (`AuditLogEntry`); balances and A/R aging reflect the net effect of original + reversal.
- [ ] AC-5: Reversal is org-scoped (RLS) and may only target a contribution belonging to the active group; a contribution may not be reversed twice (the reversing row itself is not re-reversible via the same affordance).

## Technical Notes
- **Data model:** inserts a new `Contribution` (append-only) with `reverses_id` + `reverse_reason`; the original row is immutable. Writes `AuditLogEntry`. No new migration required (reuses the `Contribution` reversal columns).
- **API / surface:** Server Action triggered from a `confirmation-modal` on `SCR-history` or `SCR-member-detail`; follows `pattern.reversal` (full-sentence confirm + required reason + destructive button).
- **Business-rule execution:** Meta Business Rules `—`; this is the append-only correction primitive (no money is deleted) — compliance/aging read-models recompute from the net ledger.
- **Multi-tenancy / audit:** org-scoped under RLS; append-only (reversal-not-delete) per the ledger invariant; reason required and audit-logged.

## Test Strategy
- Property: a reversal never mutates or deletes the original; the ledger net of (original + reversal) is zero for that pair.
- Unit: confirm button disabled until a reason is entered; reversing an already-reversed row is blocked.
- Integration: a reversal writes one new `Contribution` with `reverses_id` + `reverse_reason` + one `AuditLogEntry`, and A/R aging updates.

## Dependencies
- US-029 — a contribution must have been recorded before it can be reversed; this story consumes the `Contribution` rows that flow creates.
