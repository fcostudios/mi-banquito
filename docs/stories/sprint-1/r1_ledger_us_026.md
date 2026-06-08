# US-026: Treasurer adds a member with name WhatsApp number role initial savings

> **Sprint 1** | **P0** | **3 SP** | **R1** | FEAT-026

## User Story

As a treasurer, I want to register a member in one screen, so that I can record her aportes immediately.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-026 |
| Feature | FEAT-026 — Treasurer adds a member with name WhatsApp number role initial savings |
| Sprint | Sprint 1 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant ledger |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-025 |
## Acceptance Criteria

- [ ] AC-1: `SCR-add-member` is a single-screen form: display name (required), WhatsApp number (optional, E.164-masked), role (default `aportante`), joined-on (default today), initial savings (default 0). Reached via the "Agregar socia" CTA on `SCR-members-list`.
- [ ] AC-2: On submit, a Server Action writes a `Member` row plus an `EntityVersion` snapshot (HR-1; `Member` `requires_versioning: yes`) and an `AuditLogEntry`.
- [ ] AC-3: On success the treasurer is redirected to `SCR-members-list` with the new member's row highlighted.
- [ ] AC-4: WhatsApp, when provided, is validated/masked to E.164; an invalid number is rejected inline. Initial savings defaults to 0 and is non-negative.
- [ ] AC-5: The member is created under the active group (RLS-scoped `org_id`); the write is audit-logged before/with the insert.

## Technical Notes
- **Data model:** inserts `Member` (`org_id` FK, `audit_required: yes`, `multi_tenant_scoped: yes`) + `EntityVersion` snapshot + `AuditLogEntry`. Initial savings recorded per the member's opening balance convention. No new migration required.
- **API / surface:** Server Action behind `SCR-add-member`; entry CTA on `SCR-members-list`. Tenant-simplicity surface (large fields, ≥48px tap targets).
- **Business-rule execution:** none enforced (Meta Business Rules `—`); validation only (required name, E.164 WhatsApp mask, non-negative initial savings).
- **Multi-tenancy / audit:** org-scoped under RLS; member create + initial savings are HR-1 versioned via `EntityVersion` and audit-logged.

## Test Strategy
- Integration: submit creates one `Member` + one `EntityVersion` + one `AuditLogEntry`; redirect highlights the new row.
- Unit/validation: required display name; E.164 mask accepts/rejects sample numbers; defaults applied (role `aportante`, joined-on today, savings 0).
- Multi-tenant: a member created in org A is invisible to org B under RLS.

## Dependencies
- US-025 — the first-run wizard must have completed (group named, rules confirmed) before the treasurer registers members.
