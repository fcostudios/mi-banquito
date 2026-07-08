# US-066: System emits A6 prestamo en mora alert

> **Sprint 7** | **P1** | **2 SP** | **R1** | FEAT-066

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-066 |
| Feature | FEAT-066 — System emits A6 prestamo en mora alert |
| Sprint | Sprint 7 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Backstage alerts |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-033, US-034, US-040 |
## User Story
As a treasurer, I want the system to alert me the moment a loan falls into arrears, so that I can chase the borrower (or their guarantor) before the situation worsens.

## Acceptance Criteria
- [x] AC-1: The emitter runs **post-commit on `EvaluateLoanEligibility` (P10)** and fires when a loan transitions into `en_mora` (overdue per `GroupConfig.config.mora_threshold_days`).
- [x] AC-2: An `Alert` is written with `kind = A6`, `severity = high`, `audience = treasurer`.
- [x] AC-3: For a **member** borrower the Spanish copy is: *"El préstamo de {member} entró en mora ({n} cuotas vencidas)."* where `{n}` is the count of overdue installments.
- [x] AC-4: For a **non-member** borrower (per BR-05) the copy names the guarantor: *"El préstamo de {non-member} entró en mora — garante: {member}."*
- [x] AC-5: De-dup honors `dedup_window = 24h` on `(org_id, A6, subject_id=loan_id, window)` — a re-evaluation of the same already-`en_mora` loan within 24h does not re-emit.
- [x] AC-6: The alert fires only on the **transition into** `en_mora` (not on every subsequent evaluation while it stays overdue), within the 24h de-dup window.

## Technical Notes
- **Data model:** Append-only `Alert`; `subject_id = loan_id`. Reads `Loan.status` transition + overdue installment count from the schedule; `GroupConfig.config.mora_threshold_days` defines the overdue cutoff. No migration (A6 exists in the 14-kind catalogue, `03b §6`).
- **API / surface:** Surfaced by the alert bell (SWR poll). Emitter is `comp_alert_engine_009` via FEAT-P17 EmitAlert on the post-commit LISTEN/NOTIFY from the loan-eligibility evaluation (P10). Borrower kind (member vs non-member) selects the copy template.
- **Business-rule execution:** Mora threshold is config-driven (`GroupConfig.config.mora_threshold_days`); BR-05 governs the non-member-loan guarantor requirement used to resolve `{member}` (guarantor) in AC-4.
- **Multi-tenancy / audit:** Org-scoped under RLS; alert emitted in the P10 evaluation transaction context.

## Test Strategy
- Unit: copy selection — member vs non-member templates render the correct Spanish with `{n}` overdue count and guarantor name.
- Integration: drive a loan past `mora_threshold_days` and re-run P10 → exactly one A6; same loan re-evaluated within 24h → no duplicate.
- Integration: non-member loan emits guarantor-naming copy (BR-05 guarantor resolved).

## Dependencies
- Blocked By row is `—`. Scope prerequisites US-033 (member loan origination), US-034 (non-member loan + guarantor), US-040 (A/R aging surfacing overdue state) supply the loans and overdue computation this emitter watches.
