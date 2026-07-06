# US-053: Treasurer approves year-end share-out which writes payouts and PDFs

> **Sprint 6** | **P1** | **8 SP** | **R1** | FEAT-053

## User Story

As **La Tesorera**, I want to finalize the two-pool year-end share-out, so that payouts are recorded, the year is cut, and the year-end PDFs are produced.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-053 |
| Feature | FEAT-053 — Treasurer approves year-end share-out which writes payouts and PDFs |
| Sprint | Sprint 6 |
| Priority | P1 |
| Size | 8 SP |
| Release | R1 |
| Domain | Tenant reporting |
| Business Rules | BR-09, BR-11 |
| Backstage Process | — |
| Blocked By | US-051, US-052, US-105, US-113 |
## Acceptance Criteria
- [x] AC-1 (BR-20 pre-flight): "Aprobar reparto" is blocked unless an `approved` `SurplusGovernanceDecision` exists for the year — `RunTwoPoolShareOut` asserts this precondition before approval.
- [x] AC-2 (BR-22): Approval is blocked unless the exact reconciliation holds — `Σ final_share_amount === reparto_total` (`decimal(18,4)`) with the explicit `YearEndShareOut.ajuste_amount` line absorbing any residue.
- [x] AC-3: A confirmation modal ("Aprobar reparto") gates the irreversible finalize action.
- [x] AC-4: On approve (single transaction): `YearEndShareOut.status = distributed` (and the governance decision moves to `locked`); `approved_at`/`approved_by` set.
- [x] AC-5: N `Withdrawal` rows are written with `kind = year_end_share_out`, each linked back via `YearEndShareOutLine.withdrawal_id` (one per member line; carries `account_id`). (Per-member withdraw/retain disposition is CHG-005, out of scope here.)
- [x] AC-6: Approval triggers `SnapshotYearEnd` (CHG-003 / **BR-18**) — writes the immutable `YearEndBalanceSnapshot` (+ per-member lines), idempotent on `(org_id, year)`, freezing `group_config_version`.
- [x] AC-7: Per-member (`year_end_member`) and group-wide (`year_end_share_out`) PDFs are generated via `@react-pdf/renderer`, each persisted as a `StatementArchive` with a canonical-JSON SHA-256 hash; per-member PDFs linked via `YearEndShareOutLine.member_statement_id`.
- [x] AC-BR-09: Savings shares finalized in the payouts use the **BR-09** time-weighted method (carried from the US-051 draft); golden-file asserts the rule.
- [x] AC-BR-11: Treasurer overrides from US-052 (**BR-11**) are honored in `final_share_amount` and reflected in payouts + PDFs; golden-file asserts the breakdown.
- [x] AC-8: The approve action recomputes the cash-flow projection (`mv_liquidez_proyectada`) post-commit.
- [x] AC-N: Append-only respected (`Withdrawal`, `StatementArchive`, `YearEndBalanceSnapshot` never UPDATE/DELETE); each write paired with an `AuditLogEntry` in the same transaction; idempotent re-approve yields no duplicate payouts/snapshot (NFR-SEC-02/04, NFR-RELIAB-01).

## Technical Notes
- **Data model:** Writes `Withdrawal` (`kind=year_end_share_out`, `share_out_id`, `account_id`), updates `YearEndShareOut` (`status=distributed`, `total_approved`, `approved_at/by`), `YearEndShareOutLine.withdrawal_id` + `member_statement_id`; `SurplusGovernanceDecision.status=locked`; `YearEndBalanceSnapshot` (+ `YearEndBalanceSnapshotLine`, immutable, UNIQUE(org_id, year)); `StatementArchive` rows (`year_end_member`, `year_end_share_out`). New migration only if absent (timestamp-slug per HR-25).
- **API / surface:** Server Action `approveShareOut(shareOutId)` orchestrating `RunTwoPoolShareOut` (final) + RecordWithdrawal × N + `SnapshotYearEnd` (P-new / BR-18) + `GenerateMemberStatement` (P15) + group PDF (P14) in one transaction. Screen `SCR-year-end-share-out` (`/reparto`) final step. PDF via `SYS_PdfGenerator`.
- **Business-rule execution:** **BR-20** approved-decision pre-flight gate (Layer 1), **BR-22** exact reconciliation gate (Layer 2), **BR-18** year-end snapshot/freeze (Layer 3 + Layer 1 immutability), **BR-09**/**BR-11** carried from draft + overrides. Period-lock honored: payout `Withdrawal` rows dated within the open adjustment window.
- **Multi-tenancy / audit:** `org_id`-scoped; every payout/snapshot/PDF paired with an `AuditLogEntry` in-transaction; idempotency via natural keys (`YearEndShareOut.year`, snapshot `(org_id, year)`, archive UNIQUE).

## Test Strategy
- Integration (happy path): approve a reconciled draft → N payouts + per-member & group PDFs + year-end snapshot, all in one transaction.
- Property/Unit (gate): approval rejected when no approved `SurplusGovernanceDecision` (BR-20) or when `Σ final_share ≠ reparto_total` (BR-22).
- Idempotency: re-approve / re-run `SnapshotYearEnd` yields no duplicate `Withdrawal`/snapshot rows.
- Golden-file: 2025 distributed payouts reconcile to `reparto_total`; snapshot totals reconcile to the ledger at the cut date (BR-18).
- Integration (permission): non-treasurer denied (403); append-only triggers reject any UPDATE/DELETE on payout/snapshot rows.

## Dependencies
- US-051 (draft two-pool share-out), US-052 (overrides + reconciliation), US-113 (reconciliation/approval support), US-105 (year-end snapshot infra) — per scope Prerequisites. Meta `Blocked By` is `—`; **Business Rules** row (BR-09, BR-11) preserved verbatim (BR-18/20/22 cited in body as the CHG-004 two-pool finalize adds them).
