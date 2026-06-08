# US-107: Year-end snapshot PDF (kind=year_end_snapshot) archived + verifiable

> **Sprint 11** | **P1** | **3 SP** | **R1** | — Year-end snapshot PDF (kind=year_end_snapshot) archived + verifiable

## User Story

As a System, I want to generate + archive the immutable year-end snapshot PDF so that the cut is shareable + publicly verifiable like other statements.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-107 |
| Feature | — Year-end snapshot PDF (kind=year_end_snapshot) archived + verifiable |
| Sprint | Sprint 11 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | misc |
| Business Rules | — |
| Backstage Process | S6; P15 |
| Blocked By | US-086, US-105 |

## Acceptance Criteria

- [ ] AC-1: The snapshot/`GenerateMemberStatement` path emits a `StatementArchive` row with `kind=year_end_snapshot`, computing the verify-hash over the snapshot's canonical-JSON serialization (stable key order, `decimal(18,4)` amounts, no volatile fields) so identical inputs produce an identical hash.
- [ ] AC-2: The created `StatementArchive` is linked from `YearEndBalanceSnapshot.statement_archive_id`; the archive is immutable once written (any correction flows through a new snapshot + new archive, never an in-place edit).
- [ ] AC-3: The canonical-JSON hash is seeded into the public-verify catalog (US-085) so the year-end snapshot is verifiable through the same public path as other statements.
- [ ] AC-4: The PDF is reproducible — regenerating from the same immutable snapshot yields the same canonical-JSON hash; generation is idempotent (re-running for an already-archived snapshot is a no-op, not a duplicate archive).
- [ ] AC-5: Surfaces on `SCR-statements-archive` (listed/downloadable) and is resolvable via `SCR-public-verify-pdf`; all reads are org/group-scoped (RLS).

## Technical Notes
- **Data model:** No new tables. Writes a `StatementArchive` (`kind=year_end_snapshot`, `verify_hash`) and back-links `YearEndBalanceSnapshot.statement_archive_id`. Reuses the US-085 public-verify catalog seed. No HR-25 migration.
- **API / surface:** Server action on the snapshot path that materializes the PDF + canonical-JSON, computes the hash, persists the archive, and seeds the verify catalog. Surfaced on `SCR-statements-archive` and `SCR-public-verify-pdf` (nav map).
- **Business-rule execution:** No BR of its own; it is the archival/verifiability path for the BR-18 year-end snapshot. Canonical-JSON hashing is the determinism contract (composes with HR-3 reproducibility).
- **Multi-tenancy / audit:** Org/group RLS on archive read/write; archive creation recorded in the audit log. Immutable artifact — no EntityVersion.

## Test Strategy
- Golden file: canonical-JSON + verify-hash for the seeded 2025 year-end snapshot (US-109) is byte-stable across regenerations.
- Idempotency test: re-running generation for an already-archived snapshot does not create a second `StatementArchive`.
- Integration: hash present in the public-verify catalog (US-085); `SCR-public-verify-pdf` resolves it; archive is non-editable.

## Dependencies
- **US-086** (Blocked By) — the statement-generation / public-verify (US-085 catalog) machinery this story emits into.
- **US-105** (Blocked By) — provides the `YearEndBalanceSnapshot` whose `statement_archive_id` this story populates.
