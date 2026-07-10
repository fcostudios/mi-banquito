# Sprint 8 Admin And Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Sprint 8 by shipping the platform operator support surfaces and the CHG-001 multi-account movement/regularization model.

**Architecture:** Implement the CHG-001 account and movement substrate first because admin health, close, statements, and cash-flow depend on those invariants. Use existing `account`, `expense`, `transfer`, `contribution`, `repayment`, `audit_log_entry`, `statement_archive`, and `impersonation` entities; add only the missing columns and constraints needed for BR-12/BR-13 rather than introducing a parallel `movement` table.

**Tech Stack:** Next.js 16 App Router Server Components, Server Actions, Drizzle/Postgres, Vitest, React Testing Library, Tailwind/design tokens, Auth0 session gates.

---

## Sprint Plan Review

The regenerated `docs/stories/SPRINT_PLAN.md` has known marker drift. Use it for ordering, but reconcile status against `.nous-feedback.jsonl`.

Confirmed from local feedback:
- US-126 / BR-26 is done and verified even though the generated sprint queue does not consume that evidence.
- A separate substrate feedback event reports the bad sidebar generation that tried to replace Mi Banquito nav with CRM/Sales routes.

Recommended next sprint: Sprint 8.

Sprint 8 scope:
- US-019: admin home per-org health snapshot.
- US-020: read-only operator impersonation with required reason.
- US-021: tenant export ZIP with CSVs, PDFs, manifest, and audit.
- US-022: cross-org audit bitacora with filters and CSV export.
- US-023: substrate drift status page and cron persisted result.
- US-091: group accounts registry.
- US-092: categorized fund movement outflows.
- US-093: inter-account transfers.
- US-094: pending deposit regularization.
- US-095: monthly close block while pending regularizations exist.

Implementation order:
1. CHG-001 database and domain substrate.
2. Treasurer account and movement screens.
3. Monthly close integration.
4. Platform admin read surfaces and export.
5. Impersonation read-only enforcement.
6. Verification, feedback, and sprint close artifacts.

Do not edit generated sidebar files during this sprint unless the source nav map and generator invariant bug are fixed upstream.

---

## File Map

Create:
- `packages/domain/src/accounts.ts`: account registry service, account defaulting, account mutation audit.
- `packages/domain/src/accounts.test.ts`: account defaulting, zero-group-fund guard, audit, tenant isolation expectations.
- `packages/domain/src/movements.ts`: expenses, transfers, pending deposit regularization, balance calculations.
- `packages/domain/src/movements.test.ts`: BR-12/BR-13 invariants, idempotency, pending deposit regularization.
- `packages/domain/src/admin-health.ts`: per-org aggregate health snapshot for `/admin`.
- `packages/domain/src/admin-health.test.ts`: per-org aggregate behavior and no cross-tenant leakage.
- `packages/domain/src/admin-export.ts`: org export manifest/CSV/PDF collection helpers.
- `packages/domain/src/admin-export.test.ts`: manifest, CSV row counts, org isolation.
- `packages/domain/src/admin-audit.ts`: cross-org audit filtering and CSV serialization.
- `packages/domain/src/admin-audit.test.ts`: combinable filters and CSV parity.
- `packages/domain/src/impersonation.ts`: start/end impersonation and read-only write guard helpers.
- `packages/domain/src/impersonation.test.ts`: required reason, audit start/end, write guard.
- `apps/web/src/app/(authenticated)/cuentas/actions.ts`: save/deactivate account Server Actions.
- `apps/web/src/app/(authenticated)/cuentas/page.test.tsx`: account page rendering and blocked movement copy.
- `apps/web/src/app/(authenticated)/movimientos/registrar/actions.ts`: record expense/transfer/regularization Server Actions.
- `apps/web/src/app/(authenticated)/movimientos/registrar/page.test.tsx`: movement form modes, account filtering, pending row selection.
- `apps/web/src/app/(authenticated)/admin/audit/actions.ts`: audit CSV export action.
- `apps/web/src/app/(authenticated)/admin/audit/page.test.tsx`: audit filters and payload viewer.
- `apps/web/src/app/(authenticated)/admin/drift/page.test.tsx`: drift badge and raw report.
- `apps/web/src/app/(authenticated)/admin/orgs/[id]/export/route.test.ts`: ZIP export contents.
- `apps/web/src/app/(authenticated)/admin/orgs/[id]/impersonate/actions.ts`: start/end impersonation actions.
- `apps/web/src/app/(authenticated)/admin/orgs/[id]/impersonate/page.test.tsx`: required reason and submit state.
- `apps/web/src/components/layout/impersonation-banner.tsx`: persistent banner with exit action.

Modify:
- `packages/db/src/schema.ts`: add missing Drizzle columns/enums/index metadata matching the append-only SQL migration.
- `packages/db/src/migrations/V20260710HHMMSS__sprint_8_accounts_movements.sql`: append-only schema changes for CHG-001.
- `packages/domain/src/index.ts`: export new domain services.
- `packages/domain/src/reconciliation.ts`: include pending regularization rows in close state and reject close server-side.
- `packages/domain/src/reporting.ts`: add movement category itemization to monthly close payload.
- `apps/web/src/app/(authenticated)/cuentas/page.tsx`: replace scaffold with SCR-accounts.
- `apps/web/src/app/(authenticated)/movimientos/registrar/page.tsx`: replace scaffold with SCR-record-movement.
- `apps/web/src/app/(authenticated)/cierre/page.tsx`: add reconciliation panel and pending-row disabled state.
- `apps/web/src/app/(authenticated)/cierre/actions.ts`: preserve server-side close rejection messaging.
- `apps/web/src/app/(authenticated)/admin/page.tsx`: add US-019 health table columns/actions.
- `apps/web/src/app/(authenticated)/admin/audit/page.tsx`: replace scaffold with filtered audit table.
- `apps/web/src/app/(authenticated)/admin/drift/page.tsx`: replace scaffold with persisted drift result.
- `apps/web/src/app/(authenticated)/admin/orgs/[id]/export/page.tsx`: replace scaffold with export trigger/history.
- `apps/web/src/app/(authenticated)/admin/orgs/[id]/export/route.ts`: stream ZIP response.
- `apps/web/src/app/(authenticated)/admin/orgs/[id]/impersonate/page.tsx`: replace scaffold.
- `apps/web/src/app/(authenticated)/layout.tsx`: render impersonation banner when cookie is active.
- `apps/web/src/lib/auth/require-session.ts`: resolve active impersonation cookie for reads and block write paths.
- `apps/web/src/lib/i18n/en-US.json`: add all user-facing strings.
- `docs/stories/sprint-8/*.md`: add completion feedback only after implementation and verification.
- `.nous-feedback.jsonl`: add `started`, `ac_verify`, `build_pass`, and `done` events after work passes.

---

## Task 1: Database Contract For CHG-001

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/migrations/V20260710HHMMSS__sprint_8_accounts_movements.sql`
- Test: `packages/db/src/sprint8-schema.test.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
import { describe, expect, it } from "vitest";
import { account, contribution, expense, repayment, transfer } from "./schema";

describe("Sprint 8 account and movement schema", () => {
  it("exposes account and regularization columns required by BR-12 and BR-13", () => {
    expect(account.isGroupFund.name).toBe("is_group_fund");
    expect(expense.accountId.name).toBe("account_id");
    expect(expense.category.name).toBe("category");
    expect(expense.clientRequestId.name).toBe("client_request_id");
    expect(contribution.accountId.name).toBe("account_id");
    expect(contribution.reconciliationStatus.name).toBe("reconciliation_status");
    expect(repayment.accountId.name).toBe("account_id");
    expect(repayment.reconciliationStatus.name).toBe("reconciliation_status");
    expect(transfer.regularizesKind.name).toBe("regularizes_kind");
    expect(transfer.regularizesId.name).toBe("regularizes_id");
    expect(transfer.clientRequestId.name).toBe("client_request_id");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
rtk pnpm --filter @mi-banquito/db test -- sprint8-schema.test.ts
```
Expected: FAIL because `expense.accountId`, `expense.category`, `contribution.accountId`, `contribution.reconciliationStatus`, `repayment.accountId`, `repayment.reconciliationStatus`, or `transfer.clientRequestId` are not yet defined.

- [ ] **Step 3: Add the append-only SQL migration**

Use the real timestamp at implementation time:

```sql
ALTER TABLE expense
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES account(id),
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS slip_photo_id uuid REFERENCES slip_photo(id);

UPDATE expense SET category = 'operating' WHERE category IS NULL;

ALTER TABLE expense
  ALTER COLUMN category SET NOT NULL;

ALTER TABLE contribution
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES account(id),
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'regularized';

ALTER TABLE repayment
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES account(id),
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'regularized';

ALTER TABLE transfer
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_expense_category_br13'
  ) THEN
    ALTER TABLE expense ADD CONSTRAINT ck_expense_category_br13
      CHECK (category IN ('bank_fee', 'supplies', 'shared_expense', 'operating', 'solidarity_payout', 'treasurer_comp_payout'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_contribution_reconciliation_status'
  ) THEN
    ALTER TABLE contribution ADD CONSTRAINT ck_contribution_reconciliation_status
      CHECK (reconciliation_status IN ('pending', 'regularized'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_repayment_reconciliation_status'
  ) THEN
    ALTER TABLE repayment ADD CONSTRAINT ck_repayment_reconciliation_status
      CHECK (reconciliation_status IN ('pending', 'regularized'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_transfer_distinct_accounts'
  ) THEN
    ALTER TABLE transfer ADD CONSTRAINT ck_transfer_distinct_accounts
      CHECK (from_account_id <> to_account_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_account_org_group_fund
  ON account(org_id, is_group_fund, status);
CREATE INDEX IF NOT EXISTS idx_expense_org_account_date
  ON expense(org_id, account_id, incurred_on);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_org_client_request
  ON expense(org_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_org_client_request
  ON transfer(org_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contribution_org_reconciliation
  ON contribution(org_id, reconciliation_status, dated_on);
CREATE INDEX IF NOT EXISTS idx_repayment_org_reconciliation
  ON repayment(org_id, reconciliation_status, dated_on);
```

- [ ] **Step 4: Update Drizzle schema metadata**

Add the matching properties:

```ts
// expense
accountId: uuid("account_id").references((): AnyPgColumn => account.id),
category: text("category").notNull(),
slipPhotoId: uuid("slip_photo_id").references((): AnyPgColumn => slipPhoto.id),

// contribution
accountId: uuid("account_id").references((): AnyPgColumn => account.id),
reconciliationStatus: text("reconciliation_status").default("regularized").notNull(),

// repayment
accountId: uuid("account_id").references((): AnyPgColumn => account.id),
reconciliationStatus: text("reconciliation_status").default("regularized").notNull(),

// transfer
clientRequestId: uuid("client_request_id"),
```

- [ ] **Step 5: Run schema verification**

Run:
```bash
rtk pnpm --filter @mi-banquito/db test -- sprint8-schema.test.ts
rtk pnpm --filter @mi-banquito/db type-check
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/db/src/schema.ts packages/db/src/migrations packages/db/src/sprint8-schema.test.ts
rtk git commit -m "feat(accounts): add sprint 8 movement schema (US-091)"
```

---

## Task 2: Account Registry Service And Screen

**Files:**
- Create: `packages/domain/src/accounts.ts`
- Create: `packages/domain/src/accounts.test.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `apps/web/src/app/(authenticated)/cuentas/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/cuentas/page.tsx`
- Create: `apps/web/src/app/(authenticated)/cuentas/page.test.tsx`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write the account domain tests**

```ts
import { describe, expect, it } from "vitest";
import {
  defaultIsGroupFundForAccountType,
  hasActiveGroupFundAccount,
  validateAccountInput,
} from "./accounts";

describe("US-091 accounts", () => {
  it("defaults group-fund status from account type but preserves explicit override", () => {
    expect(defaultIsGroupFundForAccountType("group_bank")).toBe(true);
    expect(defaultIsGroupFundForAccountType("cash_box")).toBe(true);
    expect(defaultIsGroupFundForAccountType("treasurer_personal")).toBe(false);
    expect(defaultIsGroupFundForAccountType("external")).toBe(false);
    expect(validateAccountInput({
      name: "Cuenta personal",
      type: "treasurer_personal",
      isGroupFund: true,
      last4: "7733",
    }).isGroupFund).toBe(true);
  });

  it("detects whether movement recording is blocked by missing group-fund accounts", () => {
    expect(hasActiveGroupFundAccount([])).toBe(false);
    expect(hasActiveGroupFundAccount([
      { status: "active", isGroupFund: false },
      { status: "archived", isGroupFund: true },
    ])).toBe(false);
    expect(hasActiveGroupFundAccount([
      { status: "active", isGroupFund: true },
    ])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing tests**

```bash
rtk pnpm --filter @mi-banquito/domain test -- accounts.test.ts
```
Expected: FAIL because `accounts.ts` does not exist.

- [ ] **Step 3: Implement `accounts.ts`**

```ts
import { and, asc, eq } from "drizzle-orm";
import { account, auditLogEntry } from "@mi-banquito/db/schema";
import { withWritableTenantTransaction } from "@mi-banquito/db/tenant";

export type AccountType = "group_bank" | "cash_box" | "treasurer_personal" | "external";
export type AccountStatus = "active" | "archived";

export type AccountInput = {
  id?: string;
  orgId: string;
  actorId: string;
  name: string;
  type: AccountType;
  isGroupFund?: boolean;
  last4?: string | null;
};

export function defaultIsGroupFundForAccountType(type: AccountType): boolean {
  return type === "group_bank" || type === "cash_box";
}

export function validateAccountInput(input: Omit<AccountInput, "orgId" | "actorId">) {
  const name = input.name.trim();
  if (!name) throw new Error("account_name_required");
  const last4 = input.last4?.trim() || null;
  if (last4 && !/^[0-9]{4}$/.test(last4)) throw new Error("account_last4_invalid");
  return {
    ...input,
    name,
    last4,
    isGroupFund: input.isGroupFund ?? defaultIsGroupFundForAccountType(input.type),
  };
}

export function hasActiveGroupFundAccount(rows: Array<{ status: AccountStatus; isGroupFund: boolean }>): boolean {
  return rows.some((row) => row.status === "active" && row.isGroupFund);
}

export function createAccountService() {
  return {
    async listAccounts(orgId: string) {
      return withWritableTenantTransaction(orgId, async (tx) =>
        tx.select().from(account)
          .where(eq(account.orgId, orgId))
          .orderBy(asc(account.name)));
    },
    async saveAccount(input: AccountInput) {
      const now = new Date();
      const parsed = validateAccountInput(input);
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const [row] = input.id
          ? await tx.update(account).set({
              name: parsed.name,
              type: parsed.type,
              isGroupFund: parsed.isGroupFund,
              last4: parsed.last4,
            }).where(and(eq(account.orgId, input.orgId), eq(account.id, input.id))).returning()
          : await tx.insert(account).values({
              orgId: input.orgId,
              name: parsed.name,
              type: parsed.type,
              isGroupFund: parsed.isGroupFund,
              last4: parsed.last4,
              status: "active",
              createdAt: now,
              createdBy: input.actorId,
            }).returning();

        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: input.id ? "account.update" : "account.create",
          subjectKind: "account",
          subjectId: row.id,
          payloadSnapshot: row,
          reason: null,
          at: now,
          createdAt: now,
        });
        return row;
      });
    },
    async deactivateAccount(input: { orgId: string; actorId: string; accountId: string }) {
      const now = new Date();
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const [row] = await tx.update(account)
          .set({ status: "archived" })
          .where(and(eq(account.orgId, input.orgId), eq(account.id, input.accountId)))
          .returning();
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "account.archive",
          subjectKind: "account",
          subjectId: input.accountId,
          payloadSnapshot: row,
          reason: null,
          at: now,
          createdAt: now,
        });
        return row;
      });
    },
  };
}
```

- [ ] **Step 4: Wire Server Actions and page**

Server Actions parse `name`, `type`, `isGroupFund`, `last4`, call `requireTreasurer()`, then call `createAccountService().saveAccount`. The page renders:
- account table
- status pill "Dentro del fondo" or "Fuera del fondo - requiere regularizacion"
- blocked movement banner if no active group-fund account exists
- account form with `type`, `name`, `last4`, and `isGroupFund`

- [ ] **Step 5: Run focused tests**

```bash
rtk pnpm --filter @mi-banquito/domain test -- accounts.test.ts
rtk pnpm --filter mi-banquito-web test -- cuentas
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/domain/src/accounts.ts packages/domain/src/accounts.test.ts packages/domain/src/index.ts apps/web/src/app/'(authenticated)'/cuentas apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(accounts): manage group fund accounts (US-091)"
```

---

## Task 3: Movement Outflows And Transfers

**Files:**
- Create: `packages/domain/src/movements.ts`
- Create: `packages/domain/src/movements.test.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `apps/web/src/app/(authenticated)/movimientos/registrar/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/movimientos/registrar/page.tsx`
- Create: `apps/web/src/app/(authenticated)/movimientos/registrar/page.test.tsx`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write invariant tests**

```ts
import { describe, expect, it } from "vitest";
import {
  assertExpenseCategory,
  assertTransferAccounts,
  transferFundDelta,
} from "./movements";

describe("US-092 and US-093 movements", () => {
  it("rejects uncategorized outflows and accepts the BR-13 categories", () => {
    expect(() => assertExpenseCategory("")).toThrow("movement_category_required");
    expect(() => assertExpenseCategory("random")).toThrow("movement_category_invalid");
    for (const category of ["bank_fee", "supplies", "shared_expense", "operating", "solidarity_payout", "treasurer_comp_payout"]) {
      expect(assertExpenseCategory(category)).toBe(category);
    }
  });

  it("enforces transfer account invariants and zero total-fund delta", () => {
    expect(() => assertTransferAccounts({
      from: { id: "a", isGroupFund: true, orgId: "org" },
      to: { id: "a", isGroupFund: true, orgId: "org" },
    })).toThrow("transfer_accounts_must_differ");
    expect(() => assertTransferAccounts({
      from: { id: "a", isGroupFund: true, orgId: "org-a" },
      to: { id: "b", isGroupFund: true, orgId: "org-b" },
    })).toThrow("transfer_accounts_same_org_required");
    expect(transferFundDelta({
      from: { isGroupFund: true },
      to: { isGroupFund: true },
      amount: "25.00",
    })).toBe("0.0000");
  });
});
```

- [ ] **Step 2: Run the failing tests**

```bash
rtk pnpm --filter @mi-banquito/domain test -- movements.test.ts
```
Expected: FAIL because `movements.ts` does not exist.

- [ ] **Step 3: Implement movement helpers and service**

`createMovementService()` must expose:
- `recordExpense({ orgId, actorId, accountId, category, amount, datedOn, notes, clientRequestId })`
- `recordTransfer({ orgId, actorId, fromAccountId, toAccountId, amount, datedOn, notes, clientRequestId })`
- `listPendingDeposits(orgId)`
- `regularizePendingDeposit({ orgId, actorId, regularizesKind, regularizesId, toAccountId, amount, datedOn, clientRequestId })`

Service rules:
- `recordExpense` only accepts active group-fund accounts.
- `recordExpense` writes `expense` with `status = "paid"`, required `category`, `accountId`, and idempotent `clientRequestId`.
- `recordTransfer` rejects same account, cross-org account, and non-group accounts for normal transfer mode.
- Every write inserts `auditLogEntry` with action kind `movement.expense`, `movement.transfer`, or `movement.regularization`.

- [ ] **Step 4: Replace SCR-record-movement scaffold**

The page renders two un-nested sections:
- "Salida del fondo" form posts `mode=expense`.
- "Movimiento entre cuentas" form posts `mode=transfer` or `mode=regularization`.

The action redirects to `/historial?movement=registered` on success and `/movimientos/registrar?error=...` on failure.

- [ ] **Step 5: Run focused tests**

```bash
rtk pnpm --filter @mi-banquito/domain test -- movements.test.ts
rtk pnpm --filter mi-banquito-web test -- movimientos
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/domain/src/movements.ts packages/domain/src/movements.test.ts packages/domain/src/index.ts apps/web/src/app/'(authenticated)'/movimientos apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(movements): record expenses and transfers (US-092)"
```

---

## Task 4: Pending Deposit Regularization And Close Guard

**Files:**
- Modify: `packages/domain/src/movements.ts`
- Modify: `packages/domain/src/movements.test.ts`
- Modify: `packages/domain/src/reconciliation.ts`
- Modify: `packages/domain/src/reconciliation.test.ts`
- Modify: `packages/domain/src/reporting.ts`
- Modify: `apps/web/src/app/(authenticated)/cierre/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/cierre/actions.ts`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write pending regularization tests**

```ts
import { describe, expect, it } from "vitest";
import {
  pendingDepositFundDelta,
  shouldMarkRegularized,
} from "./movements";

describe("US-094 pending deposit regularization", () => {
  it("keeps pending deposits outside the fund until fully regularized", () => {
    expect(pendingDepositFundDelta({ reconciliationStatus: "pending", amount: "100.00" })).toBe("0.0000");
    expect(pendingDepositFundDelta({ reconciliationStatus: "regularized", amount: "100.00" })).toBe("100.0000");
  });

  it("only flips to regularized when transfer coverage reaches the source amount", () => {
    expect(shouldMarkRegularized({ sourceAmount: "100.00", regularizedAmount: "99.99" })).toBe(false);
    expect(shouldMarkRegularized({ sourceAmount: "100.00", regularizedAmount: "100.00" })).toBe(true);
    expect(shouldMarkRegularized({ sourceAmount: "100.00", regularizedAmount: "120.00" })).toBe(true);
  });
});
```

- [ ] **Step 2: Write close-guard test**

```ts
import { describe, expect, it } from "vitest";
import { canCloseWithPendingRegularizations } from "./reconciliation";

describe("US-095 monthly close pending regularization guard", () => {
  it("blocks close when period has pending regularization rows", () => {
    expect(canCloseWithPendingRegularizations([])).toBe(true);
    expect(canCloseWithPendingRegularizations([{ id: "pending-1" }])).toBe(false);
  });
});
```

- [ ] **Step 3: Implement service logic**

Add pure helpers to `movements.ts` and export them. Extend `regularizePendingDeposit` so it:
- requires `toAccount.isGroupFund === true`
- writes `transfer.purpose = "regularization"`
- writes `regularizesKind` and `regularizesId`
- sums existing regularization transfers
- updates source `contribution` or `repayment` to `reconciliationStatus = "regularized"` only when coverage is complete

- [ ] **Step 4: Extend reconciliation close state**

`getMonthlyCloseState` returns:

```ts
pendingRegularizations: Array<{
  id: string;
  kind: "contribution" | "repayment";
  memberName: string;
  amount: string;
  datedOn: string;
  accountName: string;
}>;
```

`closePeriod` rejects when that array is non-empty:

```ts
if (pendingRegularizations.length > 0) {
  throw new Error("period_close_pending_regularizations");
}
```

- [ ] **Step 5: Add reconciliation panel to close page**

Render pending rows above the close button. Disable close and show:

```txt
Regulariza estos depósitos antes de cerrar el mes.
```

Each row links to:

```txt
/movimientos/registrar?regularizesKind=<kind>&regularizesId=<id>
```

- [ ] **Step 6: Run tests**

```bash
rtk pnpm --filter @mi-banquito/domain test -- movements.test.ts reconciliation.test.ts
rtk pnpm --filter mi-banquito-web test -- cierre
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add packages/domain/src/movements.ts packages/domain/src/movements.test.ts packages/domain/src/reconciliation.ts packages/domain/src/reconciliation.test.ts packages/domain/src/reporting.ts apps/web/src/app/'(authenticated)'/cierre apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(close): block close for pending regularizations (US-095)"
```

---

## Task 5: Admin Health, Audit, Drift, And Export

**Files:**
- Create: `packages/domain/src/admin-health.ts`
- Create: `packages/domain/src/admin-health.test.ts`
- Create: `packages/domain/src/admin-audit.ts`
- Create: `packages/domain/src/admin-audit.test.ts`
- Create: `packages/domain/src/admin-export.ts`
- Create: `packages/domain/src/admin-export.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `apps/web/src/app/(authenticated)/admin/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/admin/audit/page.tsx`
- Create: `apps/web/src/app/(authenticated)/admin/audit/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/admin/drift/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/admin/orgs/[id]/export/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/admin/orgs/[id]/export/route.ts`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write admin-health tests**

```ts
import { describe, expect, it } from "vitest";
import { reconciliationToneForPendingCount } from "./admin-health";

describe("US-019 admin health", () => {
  it("maps pending reconciliation count to badge tone", () => {
    expect(reconciliationToneForPendingCount(0)).toBe("success");
    expect(reconciliationToneForPendingCount(1)).toBe("danger");
  });
});
```

- [ ] **Step 2: Write audit filter tests**

```ts
import { describe, expect, it } from "vitest";
import { auditRowMatchesFilters } from "./admin-audit";

describe("US-022 admin audit filters", () => {
  const row = {
    orgId: "org-a",
    actorKind: "member",
    actionKind: "contribution.record",
    at: new Date("2026-07-08T12:00:00Z"),
  };

  it("ANDs org, actor, action, and date filters", () => {
    expect(auditRowMatchesFilters(row, {
      orgId: "org-a",
      actorKind: "member",
      actionKind: "contribution",
      from: "2026-07-01",
      to: "2026-07-31",
    })).toBe(true);
    expect(auditRowMatchesFilters(row, { orgId: "org-b" })).toBe(false);
    expect(auditRowMatchesFilters(row, { actorKind: "system" })).toBe(false);
  });
});
```

- [ ] **Step 3: Implement domain services**

`admin-health.ts` returns rows containing:
- org name
- last activity timestamp from `auditLogEntry`
- last close date from `periodClose`
- reconciliation pending count
- open loans count from `loan`
- A/R total from `arAging`
- drift badge from latest drift persisted result

`admin-audit.ts` returns filtered `auditLogEntry` rows and `auditRowsToCsv(rows)`.

`admin-export.ts` builds:
- `manifest.json`
- one CSV per required entity
- all `statementArchive` PDF references for the org
- README in Spanish and English

For ZIP creation, use a streaming library already present if available. If none is installed, add a small dependency deliberately and document why in the commit body.

- [ ] **Step 4: Replace admin scaffolds**

Implement:
- `/admin`: SCR-admin-home health table and action links to detail, impersonate, export.
- `/admin/audit`: filters and JSON payload details with `<details><summary>Detalle</summary><pre>...</pre></details>`.
- `/admin/drift`: persisted status badge, timestamp, raw text.
- `/admin/orgs/[id]/export`: export button plus explanation of ZIP contents.
- `/admin/orgs/[id]/export/route.ts`: `GET` streams `application/zip` and writes `data.exported` audit.

- [ ] **Step 5: Run tests**

```bash
rtk pnpm --filter @mi-banquito/domain test -- admin-health.test.ts admin-audit.test.ts admin-export.test.ts
rtk pnpm --filter mi-banquito-web test -- admin
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/domain/src/admin-health.ts packages/domain/src/admin-health.test.ts packages/domain/src/admin-audit.ts packages/domain/src/admin-audit.test.ts packages/domain/src/admin-export.ts packages/domain/src/admin-export.test.ts packages/domain/src/index.ts apps/web/src/app/'(authenticated)'/admin apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(admin): add operator health audit drift export surfaces (US-019)"
```

---

## Task 6: Read-Only Impersonation

**Files:**
- Create: `packages/domain/src/impersonation.ts`
- Create: `packages/domain/src/impersonation.test.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `apps/web/src/app/(authenticated)/admin/orgs/[id]/impersonate/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/admin/orgs/[id]/impersonate/page.tsx`
- Create: `apps/web/src/app/(authenticated)/admin/orgs/[id]/impersonate/page.test.tsx`
- Create: `apps/web/src/components/layout/impersonation-banner.tsx`
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`
- Modify: `apps/web/src/lib/auth/require-session.ts`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write domain tests**

```ts
import { describe, expect, it } from "vitest";
import { assertImpersonationReason, assertWritableWhenNotImpersonating } from "./impersonation";

describe("US-020 impersonation", () => {
  it("requires a meaningful reason", () => {
    expect(() => assertImpersonationReason("")).toThrow("impersonation_reason_required");
    expect(() => assertImpersonationReason("debug")).toThrow("impersonation_reason_too_short");
    expect(assertImpersonationReason("Ayudar con cierre mensual")).toBe("Ayudar con cierre mensual");
  });

  it("blocks writes while read-only impersonating", () => {
    expect(() => assertWritableWhenNotImpersonating({ readOnly: true })).toThrow("impersonation_read_only");
    expect(assertWritableWhenNotImpersonating({ readOnly: false })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement impersonation helpers and actions**

`startImpersonationAction`:
- requires platform operator
- validates reason length >= 10
- inserts `impersonation` with `mode = "read_only"`
- writes `auditLogEntry` action `impersonation.started`
- sets an httpOnly cookie with `impersonation_id` and target `org_id`
- redirects to `/`

`endImpersonationAction`:
- updates `impersonation.endedAt`
- writes `impersonation.ended`
- clears cookie
- redirects to `/admin/orgs/[id]`

- [ ] **Step 3: Enforce read-only writes**

Add a helper in `require-session.ts`:

```ts
export async function requireWritableTreasurer(): Promise<RequiredSession> {
  const session = await requireTreasurer();
  if (await isReadOnlyImpersonationActive()) {
    throw new Error("Impersonation is read-only.");
  }
  return session;
}
```

Then change money-writing Server Actions touched by Sprint 8 to use `requireWritableTreasurer`.

- [ ] **Step 4: Render the persistent banner**

`impersonation-banner.tsx` displays:

```txt
Viendo como tesorera en modo solo lectura
```

with a form button:

```txt
Salir de impersonacion
```

- [ ] **Step 5: Run tests**

```bash
rtk pnpm --filter @mi-banquito/domain test -- impersonation.test.ts
rtk pnpm --filter mi-banquito-web test -- impersonate
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/domain/src/impersonation.ts packages/domain/src/impersonation.test.ts packages/domain/src/index.ts apps/web/src/app/'(authenticated)'/admin/orgs/'[id]'/impersonate apps/web/src/components/layout/impersonation-banner.tsx apps/web/src/app/'(authenticated)'/layout.tsx apps/web/src/lib/auth/require-session.ts apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(admin): support read-only impersonation (US-020)"
```

---

## Task 7: End-To-End Verification And Sprint Closure

**Files:**
- Modify: `.nous-feedback.jsonl`
- Modify if needed: `docs/stories/STATUS_REPORT.md`

- [ ] **Step 1: Run focused suites**

```bash
rtk pnpm --filter @mi-banquito/db test
rtk pnpm --filter @mi-banquito/domain test
rtk pnpm --filter mi-banquito-web test
```
Expected: PASS.

- [ ] **Step 2: Run mandatory gates**

```bash
rtk pnpm type-check
rtk pnpm lint
rtk pnpm build
```
Expected: PASS.

- [ ] **Step 3: Apply and verify schema**

Use the target database URL for the environment being verified.

```bash
rtk bash -lc 'cd packages/db && pnpm drizzle-kit push && node scripts/verify-schema.mjs'
```
Expected: Drizzle push succeeds and `verify-schema.mjs` confirms the schema is reachable and applied.

- [ ] **Step 4: Browser smoke test**

Start local web:

```bash
rtk pnpm --filter mi-banquito-web dev
```

Smoke paths:
- `/cuentas`: create group bank, cash box, treasurer personal account, archive one account.
- `/movimientos/registrar`: record `bank_fee`, `supplies`, `shared_expense`, and transfer.
- `/aportes/registrar`: choose a personal account and confirm the created row is pending.
- `/movimientos/registrar?regularizesKind=contribution&regularizesId=<id>`: regularize pending deposit.
- `/cierre`: pending row blocks close, regularized state allows close.
- `/admin`: health table loads and links to org detail, export, impersonate.
- `/admin/audit`: filters combine and JSON payload viewer opens.
- `/admin/drift`: latest status and raw report render.
- `/admin/orgs/<org-id>/export`: ZIP downloads and manifest is present.
- `/admin/orgs/<org-id>/impersonate`: reason required, banner appears, writes are blocked.

- [ ] **Step 5: Record feedback evidence**

Append one `started`, one `build_pass`, one `done`, and AC verification events for each story:

```json
{"story":"US-091","event":"ac_verify","ac":1,"method":"domain and page tests","pass":true,"notes":"SCR-accounts lists and saves accounts with derived group-fund status."}
{"story":"US-092","event":"ac_verify","ac":3,"method":"service idempotency test","pass":true,"notes":"Repeated client_request_id returns the same movement without duplicate expense rows."}
{"story":"US-093","event":"ac_verify","ac":3,"method":"property/domain test","pass":true,"notes":"Transfer total fund delta remains exactly zero for group-fund to group-fund transfers."}
{"story":"US-094","event":"ac_verify","ac":5,"method":"regularization coverage test","pass":true,"notes":"Pending source flips only when regularizing transfers cover the full source amount."}
{"story":"US-095","event":"ac_verify","ac":4,"method":"server-action/domain test","pass":true,"notes":"Close rejects server-side when pending regularizations remain."}
{"story":"US-019","event":"ac_verify","ac":1,"method":"admin page test","pass":true,"notes":"Admin home renders one health row per org with required metrics and action links."}
{"story":"US-020","event":"ac_verify","ac":4,"method":"impersonation write-guard test","pass":true,"notes":"Read-only impersonation blocks write attempts server-side."}
{"story":"US-021","event":"ac_verify","ac":4,"method":"ZIP isolation test","pass":true,"notes":"Tenant export excludes rows from other organizations."}
{"story":"US-022","event":"ac_verify","ac":2,"method":"audit filter tests","pass":true,"notes":"Org, actor, action, and date filters combine server-side."}
{"story":"US-023","event":"ac_verify","ac":5,"method":"drift page test","pass":true,"notes":"Persisted exit code alone drives green/red drift badge."}
```

- [ ] **Step 6: Commit closure artifacts**

```bash
rtk git add .nous-feedback.jsonl docs/stories/STATUS_REPORT.md
rtk git commit -m "docs(sprint): close sprint 8 evidence (US-091)"
```

- [ ] **Step 7: Final deploy checklist**

Before production deploy:
- Confirm migrations are append-only.
- Confirm no generated sidebar contamination appeared in diff.
- Confirm `/admin/orgs/new` still redirects to `/admin/orgs/nueva` until the upstream nav route issue is resolved.
- Confirm `cron_secret` smoke test still passes for cron routes.
- Confirm Neon prod migration target is intentionally selected.

---

## Self-Review

Spec coverage:
- US-091 covered by Tasks 1 and 2.
- US-092 and US-093 covered by Tasks 1 and 3.
- US-094 and US-095 covered by Task 4.
- US-019, US-021, US-022, and US-023 covered by Task 5.
- US-020 covered by Task 6.
- Verification and sprint feedback covered by Task 7.

Known implementation risks:
- The generated plan still has status drift. Use `.nous-feedback.jsonl` as the evidence source until substrate sync is fixed.
- Existing schema has no unified `movement` table. This plan intentionally maps R1 movement behavior to `expense` and `transfer`.
- Export ZIP streaming may require adding a dependency if no existing streaming ZIP helper is available.
- Read-only impersonation must be enforced server-side. Hiding buttons is not enough.

Placeholder scan:
- No task uses TBD or "implement later".
- Every test command has an expected result.
- Every mutation path includes audit and tenant-scope requirements.

Execution handoff:

Plan complete and saved to `docs/superpowers/plans/2026-07-10-sprint-8-admin-accounts.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints.
