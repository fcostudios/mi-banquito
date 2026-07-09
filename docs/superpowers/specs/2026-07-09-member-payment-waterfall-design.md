# BR-26 Member Payment Allocation Waterfall

Status: approved from pilot feedback on 2026-07-09.

## Problem

The treasurer records money the way members communicate it: "I paid $X." The member does not usually separate the payment into loan interest, loan principal, overdue contribution, and current contribution. The current product has separate entry points for `Aportes`, `Prestamos`, and `Atrasos`, which lets a regular contribution be recorded while an older debt still keeps the member late.

That is acceptable as a targeted correction path, but it is not the right default for daily treasury work.

## Business Rule

**BR-26: Member Payment Allocation Waterfall**

When a member payment is recorded without an explicit narrow target, Mi Banquito applies the amount in this order:

1. Loan mora and loan fees, oldest accrued or due first.
2. Loan interest due, oldest cuota first.
3. Loan principal due, oldest cuota first.
4. Overdue regular contributions, oldest cycle first.
5. Current regular contribution cycle.
6. Any remaining amount is not silently posted. The treasurer must make a one-tap decision.

The one-tap extra-money choices are:

- `Aporte extra / ahorro`: post the remainder as extra savings in the current cycle.
- `Prepagar aporte futuro`: apply the remainder to future contribution cycles.
- `Abonar a capital`: apply the remainder to open-loan principal when the member has an open loan.

The default recommendation in the UI should be `Aporte extra / ahorro`, but no extra amount is posted until the treasurer confirms one of the choices.

## Targeted Payments

Flows opened from a specific loan detail or a specific A/R row may preselect that target, but the confirmation must still disclose whether BR-26 found older/higher-priority debt. If the treasurer overrides the waterfall, the write path must require a note and audit it.

`Abonar a capital` remains a deliberate override. It must not accidentally bypass mora, fees, or interest without the treasurer seeing that consequence.

## User Experience

The treasurer enters one amount. Before save, the app shows the split in plain Spanish:

```text
Recibido: $80,00
Aplicado: $5,00 mora, $10,00 interes, $30,00 capital,
$20,00 aporte junio, $15,00 aporte julio.
```

If there is a remainder:

```text
Quedan $12,00 sin aplicar.
Que quieres hacer?
[Aporte extra] [Prepagar aporte] [Abonar a capital]
```

The success and history copy must preserve the split so the treasurer can explain it later.

## Data And Substrate Implications

BR-26 should be implemented as a pure domain rule in the rule registry, not as conditional UI code. The rule receives a member, amount, payment date, and current obligations, then returns allocation lines. Each output must stamp `BR-26` and the active `group_config_version` or explicit rule version used for replay.

The persistence layer needs a stable grouping concept for one incoming payment that produces multiple ledger writes. The minimum viable shape is either:

- a `payment_receipt` parent with child allocation lines, or
- an `allocation_group_id` shared by the resulting `Repayment` and `Contribution` rows.

Whichever shape is chosen, statements, history, A/R aging, liquidity, reconciliation, and public verification must be able to show both the original received amount and the applied split.

## Tests

- Golden test: mixed loan mora, loan interest, loan principal, overdue contribution, and current contribution are allocated in BR-26 order.
- Property test: total allocation equals received amount; no line exceeds the remaining obligation; no money disappears.
- Override test: `Abonar a capital` requires confirmation when mora/interest is unpaid.
- Extra-money test: remainder cannot post without one of the one-tap decisions.
- Projection test: after posting, A/R aging removes or reduces all paid obligations in the same order.
