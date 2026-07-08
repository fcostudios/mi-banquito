# US-084: Treasurer reverses an approved year-end share-out within grace window

> **Sprint 7** | **P1** | **8 SP** | **R1** | REVIEW_F8

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-084 |
| Feature | REVIEW_F8 — Treasurer reverses an approved year-end share-out within grace window |
| Sprint | Sprint 7 |
| Priority | P1 |
| Size | 5 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## User Story
As a treasurer, I want to undo an approved year-end share-out if I spot an error before the assembly meeting, so that I'm not forced to live with a wrong distribution.

## Acceptance Criteria
- [x] AC-1: Within **24 h** of `YearEndShareOut.status = approved`, a "Revertir reparto" action is available; after that grace window it is unavailable to the treasurer.
- [x] AC-2: The reversal creates **N reversal `Withdrawal` rows** — one per approved share-out line — exactly offsetting the distributed amounts (the share-out is undone via compensating ledger entries, not by deleting the original rows).
- [x] AC-3: All year-end PDFs are **superseded**: a new generation runs and the prior archives are marked `StatementArchive.kind = year_end_*_superseded`.
- [x] AC-4: `YearEndShareOut.status` is set to `reversed`.
- [x] AC-5: The action requires a **confirmation modal in plain Spanish** plus a mandatory **reason**, both captured before any write.
- [x] AC-6: **After** the grace window, only the platform operator can reverse — via direct, audited DB recovery (no treasurer self-serve path post-window).
- [x] AC-7: The reversal is idempotent / single-shot: a reverted share-out cannot be reverted again, and re-running does not create extra `Withdrawal` rows.

## Technical Notes
- **Data model:** `YearEndShareOut.status` gains a `reversed` state (HR-1 versioned via `EntityVersion`); N reversal `Withdrawal` rows linked to the share-out; `StatementArchive` rows re-keyed to `year_end_*_superseded`. Any enum/state addition uses a timestamp-slug migration per HR-25 (`slug=share_out_reversed`).
- **API / surface:** Server Action "Revertir reparto" on the year-end share-out detail (Epic 8). Confirmation modal (plain Spanish) + reason field. PDF regeneration via `SYS_PdfGenerator` (`@react-pdf/renderer`, canonical-JSON SHA-256 hash in `StatementArchive`). Post-window path is an operator-only audited recovery.
- **Business-rule execution:** No new BR-NN; the reversal must keep the ledger consistent with the share-out math (BR-09 time-weighted + BR-11 per-member breakdown) — reversal `Withdrawal` rows offset the exact distributed lines so balances return to pre-share-out state.
- **Multi-tenancy / audit:** Org-scoped under RLS; this is the highest-stakes write in the system — every reversal (treasurer in-window or operator post-window) is fully audited (P18) with the captured reason and superseded-PDF references.

## Test Strategy
- Unit: grace-window guard (≤ 24h treasurer-allowed; > 24h treasurer-blocked, operator-only).
- Property: post-reversal member balances equal the pre-share-out balances exactly (reversal Withdrawals offset distributed amounts; modulo rounding).
- Integration: reverse within window → N Withdrawals + status `reversed` + PDFs `*_superseded` + reason audited; re-reverse blocked (AC-7).

## Dependencies
- Blocked By row is `—`. Scope prerequisite US-053 (year-end share-out approval) creates the approved share-out this story can undo; this story is the F8 fix for "approval has no undo."
