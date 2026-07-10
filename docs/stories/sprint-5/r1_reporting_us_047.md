# US-047: System generates the monthly close PDF with canonical-JSON SHA-256 hash

> **Sprint 5** | **P0** | **3 SP** | **R1** | FEAT-047

## User Story

As the system (P14), I want to produce a defensible monthly-close artifact with a verifiable hash, so that the president can read it on WhatsApp and anyone can confirm it was not altered.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-047 |
| Feature | FEAT-047 — System generates the monthly close PDF with canonical-JSON SHA-256 hash |
| Sprint | Sprint 5 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Backstage reporting |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-046 |
## Acceptance Criteria

- [ ] AC-1: Post-commit on a `PeriodClose` (US-046), the system generates a `monthly_close` PDF with `@react-pdf/renderer` using the design-system tokens and the org's branding logo.
- [ ] AC-2: The PDF payload is serialized to canonical JSON (deterministic key ordering) and a SHA-256 hash is computed over that canonical JSON and stored on the `StatementArchive` row (`canonical_payload_hash`).
- [ ] AC-3: The rendered PDF is uploaded to Vercel Blob and a `StatementArchive` row is inserted referencing the `PeriodClose`, the blob URL, the hash, `kind = monthly_close`, and `generated_at`.
- [ ] AC-4: Generation is idempotent — re-running for the same `PeriodClose` UPSERTs on the natural key (`period_close_id`, `kind`) rather than inserting a duplicate `StatementArchive` (F28); identical inputs produce an identical canonical payload and hash.
- [ ] AC-5: The payload aggregates the cycle's data: `PeriodClose`, `ReconciliationCycle` (incl. annotated discrepancy + `resolution_note`), ledger entries for the cycle, all member balances at close, all open loans, and branding.
- [ ] AC-6: The treasurer can preview the generated PDF on `SCR-monthly-close` and share it via WhatsApp; the archive is listed on `SCR-statements-archive`.
- [ ] AC-7: The `StatementArchive` insert and its `AuditLogEntry` occur in one DB transaction; an injected audit-write failure rolls back the archive row (NFR-SEC-04).

## Technical Notes
- **Data model:** `StatementArchive` (from `PeriodClose` via `produces`): `period_close_id`, `kind`, `blob_url`, `canonical_payload_hash`, `generated_at`, recipient. Append-only, written by a system actor (`created_by_kind = system`). UNIQUE natural key `(period_close_id, kind)` for idempotency. New columns/table via timestamp-slug migration per HR-25 (`slug=statement_archive`) if not present from US-008.
- **API / surface:** post-commit hook on `PeriodClose` → P14 GenerateMonthlyCloseReport; preview + WhatsApp share-intent on `SCR-monthly-close`; listing on `SCR-statements-archive`. The hash backs the public verifier (US-085) and the richer content sections come from US-086.
- **Business-rule execution:** no numbered BR (Business Rules row = —); the canonical-JSON + SHA-256 contract is the governing rule. Canonicalization must be stable across runs to keep the hash reproducible.
- **Multi-tenancy / audit:** org-scoped via RLS; generation is a system action that emits its own `AuditLogEntry`. NFR-PERF latency budget applies (F26).

## Test Strategy
- Golden-file: render a fixed `PeriodClose` fixture → assert canonical JSON byte-stable and SHA-256 matches a recorded golden hash.
- Property: re-serialization with shuffled input key order yields the same canonical payload + hash (canonicalization is order-independent).
- Integration: post-commit generation inserts one `StatementArchive`; re-run UPSERTs (no duplicate); injected audit failure rolls back (NFR-SEC-04).

## Dependencies
- `Blocked By` row is `—`; scope prerequisite US-046 (a committed `PeriodClose` is the trigger and the payload source). Downstream: US-060 (president share), US-085 (public verifier), US-086 (richer content).
