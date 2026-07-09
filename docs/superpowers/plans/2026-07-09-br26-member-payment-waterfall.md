# BR-26 Member Payment Waterfall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build BR-26 so one received member payment is allocated across loan mora/fees, loan interest, loan principal, overdue aportes, current aporte, and an explicit one-tap extra-money decision.

**Architecture:** Add a durable receipt/allocation substrate instead of encoding split behavior inside contribution or loan screens. A pure `AllocateMemberPayment` rule computes allocation lines from an obligation snapshot; a write service persists one `payment_receipt`, child allocation rows, and linked `Repayment`/`Contribution` rows atomically. Existing read models remain the projection layer, refreshed once after the grouped write.

**Tech Stack:** Next.js Server Actions, TypeScript, Drizzle/Postgres, Vitest, Zod contracts, existing fake DB unit-test style.

---

## File Structure

- Create `packages/db/src/migrations/V20260709190000__br26_payment_receipts.sql` — append-only schema for `payment_receipt`, `payment_allocation`, and nullable receipt links.
- Modify `packages/db/src/schema.ts` — Drizzle table/enums for the new substrate.
- Create `packages/db/src/br26-schema.test.ts` — schema-level test for table/enums/columns.
- Create `packages/domain/src/payments/allocation.ts` — pure BR-26 allocator with no DB reads.
- Create `packages/domain/src/payments/service.ts` — reads obligations, calls allocator, writes receipt/allocation/children in one transaction.
- Create `packages/domain/src/payments/index.ts` — exports allocator/service types.
- Modify `packages/domain/src/index.ts` — export payment module.
- Create `packages/domain/src/payment-allocation.test.ts` — pure allocator tests.
- Create `packages/domain/src/payment-service.test.ts` — fake DB grouped-write/idempotency tests.
- Modify `packages/contracts/src/index.ts` — `memberPaymentFormSchema`, `paymentExtraDecisionSchema`, split DTOs.
- Modify `apps/web/src/app/(authenticated)/aportes/registrar/actions.ts` — switch default aporte form to BR-26 member-payment service.
- Modify `apps/web/src/app/(authenticated)/aportes/registrar/page.tsx` — render preview/confirmation and one-tap extra decision.
- Modify `apps/web/src/app/(authenticated)/aportes/registrar/actions.test.ts` and `page.test.tsx` — action and confirmation tests.
- Modify `apps/web/src/app/(authenticated)/atrasos/actions.ts` — targeted overdue contribution payment uses BR-26 with target disclosure.
- Modify `apps/web/src/app/(authenticated)/atrasos/actions.test.ts` — regression tests for target behavior.
- Modify `apps/web/src/app/(authenticated)/prestamos/[id]/pago/actions.ts` and `page.tsx` — keep loan-targeted behavior while disclosing BR-26 conflicts for higher-priority obligations.
- Modify `packages/domain/src/audit.ts` and `audit.test.ts` — narration/details for `payment.receipt.recorded`.
- Modify `packages/domain/src/reconciliation.ts` and tests only if monthly statement payload needs receipt grouping to avoid duplicate-looking entries.
- Modify `.nous-feedback.jsonl` — append AC verification events for `US-126`.

## Artifact Contract

The implementation must preserve these existing artifacts:

- `Contribution` and `Repayment` remain append-only financial rows.
- `client_request_id` idempotency moves to `payment_receipt` for grouped payments; child rows still carry unique request IDs derived from the receipt ID and allocation order.
- `refresh_sprint1_read_models()` runs once after the grouped write.
- Period-lock triggers continue to guard `Contribution` and `Repayment`.
- Audit writes are in the same transaction as the receipt and child rows.
- `A/R`, compliance, liquidity, history, statements, and public verification consume the resulting `Contribution`/`Repayment` rows plus receipt metadata.

---

### Task 1: Add Receipt Schema

**Files:**
- Create: `packages/db/src/migrations/V20260709190000__br26_payment_receipts.sql`
- Modify: `packages/db/src/schema.ts`
- Test: `packages/db/src/br26-schema.test.ts`

- [ ] **Step 1: Write the schema test**

Create `packages/db/src/br26-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contribution, paymentAllocation, paymentReceipt, repayment } from "./schema";

describe("BR-26 payment receipt schema", () => {
  it("exposes receipt and allocation tables with child row links", () => {
    expect(paymentReceipt.memberId.name).toBe("member_id");
    expect(paymentReceipt.clientRequestId.name).toBe("client_request_id");
    expect(paymentReceipt.extraDecision.name).toBe("extra_decision");
    expect(paymentAllocation.receiptId.name).toBe("receipt_id");
    expect(paymentAllocation.allocationKind.name).toBe("allocation_kind");
    expect(paymentAllocation.brId.name).toBe("br_id");
    expect(paymentAllocation.groupConfigVersion.name).toBe("group_config_version");
    expect(contribution.paymentReceiptId.name).toBe("payment_receipt_id");
    expect(repayment.paymentReceiptId.name).toBe("payment_receipt_id");
  });
});
```

- [ ] **Step 2: Run the failing schema test**

Run:

```bash
rtk pnpm --filter @mi-banquito/db test -- br26-schema.test.ts
```

Expected: fail because `paymentReceipt`, `paymentAllocation`, and `paymentReceiptId` do not exist.

- [ ] **Step 3: Add Drizzle schema exports**

In `packages/db/src/schema.ts`, add enums near the other `pgEnum` declarations:

```ts
export const payment_extra_decision_enum = pgEnum("payment_extra_decision_enum", [
  "extra_savings",
  "future_contribution",
  "loan_principal",
]);

export const payment_allocation_kind_enum = pgEnum("payment_allocation_kind_enum", [
  "loan_fee",
  "loan_interest",
  "loan_principal",
  "contribution_overdue",
  "contribution_current",
  "contribution_future",
  "extra_savings",
]);
```

Add `paymentReceipt` after `slipPhoto`:

```ts
export const paymentReceipt = pgTable("payment_receipt", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orgId: uuid("org_id").notNull(),
  memberId: uuid("member_id").references((): AnyPgColumn => member.id).notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currencyCode: text("currency_code").notNull(),
  datedOn: date("dated_on").notNull(),
  receivedVia: text("received_via").notNull(),
  slipPhotoId: uuid("slip_photo_id").references((): AnyPgColumn => slipPhoto.id),
  notes: text("notes"),
  extraDecision: payment_extra_decision_enum("extra_decision"),
  clientRequestId: uuid("client_request_id").notNull(),
  createdAt: timestamp("created_at").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdByKind: text("created_by_kind").notNull(),
});
```

Add `paymentAllocation` after `paymentReceipt`:

```ts
export const paymentAllocation = pgTable("payment_allocation", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orgId: uuid("org_id").notNull(),
  receiptId: uuid("receipt_id").references((): AnyPgColumn => paymentReceipt.id).notNull(),
  memberId: uuid("member_id").references((): AnyPgColumn => member.id).notNull(),
  sortOrder: integer("sort_order").notNull(),
  allocationKind: payment_allocation_kind_enum("allocation_kind").notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currencyCode: text("currency_code").notNull(),
  loanId: uuid("loan_id").references((): AnyPgColumn => loan.id),
  loanScheduleId: uuid("loan_schedule_id").references((): AnyPgColumn => loanSchedule.id),
  loanFeeId: uuid("loan_fee_id").references((): AnyPgColumn => loanFee.id),
  cycleId: uuid("cycle_id").references((): AnyPgColumn => contributionCycle.id),
  repaymentId: uuid("repayment_id").references((): AnyPgColumn => repayment.id),
  contributionId: uuid("contribution_id").references((): AnyPgColumn => contribution.id),
  brId: text("br_id").notNull(),
  groupConfigVersion: integer("group_config_version").notNull(),
  createdAt: timestamp("created_at").notNull(),
});
```

Add nullable `paymentReceiptId` to `contribution` and `repayment`:

```ts
paymentReceiptId: uuid("payment_receipt_id").references((): AnyPgColumn => paymentReceipt.id),
```

- [ ] **Step 4: Add the SQL migration**

Create `packages/db/src/migrations/V20260709190000__br26_payment_receipts.sql`:

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_extra_decision_enum') THEN
    CREATE TYPE payment_extra_decision_enum AS ENUM ('extra_savings', 'future_contribution', 'loan_principal');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_allocation_kind_enum') THEN
    CREATE TYPE payment_allocation_kind_enum AS ENUM (
      'loan_fee',
      'loan_interest',
      'loan_principal',
      'contribution_overdue',
      'contribution_current',
      'contribution_future',
      'extra_savings'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payment_receipt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  member_id UUID NOT NULL REFERENCES member(id),
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  currency_code TEXT NOT NULL,
  dated_on DATE NOT NULL,
  received_via TEXT NOT NULL,
  slip_photo_id UUID REFERENCES slip_photo(id),
  notes TEXT,
  extra_decision payment_extra_decision_enum,
  client_request_id UUID NOT NULL,
  created_at TIMESTAMP NOT NULL,
  created_by UUID NOT NULL,
  created_by_kind TEXT NOT NULL,
  CONSTRAINT uq_payment_receipt_org_client_request UNIQUE (org_id, client_request_id)
);

CREATE TABLE IF NOT EXISTS payment_allocation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  receipt_id UUID NOT NULL REFERENCES payment_receipt(id),
  member_id UUID NOT NULL REFERENCES member(id),
  sort_order INTEGER NOT NULL CHECK (sort_order > 0),
  allocation_kind payment_allocation_kind_enum NOT NULL,
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  currency_code TEXT NOT NULL,
  loan_id UUID REFERENCES loan(id),
  loan_schedule_id UUID REFERENCES loan_schedule(id),
  loan_fee_id UUID REFERENCES loan_fee(id),
  cycle_id UUID REFERENCES contribution_cycle(id),
  repayment_id UUID REFERENCES repayment(id),
  contribution_id UUID REFERENCES contribution(id),
  br_id TEXT NOT NULL,
  group_config_version INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL,
  CONSTRAINT uq_payment_allocation_receipt_order UNIQUE (org_id, receipt_id, sort_order),
  CONSTRAINT ck_payment_allocation_br26 CHECK (br_id = 'BR-26')
);

ALTER TABLE contribution
  ADD COLUMN IF NOT EXISTS payment_receipt_id UUID REFERENCES payment_receipt(id);

ALTER TABLE repayment
  ADD COLUMN IF NOT EXISTS payment_receipt_id UUID REFERENCES payment_receipt(id);

CREATE INDEX IF NOT EXISTS idx_payment_receipt_org_member_date
  ON payment_receipt(org_id, member_id, dated_on DESC);

CREATE INDEX IF NOT EXISTS idx_payment_allocation_org_receipt
  ON payment_allocation(org_id, receipt_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_contribution_payment_receipt
  ON contribution(org_id, payment_receipt_id);

CREATE INDEX IF NOT EXISTS idx_repayment_payment_receipt
  ON repayment(org_id, payment_receipt_id);

ALTER TABLE payment_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipt FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_receipt_tenant_isolation ON payment_receipt;
CREATE POLICY payment_receipt_tenant_isolation ON payment_receipt
  USING (org_id = current_setting('app.current_org')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org')::uuid);

ALTER TABLE payment_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_allocation_tenant_isolation ON payment_allocation;
CREATE POLICY payment_allocation_tenant_isolation ON payment_allocation
  USING (org_id = current_setting('app.current_org')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org')::uuid);
```

- [ ] **Step 5: Run schema tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/db test -- br26-schema.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit schema substrate**

Run:

```bash
rtk git add packages/db/src/schema.ts packages/db/src/br26-schema.test.ts packages/db/src/migrations/V20260709190000__br26_payment_receipts.sql
rtk git commit -m "feat(db): add BR-26 payment receipt substrate (US-126)"
```

---

### Task 2: Build Pure BR-26 Allocator

**Files:**
- Create: `packages/domain/src/payments/allocation.ts`
- Create: `packages/domain/src/payments/index.ts`
- Test: `packages/domain/src/payment-allocation.test.ts`

- [ ] **Step 1: Write allocator tests**

Create `packages/domain/src/payment-allocation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allocateMemberPayment } from "./payments";

const baseInput = {
  orgId: "11111111-1111-4111-8111-111111111111",
  memberId: "22222222-2222-4222-8222-222222222222",
  amount: "90.0000",
  currencyCode: "USD",
  datedOn: "2026-07-09",
  groupConfigVersion: 3,
};

describe("BR-26 allocateMemberPayment", () => {
  it("allocates loan fee, interest, principal, overdue aporte, and current aporte in strict order", () => {
    const result = allocateMemberPayment({
      ...baseInput,
      loanObligations: [
        {
          loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          loanScheduleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          loanFeeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          dueOn: "2026-06-01",
          feeDue: "5.0000",
          interestDue: "10.0000",
          principalDue: "30.0000",
        },
      ],
      contributionObligations: [
        {
          cycleId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          cycleLabel: "2026-06",
          dueOn: "2026-06-30",
          amountDue: "20.0000",
          kind: "overdue",
        },
        {
          cycleId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          cycleLabel: "2026-07",
          dueOn: "2026-07-31",
          amountDue: "20.0000",
          kind: "current",
        },
      ],
    });

    expect(result.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["loan_fee", "5.0000"],
      ["loan_interest", "10.0000"],
      ["loan_principal", "30.0000"],
      ["contribution_overdue", "20.0000"],
      ["contribution_current", "20.0000"],
    ]);
    expect(result.unappliedAmount).toBe("5.0000");
    expect(result.requiresExtraDecision).toBe(true);
  });

  it("does not allocate more than each obligation", () => {
    const result = allocateMemberPayment({
      ...baseInput,
      amount: "12.0000",
      loanObligations: [
        {
          loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          loanScheduleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          dueOn: "2026-06-01",
          feeDue: "0.0000",
          interestDue: "10.0000",
          principalDue: "30.0000",
        },
      ],
      contributionObligations: [],
    });

    expect(result.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["loan_interest", "10.0000"],
      ["loan_principal", "2.0000"],
    ]);
    expect(result.unappliedAmount).toBe("0.0000");
  });
});
```

- [ ] **Step 2: Run the failing allocator tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- payment-allocation.test.ts
```

Expected: fail because `./payments` does not exist.

- [ ] **Step 3: Implement allocator**

Create `packages/domain/src/payments/allocation.ts`:

```ts
export type PaymentAllocationKind =
  | "loan_fee"
  | "loan_interest"
  | "loan_principal"
  | "contribution_overdue"
  | "contribution_current"
  | "contribution_future"
  | "extra_savings";

export type PaymentExtraDecision = "extra_savings" | "future_contribution" | "loan_principal";

export type LoanPaymentObligation = {
  loanId: string;
  loanScheduleId?: string | null;
  loanFeeId?: string | null;
  dueOn: string;
  feeDue: string;
  interestDue: string;
  principalDue: string;
};

export type ContributionPaymentObligation = {
  cycleId: string;
  cycleLabel: string;
  dueOn: string;
  amountDue: string;
  kind: "overdue" | "current" | "future";
};

export type PaymentAllocationLine = {
  sortOrder: number;
  kind: PaymentAllocationKind;
  amount: string;
  currencyCode: string;
  loanId?: string | null;
  loanScheduleId?: string | null;
  loanFeeId?: string | null;
  cycleId?: string | null;
  brId: "BR-26";
  groupConfigVersion: number;
};

export type AllocateMemberPaymentInput = {
  orgId: string;
  memberId: string;
  amount: string;
  currencyCode: string;
  datedOn: string;
  groupConfigVersion: number;
  loanObligations: LoanPaymentObligation[];
  contributionObligations: ContributionPaymentObligation[];
  extraDecision?: PaymentExtraDecision;
};

export type AllocateMemberPaymentResult = {
  lines: PaymentAllocationLine[];
  unappliedAmount: string;
  requiresExtraDecision: boolean;
};

function parseMoney4(value: string): bigint {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) {
    throw new Error(`invalid money value: ${value}`);
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
}

function formatMoney4(value: bigint): string {
  const whole = value / 10000n;
  const fraction = `${value % 10000n}`.padStart(4, "0");
  return `${whole}.${fraction}`;
}

function compareByDueDate<T extends { dueOn: string }>(left: T, right: T): number {
  return left.dueOn.localeCompare(right.dueOn);
}

export function allocateMemberPayment(input: AllocateMemberPaymentInput): AllocateMemberPaymentResult {
  let remaining = parseMoney4(input.amount);
  const lines: PaymentAllocationLine[] = [];

  const pushLine = (line: Omit<PaymentAllocationLine, "sortOrder" | "brId" | "groupConfigVersion" | "currencyCode">) => {
    const amount = parseMoney4(line.amount);
    if (amount <= 0n) return;
    lines.push({
      ...line,
      sortOrder: lines.length + 1,
      currencyCode: input.currencyCode,
      brId: "BR-26",
      groupConfigVersion: input.groupConfigVersion,
    });
  };

  const apply = (amountDue: string): string => {
    const due = parseMoney4(amountDue);
    const applied = remaining < due ? remaining : due;
    remaining -= applied;
    return formatMoney4(applied);
  };

  const loanObligations = [...input.loanObligations].sort(compareByDueDate);
  for (const obligation of loanObligations) {
    if (remaining <= 0n) break;
    pushLine({
      kind: "loan_fee",
      amount: apply(obligation.feeDue),
      loanId: obligation.loanId,
      loanScheduleId: obligation.loanScheduleId,
      loanFeeId: obligation.loanFeeId,
    });
    if (remaining <= 0n) break;
    pushLine({
      kind: "loan_interest",
      amount: apply(obligation.interestDue),
      loanId: obligation.loanId,
      loanScheduleId: obligation.loanScheduleId,
    });
    if (remaining <= 0n) break;
    pushLine({
      kind: "loan_principal",
      amount: apply(obligation.principalDue),
      loanId: obligation.loanId,
      loanScheduleId: obligation.loanScheduleId,
    });
  }

  const contributionOrder = { overdue: 0, current: 1, future: 2 } as const;
  const contributionObligations = [...input.contributionObligations]
    .sort((left, right) => contributionOrder[left.kind] - contributionOrder[right.kind] || left.dueOn.localeCompare(right.dueOn));
  for (const obligation of contributionObligations) {
    if (remaining <= 0n) break;
    const kind = obligation.kind === "overdue"
      ? "contribution_overdue"
      : obligation.kind === "current"
        ? "contribution_current"
        : "contribution_future";
    pushLine({
      kind,
      amount: apply(obligation.amountDue),
      cycleId: obligation.cycleId,
    });
  }

  return {
    lines,
    unappliedAmount: formatMoney4(remaining),
    requiresExtraDecision: remaining > 0n && !input.extraDecision,
  };
}
```

Create `packages/domain/src/payments/index.ts`:

```ts
export * from "./allocation";
```

- [ ] **Step 4: Export payment module**

Append to `packages/domain/src/index.ts`:

```ts
export * from "./payments";
```

- [ ] **Step 5: Run allocator tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- payment-allocation.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit allocator**

Run:

```bash
rtk git add packages/domain/src/payments packages/domain/src/index.ts packages/domain/src/payment-allocation.test.ts
rtk git commit -m "feat(domain): add BR-26 payment allocator (US-126)"
```

---

### Task 3: Add Shared Contracts

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/domain/src/sprint2-validation.test.ts`

- [ ] **Step 1: Add validation tests**

Append to `packages/domain/src/sprint2-validation.test.ts`:

```ts
import { memberPaymentFormSchema } from "@mi-banquito/contracts";

describe("memberPaymentFormSchema", () => {
  it("accepts an untargeted member payment with no extra decision", () => {
    expect(memberPaymentFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      amount: "80.00",
      datedOn: "2026-07-09",
      paymentSource: "cash_in_meeting",
    })).toMatchObject({
      amount: "80.00",
      paymentSource: "cash_in_meeting",
    });
  });

  it("rejects loan-principal extra decision without an explicit open loan target", () => {
    expect(() => memberPaymentFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      amount: "80.00",
      datedOn: "2026-07-09",
      paymentSource: "cash_in_meeting",
      extraDecision: "loan_principal",
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run validation tests and confirm failure**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint2-validation.test.ts
```

Expected: fail because `memberPaymentFormSchema` is missing.

- [ ] **Step 3: Add contract schemas**

In `packages/contracts/src/index.ts`, after `loanRepaymentFormSchema`, add:

```ts
export const paymentExtraDecisionSchema = z.enum(["extra_savings", "future_contribution", "loan_principal"]);

export const memberPaymentFormSchema = z.object({
  clientRequestId: uuidString,
  memberId: uuidString,
  amount: moneyString,
  datedOn: dateString,
  paymentSource: contributionSourceSchema.default("cash_in_meeting"),
  slipPhotoId: uuidString.optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
  targetLoanId: uuidString.optional().or(z.literal("")),
  targetCycleId: uuidString.optional().or(z.literal("")),
  extraDecision: paymentExtraDecisionSchema.optional().or(z.literal("")),
  overrideReason: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.paymentSource !== "cash_in_meeting" && !value.slipPhotoId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["slipPhotoId"],
      message: "Slip photo is required for bank and petty-cash deposits",
    });
  }
  if (value.extraDecision === "loan_principal" && !value.targetLoanId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["extraDecision"],
      message: "A loan target is required to apply extra money to principal",
    });
  }
});

export type MemberPaymentForm = z.infer<typeof memberPaymentFormSchema>;
export type PaymentExtraDecision = z.infer<typeof paymentExtraDecisionSchema>;
```

- [ ] **Step 4: Run validation tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint2-validation.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit contracts**

Run:

```bash
rtk git add packages/contracts/src/index.ts packages/domain/src/sprint2-validation.test.ts
rtk git commit -m "feat(contracts): add BR-26 member payment form (US-126)"
```

---

### Task 4: Implement Grouped Payment Service

**Files:**
- Create: `packages/domain/src/payments/service.ts`
- Modify: `packages/domain/src/payments/index.ts`
- Test: `packages/domain/src/payment-service.test.ts`

- [ ] **Step 1: Write grouped-write tests**

Create `packages/domain/src/payment-service.test.ts` using the existing fake DB style from `sprint2-loans.test.ts`. The key assertions must be:

```ts
expect(insertedRows(fakeDb, paymentReceipt)).toHaveLength(1);
expect(insertedRows(fakeDb, paymentAllocation)).toHaveLength(5);
expect(insertedRows(fakeDb, repayment)).toHaveLength(1);
expect(insertedRows(fakeDb, contribution)).toHaveLength(2);
expect(insertedRows(fakeDb, auditLogEntry)[0]).toMatchObject({
  actionKind: "payment.receipt.recorded",
  subjectKind: "payment_receipt",
});
expect(fakeDb.executedSql.some((query) => query.includes("refresh_sprint1_read_models"))).toBe(true);
```

Also add an idempotency test:

```ts
expect(result.receiptId).toBe("existing-receipt-id");
expect(insertedRows(fakeDb, paymentReceipt)).toHaveLength(0);
expect(insertedRows(fakeDb, repayment)).toHaveLength(0);
expect(insertedRows(fakeDb, contribution)).toHaveLength(0);
```

- [ ] **Step 2: Run grouped-write tests and confirm failure**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- payment-service.test.ts
```

Expected: fail because the service does not exist.

- [ ] **Step 3: Implement service interfaces**

Create `packages/domain/src/payments/service.ts` with exported interface:

```ts
import type { MemberPaymentForm } from "@mi-banquito/contracts";
import { db } from "@mi-banquito/db";
import { withWritableTenantTransaction } from "@mi-banquito/db/tenant";
import {
  auditLogEntry,
  contribution,
  contributionCycle,
  groupConfig,
  loan,
  loanFee,
  loanSchedule,
  paymentAllocation,
  paymentReceipt,
  repayment,
} from "@mi-banquito/db/schema";
import type { PaymentAllocationLine } from "./allocation";
import { allocateMemberPayment } from "./allocation";

export type RecordMemberPaymentInput = MemberPaymentForm & {
  orgId: string;
  actorId: string;
};

export type RecordMemberPaymentResult = {
  receiptId: string;
  allocations: PaymentAllocationLine[];
  unappliedAmount: string;
  requiresExtraDecision: boolean;
};

export interface PaymentService {
  readonly context: "payment";
  previewMemberPayment(input: RecordMemberPaymentInput): Promise<RecordMemberPaymentResult>;
  recordMemberPayment(input: RecordMemberPaymentInput): Promise<RecordMemberPaymentResult>;
}
```

- [ ] **Step 4: Implement `previewMemberPayment`**

`previewMemberPayment` must:

1. Load current `GroupConfig` for `orgId`.
2. Load open loan obligations for the member from `Loan`, `LoanSchedule`, `LoanFee`, and prior `Repayment`.
3. Load contribution obligations from `mv_ar_aging`/`ContributionCycle` for overdue and current cycles.
4. Call `allocateMemberPayment`.
5. Return lines without writing.

Use numeric aggregation in TypeScript with `Number(...).toFixed(4)` only at the boundary; keep this implementation consistent with existing domain files.

- [ ] **Step 5: Implement `recordMemberPayment`**

`recordMemberPayment` must:

1. Check existing `payment_receipt` by `(org_id, client_request_id)` and return existing receipt/allocation rows if found.
2. Call `previewMemberPayment`.
3. If `requiresExtraDecision` is true, throw `payment_extra_decision_required`.
4. In one `withWritableTenantTransaction`, insert the receipt, one repayment per affected loan, one contribution per affected contribution cycle, allocation rows linking to the generated child rows, and one audit row.
5. Execute `SELECT refresh_sprint1_read_models()`.

The audit payload shape must be:

```ts
{
  memberId: input.memberId,
  receivedAmount: input.amount,
  datedOn: input.datedOn,
  extraDecision: input.extraDecision || null,
  allocations: persistedAllocations.map((line) => ({
    kind: line.allocationKind,
    amount: line.amount,
    loanId: line.loanId,
    cycleId: line.cycleId,
    repaymentId: line.repaymentId,
    contributionId: line.contributionId,
  })),
}
```

- [ ] **Step 6: Export service**

Modify `packages/domain/src/payments/index.ts`:

```ts
export * from "./allocation";
export * from "./service";
```

- [ ] **Step 7: Run service tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- payment-allocation.test.ts payment-service.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit service**

Run:

```bash
rtk git add packages/domain/src/payments packages/domain/src/payment-service.test.ts
rtk git commit -m "feat(domain): persist BR-26 grouped payments (US-126)"
```

---

### Task 5: Wire Default Aporte Flow To BR-26

**Files:**
- Modify: `apps/web/src/app/(authenticated)/aportes/registrar/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/aportes/registrar/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/aportes/registrar/actions.test.ts`
- Modify: `apps/web/src/app/(authenticated)/aportes/registrar/page.test.tsx`

- [ ] **Step 1: Add action tests**

Extend `actions.test.ts` so the default form calls `createPaymentService().recordMemberPayment` and redirects with receipt/split params. Mock `createPaymentService`, not `createLedgerService`.

Expected assertion:

```ts
expect(recordMemberPayment).toHaveBeenCalledWith(expect.objectContaining({
  orgId: "11111111-1111-4111-8111-111111111111",
  actorId: "33333333-3333-4333-8333-333333333333",
  memberId: "22222222-2222-4222-8222-222222222222",
  amount: "10.00",
}));
expect(revalidatePath).toHaveBeenCalledWith("/atrasos");
expect(revalidatePath).toHaveBeenCalledWith("/historial");
```

Add an extra-decision test:

```ts
recordMemberPayment.mockRejectedValue(new Error("payment_extra_decision_required"));
await expect(recordContributionAction(formData)).rejects.toThrow("NEXT_REDIRECT:/aportes/registrar?confirm=");
```

- [ ] **Step 2: Run action tests and confirm failure**

Run:

```bash
rtk pnpm --filter mi-banquito-web test -- aportes/registrar/actions.test.ts
```

Expected: fail because the action still calls `recordContribution`.

- [ ] **Step 3: Update action**

In `apps/web/src/app/(authenticated)/aportes/registrar/actions.ts`, replace `contributionFormSchema` + `createLedgerService().recordContribution` with `memberPaymentFormSchema` + `createPaymentService().recordMemberPayment`.

On success, revalidate:

```ts
revalidatePath("/aportes");
revalidatePath("/atrasos");
revalidatePath("/historial");
revalidatePath("/liquidez");
```

On `payment_extra_decision_required`, redirect back with `confirm=1` and the safe form fields (`clientRequestId`, `memberId`, `amount`, `datedOn`, `paymentSource`, `targetLoanId`, `targetCycleId`) as query params.

- [ ] **Step 4: Add page confirmation test**

In `page.test.tsx`, render search params with `confirm=1` and assert one-tap buttons exist:

```ts
expect(screen.getByRole("radio", { name: /Aporte extra/i })).toBeInTheDocument();
expect(screen.getByRole("radio", { name: /Prepagar aporte/i })).toBeInTheDocument();
expect(screen.getByRole("radio", { name: /Abonar a capital/i })).toBeInTheDocument();
```

- [ ] **Step 5: Update page**

In `page.tsx`, when `searchParams.confirm === "1"`, render a compact confirmation section above the submit button with:

```tsx
<fieldset className="grid gap-2 rounded-md border border-border p-4">
  <legend className="text-sm font-semibold text-text-primary">Queda dinero sin aplicar</legend>
  <Radio name="extraDecision" value="extra_savings" label="Aporte extra / ahorro" defaultChecked />
  <Radio name="extraDecision" value="future_contribution" label="Prepagar aporte futuro" />
  <Radio name="extraDecision" value="loan_principal" label="Abonar a capital" />
</fieldset>
```

- [ ] **Step 6: Run web tests**

Run:

```bash
rtk pnpm --filter mi-banquito-web test -- aportes/registrar/actions.test.ts aportes/registrar/page.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit aporte flow**

Run:

```bash
rtk git add apps/web/src/app/'(authenticated)'/aportes/registrar
rtk git commit -m "feat(web): route aporte payments through BR-26 (US-126)"
```

---

### Task 6: Targeted Atrasos And Loan Flow Disclosure

**Files:**
- Modify: `apps/web/src/app/(authenticated)/atrasos/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/atrasos/actions.test.ts`
- Modify: `apps/web/src/app/(authenticated)/prestamos/[id]/pago/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/prestamos/[id]/pago/page.tsx`

- [ ] **Step 1: Add atrasos regression tests**

In `atrasos/actions.test.ts`, assert `recordOverdueContributionAction` calls `recordMemberPayment` with `targetCycleId` and not `recordContribution`:

```ts
expect(recordMemberPayment).toHaveBeenCalledWith(expect.objectContaining({
  targetCycleId: "55555555-5555-4555-8555-555555555555",
  memberId: "22222222-2222-4222-8222-222222222222",
}));
```

- [ ] **Step 2: Update atrasos action**

Change `recordOverdueContributionAction` to build a `memberPaymentFormSchema` payload with:

```ts
targetCycleId: cycleId,
amount: money4(agingRow.amountDue),
paymentSource: "cash_in_meeting",
notes: `Pago desde atrasos: ${agingRow.periodLabel}`,
```

If the payment service detects higher-priority debt, redirect to `/aportes/registrar?confirm=1...` with target fields preserved.

- [ ] **Step 3: Add loan disclosure test**

In the loan payment page test, assert a warning area appears when the preview indicates higher-priority obligations. Mock `previewMemberPayment` to return a loan-fee allocation before the target loan principal allocation.

- [ ] **Step 4: Update loan page/action**

Keep `recordRepaymentAction` for explicit loan payments. Add a visible disclosure on `page.tsx`:

```tsx
<p className="rounded-md border border-warning bg-warning-soft p-3 text-sm text-text-primary">
  Si registras un pago general de esta socia, Mi Banquito aplicará primero mora, intereses y cuotas vencidas antes de aportes.
</p>
```

Do not block the existing loan-targeted flow; `principal_payment` remains the explicit override from US-036.

- [ ] **Step 5: Run targeted-flow tests**

Run:

```bash
rtk pnpm --filter mi-banquito-web test -- atrasos/actions.test.ts prestamos/[id]/pago/page.test.tsx prestamos/[id]/pago/actions.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit targeted flows**

Run:

```bash
rtk git add apps/web/src/app/'(authenticated)'/atrasos apps/web/src/app/'(authenticated)'/prestamos/'[id]'/pago
rtk git commit -m "feat(web): disclose BR-26 targeted payment behavior (US-126)"
```

---

### Task 7: History And Statement Consistency

**Files:**
- Modify: `packages/domain/src/audit.ts`
- Modify: `packages/domain/src/audit.test.ts`
- Modify: `packages/domain/src/reconciliation.ts`
- Modify: `packages/domain/src/reconciliation.test.ts`

- [ ] **Step 1: Add audit narration test**

In `audit.test.ts`, add:

```ts
it("narrates BR-26 payment receipt with allocation details", () => {
  const entry = narrateAuditRow({
    id: "audit-1",
    orgId: "11111111-1111-4111-8111-111111111111",
    actorKind: "member",
    actorId: "33333333-3333-4333-8333-333333333333",
    actionKind: "payment.receipt.recorded",
    subjectKind: "payment_receipt",
    subjectId: "44444444-4444-4444-8444-444444444444",
    payloadSnapshot: {
      memberName: "Toitq",
      receivedAmount: "80.0000",
      datedOn: "2026-07-09",
      allocations: [
        { kind: "loan_interest", amount: "10.0000" },
        { kind: "loan_principal", amount: "30.0000" },
        { kind: "contribution_overdue", amount: "20.0000", cycleLabel: "2026-06" },
        { kind: "contribution_current", amount: "20.0000", cycleLabel: "2026-07" },
      ],
    },
    reason: null,
    at: new Date("2026-07-09T15:30:00Z"),
    createdAt: new Date("2026-07-09T15:30:00Z"),
  });

  expect(entry.text).toBe("Toitq registró un pago de $80.00 el 2026-07-09.");
  expect(entry.details).toEqual(expect.arrayContaining([
    { label: "Aplicado a interés", value: "$10.00" },
    { label: "Aplicado a capital", value: "$30.00" },
    { label: "Aporte 2026-06", value: "$20.00" },
    { label: "Aporte 2026-07", value: "$20.00" },
  ]));
});
```

- [ ] **Step 2: Implement audit narration**

In `audit.ts`, add handling for `payment.receipt.recorded` in the narration switch. Use `payload.allocations` to build details. Keep existing contribution and repayment narration unchanged.

- [ ] **Step 3: Add statement grouping test**

In `reconciliation.test.ts`, add a monthly statement fixture where one receipt created one repayment and one contribution. Assert the generated statement payload includes one received payment section and split lines.

Expected payload excerpt:

```ts
expect(statement.payloadJson).toMatchObject({
  sections: expect.arrayContaining([
    expect.objectContaining({
      title: "Pagos recibidos",
      rows: expect.arrayContaining([
        expect.objectContaining({
          label: "Pago recibido de Toitq",
          amount: "80.0000",
          details: expect.arrayContaining([
            "Interés préstamo: 10.0000",
            "Capital préstamo: 30.0000",
            "Aporte 2026-06: 20.0000",
            "Aporte 2026-07: 20.0000",
          ]),
        }),
      ]),
    }),
  ]),
});
```

- [ ] **Step 4: Implement statement grouping**

In `reconciliation.ts`, when building monthly member statements, group contribution and repayment rows by `paymentReceiptId` when present. Render receipt total once and list allocation details under it. Rows without `paymentReceiptId` keep the existing behavior.

- [ ] **Step 5: Run audit/reconciliation tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- audit.test.ts reconciliation.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit history/statements**

Run:

```bash
rtk git add packages/domain/src/audit.ts packages/domain/src/audit.test.ts packages/domain/src/reconciliation.ts packages/domain/src/reconciliation.test.ts
rtk git commit -m "feat(reporting): show BR-26 payment splits (US-126)"
```

---

### Task 8: Verification And Feedback

**Files:**
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Run focused test suite**

Run:

```bash
rtk pnpm --filter @mi-banquito/db test -- br26-schema.test.ts
rtk pnpm --filter @mi-banquito/domain test -- payment-allocation.test.ts payment-service.test.ts audit.test.ts reconciliation.test.ts sprint2-validation.test.ts
rtk pnpm --filter mi-banquito-web test -- aportes/registrar/actions.test.ts aportes/registrar/page.test.tsx atrasos/actions.test.ts prestamos/[id]/pago/page.test.tsx prestamos/[id]/pago/actions.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run full required gates**

Run:

```bash
rtk pnpm type-check
rtk pnpm lint
rtk pnpm build
```

Expected: all pass.

- [ ] **Step 3: Append feedback events**

Append to `.nous-feedback.jsonl`:

```jsonl
{"story":"US-126","event":"ac_verify","ac":1,"method":"allocator golden test","pass":true,"notes":"BR-26 strict order covered by payment-allocation.test.ts"}
{"story":"US-126","event":"ac_verify","ac":2,"method":"service grouped-write test","pass":true,"notes":"Receipt, allocation lines, child repayment/contribution rows, audit, and refresh happen atomically."}
{"story":"US-126","event":"ac_verify","ac":3,"method":"web action test","pass":true,"notes":"Extra remainder redirects to one-tap confirmation until a decision is selected."}
{"story":"US-126","event":"ac_verify","ac":4,"method":"targeted flow tests","pass":true,"notes":"Atrasos and loan-targeted flows disclose or preserve target behavior."}
{"story":"US-126","event":"ac_verify","ac":5,"method":"page and audit tests","pass":true,"notes":"Confirmation, success, and history expose allocation split."}
{"story":"US-126","event":"ac_verify","ac":6,"method":"read-model and statement tests","pass":true,"notes":"A/R, compliance, liquidity refresh, statement grouping, and reconciliation payloads share the same split."}
{"story":"US-126","event":"ac_verify","ac":7,"method":"idempotency test","pass":true,"notes":"Retry with same client_request_id returns existing receipt and does not duplicate child rows."}
{"story":"US-126","event":"build_pass","notes":"pnpm type-check && pnpm lint && pnpm build"}
{"story":"US-126","event":"done","notes":"BR-26 member payment waterfall implemented and verified."}
```

- [ ] **Step 4: Commit verification feedback**

Run:

```bash
rtk git add .nous-feedback.jsonl
rtk git commit -m "docs(feedback): verify BR-26 payment waterfall (US-126)"
```

---

## Self-Review

- Spec coverage: BR-26 order, extra decision, targeted override, receipt grouping, audit, statements, A/R, liquidity, reconciliation, and idempotency are covered by tasks.
- Artifact coverage: US-029, US-036, US-040, US-044/046, US-048/049/059, US-054, US-056/057, US-077, US-100, and US-103 are explicitly covered.
- No new route is introduced, so the navigation map does not need a new route entry.
- The plan intentionally does not implement account regularization from CHG-001; when US-091/094 land, `payment_receipt.received_via` can be upgraded to `account_id` without changing the BR-26 allocation rule.
