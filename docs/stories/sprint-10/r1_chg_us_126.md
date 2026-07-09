# US-126: Treasurer records one member payment with BR-26 allocation waterfall

> **Sprint 10** | **P0** | **5 SP** | **R1** | CHG-009 — BR-26 payment allocation feedback

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-126 |
| Feature | CHG-009 — BR-26 member payment allocation waterfall |
| Sprint | Sprint 10 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Tenant ledger / loans / collections |
| Business Rules | BR-26 |
| Backstage Process | S2 contributions, S3 loans, S4 collections, S5 reconciliation, S6 statements |
| Blocked By | US-029, US-036, US-040, US-100 |

## User Story

As La Tesorera, I want to record one payment from a socia and have Mi Banquito apply it to loans and aportes in the right order, so that the member's late status, loan balance, history, statements, liquidity, and reconciliation all agree.

## Acceptance Criteria

- [ ] AC-1: An untargeted member payment applies BR-26 in strict order: loan mora/fees, loan interest, loan principal, overdue regular aportes oldest first, current aporte, then stops for an extra-money decision.
- [ ] AC-2: The write is atomic and append-only. One received payment creates a stable receipt/grouping artifact plus allocation lines linking every generated `Repayment` and/or `Contribution`; a failed allocation writes nothing.
- [ ] AC-3: If the payment leaves an unapplied remainder, save is blocked until the treasurer picks one one-tap decision: `Aporte extra / ahorro`, `Prepagar aporte futuro`, or `Abonar a capital` when an open loan exists.
- [ ] AC-4: Targeted flows may preselect a loan or A/R row, but if higher-priority debt exists the confirmation must disclose it. Overriding BR-26 requires a note and writes an audit event.
- [ ] AC-5: The confirmation and success states show the split in plain Spanish, including source amount, every applied line, and any extra-money decision.
- [ ] AC-6: A/R aging, member compliance, loan detail, liquidity, reconciliation close math, history, statements, and public verification all reflect the same allocation split after refresh.
- [ ] AC-7: Idempotency is preserved by `client_request_id`: retrying the same request returns the original receipt/allocation result and does not double-post contribution or repayment rows.

## Technical Notes

- **Data model:** Add a payment grouping substrate. Preferred shape: `payment_receipt` parent (`org_id`, `member_id`, amount/date/source/slip/notes, `client_request_id`, selected extra decision) plus `payment_allocation` child rows (`receipt_id`, `sort_order`, `allocation_kind`, amount, `loan_id`, `loan_schedule_id`, `loan_fee_id`, `cycle_id`, `repayment_id`, `contribution_id`, `br_id='BR-26'`, `group_config_version`). Add nullable `payment_receipt_id` to `repayment` and `contribution` for simple joins while preserving append-only rows.
- **Domain:** Add an `AllocateMemberPayment` pure rule that receives a frozen obligation snapshot and returns deterministic allocation lines. The write service consumes the plan and persists grouped `Repayment` / `Contribution` rows in one transaction.
- **Surfaces:** The existing `/aportes/registrar` form becomes the default untargeted member-payment entry. Existing `/prestamos/[id]/pago` keeps loan-targeted behavior and must disclose when BR-26 would pay older/higher-priority obligations first. `/atrasos` row actions use the same service with a target preselection.
- **Read models:** `refresh_sprint1_read_models()` remains the post-write refresh point and must run after the grouped write. Statement/archive payloads and audit narration must show receipt + split, not just isolated contribution/repayment rows.
- **Multi-tenancy / audit:** All new tables carry `org_id` and RLS; every grouped write emits one `AuditLogEntry` for the receipt and includes the allocation split in `payload_snapshot`.

## Test Strategy

- Unit: BR-26 allocator golden fixture with one member owing mora/fees, interest, principal, June aporte, and July aporte. Assert strict order and exact decimal totals.
- Property: for random obligation/payment amounts, total allocated + unapplied equals received amount; no allocation exceeds the corresponding obligation.
- Integration: grouped write creates one receipt, N allocation rows, linked `Repayment`/`Contribution` rows, one audit entry, and refreshes A/R/compliance/liquidity.
- Idempotency: same `client_request_id` returns the first receipt and does not duplicate child rows.
- UI/action: extra remainder without a selected one-tap decision redirects to confirmation instead of posting; with a decision, save succeeds and success copy shows the split.
- Regression: targeted overdue contribution still clears its source cycle when no higher-priority loan debt exists.

## Dependencies

- **US-029** supplies the contribution ledger and active/targeted cycle behavior.
- **US-036** supplies loan repayment splitting and `Repayment.applied_to_*`.
- **US-040** supplies A/R aging rows across loan and contribution obligations.
- **US-100** supplies the stable BR registry and stamped rule-output contract.
