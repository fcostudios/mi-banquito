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
