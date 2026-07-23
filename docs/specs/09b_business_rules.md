# Business Rules

This file records business-rule deltas that must be implemented through the rule registry and substrate, not as screen-local conditionals.

## BR-26: Member Payment Allocation Waterfall

**Status:** approved pilot feedback, 2026-07-09.

When a member payment is recorded without an explicit narrow target, Mi Banquito applies the amount in this strict order:

1. Loan mora and loan fees, oldest accrued or due first.
2. Loan interest due, oldest cuota first.
3. Loan principal due, oldest cuota first.
4. Overdue regular contributions, oldest cycle first.
5. Current regular contribution cycle.
6. Remaining amount requires a one-tap treasurer decision: `Aporte extra / ahorro`, `Prepagar aporte futuro`, or `Abonar a capital` when an open loan exists.

The rule must return a transparent allocation split before save and persist enough grouping metadata for history, statements, A/R aging, liquidity, reconciliation, and public verification to show the original received amount and every applied line.

Targeted flows may preselect a loan, cuota, or A/R row, but overriding the waterfall when higher-priority debt exists requires visible confirmation, a note, and audit.

Implementation spec: `docs/superpowers/specs/2026-07-09-member-payment-waterfall-design.md`.

## BR-15 (amended per CHG-011): Treasurer-compensation payout ceiling — one shared entitlement, nets everything already paid

**Status:** delivered spec, CHG-011, 2026-07-21. Governs US-098 (Sprint 9). Critical (`oracle: property`).

The manual treasurer-compensation payout (`Expense`, `category = treasurer_comp_payout`) and the automated BR-07 cron (US-050, which writes real `Withdrawal` rows of `kind = treasurer_compensation_disbursement`) draw from ONE shared entitlement — they are never additive. The normative formula:

```
# Per fiscal year Y — the group recognizes the gestión ONCE per year:
# EITHER the periodic accrual OR an explicit recognition colecta, whichever is larger.
# max(), never sum — this IS the no-double-dip rule, as arithmetic.
recognized_amount(org, Y) =
    max( BR-07 accrued compensation attributed to Y,
         Σ( closed ExtraordinaryCollection kind = treasurer_recognition
            with recognition_fiscal_year = Y ) )

# Cumulative from org inception THROUGH the end of Y (the carry rule, as arithmetic —
# accrued-but-unpaid entitlement carries forward; a catch-up can never exceed it):
cumulative_entitlement(org, Y) = Σ over y ≤ Y of recognized_amount(org, y)

cumulative_paid(org, Y) =
    Σ( Withdrawal kind = treasurer_compensation_disbursement with period_label in any y ≤ Y )   # US-050 cron cash-outs
  + Σ( Expense category = treasurer_comp_payout attributed to any y ≤ Y )                        # prior manual payouts

payable_now(org, Y) = max(0, cumulative_entitlement(org, Y) − cumulative_paid(org, Y))
```

A payout with `amount > payable_now` is rejected with the typed domain error `compensation_ceiling_exceeded` carrying `{cumulative_entitlement, cumulative_paid, payable_now}`; when `payable_now ≤ 0` the action is disabled with the exact reason. The ceiling is recomputed server-side inside the same transaction as the payout write (no TOCTOU). Attribution keys: BR-07 accruals and cron withdrawals by `period_label`'s fiscal year; recognition colectas by the INSERT-only `recognition_fiscal_year` column (never `opened_on`); manual payouts by `dated_on`'s fiscal year.

Full context (BR-12/14/16 lifecycle, mutation contract, surplus disposition): `docs/stories/sprint-9/r2_chg_us_096..099.md` + `docs/specs/04_er_model.md` ExtraordinaryCollection section (CHG-011 blocks).
