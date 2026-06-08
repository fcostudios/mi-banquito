# US-029: Treasurer records a contribution with slip photo and optional notes

> **Sprint 1** | **P0** | **3 SP** | **R1** | FEAT-029

## User Story

As a treasurer, I want to record a deposit in 3 taps, so that I'm done with the entry before the next WhatsApp arrives.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-029 |
| Feature | FEAT-029 — Treasurer records a contribution with slip photo and optional notes |
| Sprint | Sprint 1 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant ledger |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008, US-009, US-026 |
## Acceptance Criteria

- [ ] AC-1: `SCR-record-contribution` presents a member picker with forgiving partial-name search, an amount field (`currency-input` with es-EC locale), a date defaulting to today, a slip-photo capture (camera or gallery), and an optional notes field.
- [ ] AC-2: The slip photo is constrained to ≤ 1024 px on the long edge and ≤ 5 MB; oversize images are downscaled/rejected per the constraint before upload.
- [ ] AC-3: The Server Action carries a `client_request_id` that is **UNIQUE**, so a retried submit (flaky connectivity) is idempotent — a duplicate request never creates a second `Contribution`.
- [ ] AC-4: On success the screen shows inline copy "Aporte de {member_name} registrado — {currency} {amount}, {date}" and the A/R aging refreshes.
- [ ] AC-5: The contribution is written against the active `cycle_id` (active cycle) and the active group (RLS-scoped `org_id`); the write is audit-logged and append-only (no edit-in-place).

## Technical Notes
- **Data model:** inserts a `Contribution` row (append-only) with `member_id`, `amount decimal(18,4)`, `dated_on`, `cycle_id`, `slip_photo_id`, optional `notes`, and `client_request_id` (UNIQUE constraint for idempotency). Writes `AuditLogEntry`. Slip stored as an uploaded asset referenced by `slip_photo_id`.
- **API / surface:** Server Action behind `SCR-record-contribution`; components `molecule.member-picker`, `molecule.currency-input`, `molecule.slip-uploader`, `molecule.confirmation-modal`. Camera/gallery capture via PWA.
- **Business-rule execution:** Meta Business Rules `—` — no loan/share-out BR fires on a plain aporte. Compliance recomputation (US-031) consumes the new row; base-fund quota is a separate flow (US-032), not bundled here.
- **Multi-tenancy / audit:** org-scoped under RLS; idempotent via `client_request_id` UNIQUE; append-only ledger (corrections happen via reversal, US-030) and audit-logged (audit-before-action).

## Test Strategy
- Idempotency: replaying the same `client_request_id` yields exactly one `Contribution` (integration test simulating a retry).
- Unit: image constraint enforcement (>1024px long edge downscaled; >5MB rejected); amount locale parsing; date default today.
- Integration: a recorded contribution refreshes A/R aging and surfaces the success copy with the member name + amount + date.

## Dependencies
- US-026 — the member being credited must already exist in the ledger.
- US-008 — the contribution-cycle model (`ContributionCycle` / active `cycle_id`) must exist to bind the contribution to a cycle.
- US-009 — the contribution/ledger recording foundation this screen writes against must be in place.
