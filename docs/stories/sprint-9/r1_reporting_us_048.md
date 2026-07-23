# US-048: Treasurer generates per-member statements as a batch and individually

> **Sprint 9** | **P1** | **3 SP** | **R1** | FEAT-048

## User Story

As a treasurer, I want to produce per-member statements after the monthly close — both as a one-click batch and on demand for a single member — so that every member gets their proof of balance.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-048 |
| Feature | FEAT-048 — Treasurer generates per-member statements as a batch and individually |
| Sprint | Sprint 9 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant reporting |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-046, US-047 |
## Acceptance Criteria

- [ ] AC-1: After a `PeriodClose` for the cycle exists, `SCR-statements-archive` (`/estados`) shows a "Generar estados de cuenta de {month}" CTA scoped to that closed period.
- [ ] AC-2: The batch action generates exactly one `monthly_member` PDF per active member of the group via `@react-pdf/renderer`, server-side in a Server Action; each statement contains the member's contributions, withdrawals, and closing balance for the period plus group branding.
- [ ] AC-3: Each generated PDF is hashed over its canonical JSON payload (SHA-256, not over PDF bytes) and persisted as a `StatementArchive` row (`kind=monthly_member`, `member_id` set, `period_label`, `pdf_uri`, `canonical_payload_hash`, `period_close_id`, `created_by_kind=system`).
- [ ] AC-4: A per-member preview is available before/after batch generation; on-demand individual generation is also reachable from `SCR-member-detail` (`/socias/[id]`) for a single member.
- [ ] AC-5: Generation is idempotent — re-running for the same `(org_id, kind, member_id, period_label)` reuses the existing archive (UNIQUE constraint) rather than producing a duplicate; the canonical hash is stable for identical inputs (NFR-PERF-03: P95 < 2 s/PDF).
- [ ] AC-6: `StatementArchive` is append-only — no `UPDATE`/`DELETE`; a regenerate after data change is a new canonical cut. Every generation emits an `AuditLogEntry` in the same transaction.

## Technical Notes
- **Data model:** `StatementArchive` (`reporting_context`, append-only) — `kind=monthly_member`, `member_id`, `period_label`, `pdf_uri`, `canonical_payload_hash` UNIQUE(org_id, kind, member_id, period_label), `period_close_id` FK, `byte_size`, `created_by_kind=system`. No new migration if the table already exists; otherwise timestamp-slug per HR-25.
- **API / surface:** Server Action `generateMemberStatements(periodCloseId)` (batch) + `generateMemberStatement(memberId, periodLabel)` (single). Screens: `SCR-statements-archive` (`/estados`), `SCR-member-detail` (`/socias/[id]`). PDF via `SYS_PdfGenerator` (`@react-pdf/renderer`); canonical JSON serializer at `packages/db/.../reporting/canonical-json.ts`.
- **Business-rule execution:** No BR governs this story (Business Rules row is `—`); the rules are structural (canonical-hash integrity, append-only).
- **Multi-tenancy / audit:** All reads/writes scoped by `org_id`. `AuditLogEntry` (`statement.generated`) written in the same transaction as each archive insert (audit-before-action invariant).

## Test Strategy
- Golden-file test: a fixed member ledger produces a stable `canonical_payload_hash`.
- Integration: batch over an N-active-member group yields N `monthly_member` archives, each with the correct balance; idempotent re-run produces no duplicates.
- Unit: canonical JSON serializer is deterministic (key ordering, decimal formatting).
- Integration (permission): non-treasurer role is denied (403).

## Dependencies
- US-046, US-047 — PDF generation infrastructure (`@react-pdf/renderer` + canonical-hash + `StatementArchive`) must exist first (per scope Prerequisites). Meta `Blocked By` row is `—` (no story-level hard block recorded), but these are the implementation prerequisites.
