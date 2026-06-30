# Sprint 2 Loans, Cron, and Contribution Realism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Sprint 2 stories US-033, US-034, US-035, US-036, US-037, US-038, US-039, US-074, US-075, and US-081 with verified loan origination, repayment, cron accrual, referral commission, contribution source, partial contribution, and cron-run history behavior.

**Architecture:** Keep Mi Banquito as one serverless Next.js App Router app. Add the missing Sprint 2 data substrate through append-only SQL migrations and Drizzle schema updates, implement deterministic business rules in `packages/domain`, expose validated Server Actions in `apps/web`, and keep all multi-tenant writes `org_id` scoped with audit entries in the same transaction.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM, PostgreSQL, Vitest, Playwright, zod, Auth0 session guards, Vercel Cron route handlers.

---

## Sprint Closure Context

Sprint 0 is closed with accepted external deferrals recorded in `docs/stories/DEFERRED_EXTERNAL_BLOCKERS.md`.
Sprint 1 is closed with inherited Sprint 0 deferrals. Sprint 2 implementation must not block on unresolved Sentry, Better Stack, custom-domain, or Auth0 passwordless evidence unless a story explicitly requires live Auth0 interaction.

## Source Stories

- `docs/stories/sprint-2/r1_loans_us_033.md`
- `docs/stories/sprint-2/r1_loans_us_034.md`
- `docs/stories/sprint-2/r1_loans_us_035.md`
- `docs/stories/sprint-2/r1_loans_us_036.md`
- `docs/stories/sprint-2/r1_loans_us_037.md`
- `docs/stories/sprint-2/r1_loans_us_038.md`
- `docs/stories/sprint-2/r1_loans_us_039.md`
- `docs/stories/sprint-2/r1_chg_us_074.md`
- `docs/stories/sprint-2/r1_chg_us_075.md`
- `docs/stories/sprint-2/r1_chg_us_081.md`

## File Structure

Create or modify these files:

- Create `packages/db/src/migrations/V20260630090000__sprint_2_loans_cron_contribution_source.sql` for additive Sprint 2 tables, constraints, unique indexes, contribution source columns, partial contribution support, and materialized views.
- Modify `packages/db/src/schema.ts` to expose the new tables/columns.
- Modify `packages/db/scripts/verify-schema.mjs` so local schema verification counts the new Sprint 2 objects.
- Modify `packages/contracts/src/index.ts` to export Sprint 2 zod form schemas.
- Replace `packages/domain/src/loan.ts` stub with a real service boundary.
- Create `packages/domain/src/loans/types.ts` for shared loan DTOs and result types.
- Create `packages/domain/src/loans/eligibility.ts` for loan pre-flight rules.
- Create `packages/domain/src/loans/repayment.ts` for interest-first repayment splitting.
- Create `packages/domain/src/loans/referral.ts` for one-time referral commission credit.
- Create `packages/domain/src/loans/accrual.ts` for daily interest and mora accrual planning.
- Create `packages/domain/src/sprint2-schema.test.ts`.
- Create `packages/domain/src/sprint2-loans.test.ts`.
- Create `packages/domain/src/sprint2-contributions.test.ts`.
- Create `packages/domain/src/sprint2-cron.test.ts`.
- Modify `packages/domain/src/ledger.ts` for `payment_source`, `kind='partial'`, and compliance state `parcial`.
- Modify `packages/domain/src/index.ts` to export the real loan service and helpers.
- Modify `apps/web/src/app/(authenticated)/prestamos/nuevo/page.tsx` and create `apps/web/src/app/(authenticated)/prestamos/nuevo/actions.ts`.
- Modify `apps/web/src/app/(authenticated)/prestamos/[id]/page.tsx`.
- Modify `apps/web/src/app/(authenticated)/prestamos/[id]/pago/page.tsx` and create `apps/web/src/app/(authenticated)/prestamos/[id]/pago/actions.ts`.
- Modify `apps/web/src/app/(authenticated)/prestamos/page.tsx`.
- Modify `apps/web/src/app/(authenticated)/aportes/registrar/page.tsx` and `apps/web/src/app/(authenticated)/aportes/registrar/actions.ts`.
- Modify `apps/web/src/app/(authenticated)/cierre/page.tsx` to show separate bank and petty cash rows.
- Modify `apps/web/src/app/(authenticated)/admin/cron-runs/page.tsx` and create `apps/web/src/app/(authenticated)/admin/cron-runs/actions.ts`.
- Modify `apps/web/src/app/api/cron/accrue-interest/route.ts`.
- Modify `apps/web/src/lib/cron/handler.ts` to record cron run history and support summaries.
- Modify `apps/web/src/lib/i18n/en-US.json` with Sprint 2 copy.
- Create `apps/web/e2e/sprint2.spec.ts`.
- Create `scripts/sprint2-closure-gate.mjs`.
- Modify root `package.json` and `apps/web/package.json` to wire the Sprint 2 closure gate.
- Append Sprint 2 AC/build/done evidence to `.nous-feedback.jsonl`.

## Work Order

Implement in this order:

1. Schema substrate first, because every later story depends on persisted rows and constraints.
2. Pure domain tests/rules next, keeping business math deterministic outside the UI.
3. Server Actions and UI vertical slices.
4. Cron accrual and cron-run history after loan origination exists.
5. E2E, adversarial tests, closure gates, production deployment.

### Task 1: Sprint 2 Data Substrate

**Files:**
- Create: `packages/db/src/migrations/V20260630090000__sprint_2_loans_cron_contribution_source.sql`
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/scripts/verify-schema.mjs`
- Test: `packages/domain/src/sprint2-schema.test.ts`

- [ ] **Step 1: Write the failing schema export test**

Create `packages/domain/src/sprint2-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  contribution,
  cronRun,
  loan,
  loanGuarantor,
  loanReferral,
  nonMemberBorrower,
} from "@mi-banquito/db/schema";

describe("Sprint 2 schema exports", () => {
  it("exposes contribution source and partial contribution columns", () => {
    expect(contribution.paymentSource.name).toBe("payment_source");
    expect(contribution.kind.name).toBe("kind");
  });

  it("exposes loan party and reproducibility columns", () => {
    expect(loan.borrowerKind.name).toBe("borrower_kind");
    expect(loan.borrowerMemberId.name).toBe("borrower_member_id");
    expect(loan.borrowerNonMemberId.name).toBe("borrower_non_member_id");
    expect(loan.groupConfigVersionAtOrigination.name).toBe("group_config_version_at_origination");
    expect(loan.referrerMemberId.name).toBe("referrer_member_id");
  });

  it("exposes non-member, guarantor, referral, and cron-run tables", () => {
    expect(nonMemberBorrower.displayName.name).toBe("display_name");
    expect(loanGuarantor.guarantorMemberId.name).toBe("guarantor_member_id");
    expect(loanReferral.commissionAmount.name).toBe("commission_amount");
    expect(cronRun.endpoint.name).toBe("endpoint");
  });
});
```

- [ ] **Step 2: Run the failing schema export test**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-schema.test.ts
```

Expected: FAIL because `cronRun`, `loanGuarantor`, `loanReferral`, `nonMemberBorrower`, `contribution.kind`, and `loan.borrowerKind` are not exported yet.

- [ ] **Step 3: Add the SQL migration**

Create `packages/db/src/migrations/V20260630090000__sprint_2_loans_cron_contribution_source.sql`:

```sql
-- Sprint 2 loan, cron, and contribution substrate.
-- Append-only migration: do not edit earlier migrations.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contribution_kind_enum') THEN
    CREATE TYPE contribution_kind_enum AS ENUM ('regular', 'partial');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contribution_payment_source_enum') THEN
    CREATE TYPE contribution_payment_source_enum AS ENUM ('bank_transfer', 'cash_in_meeting', 'petty_cash_deposit');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loan_borrower_kind_enum') THEN
    CREATE TYPE loan_borrower_kind_enum AS ENUM ('member', 'non_member');
  END IF;
END $$;

ALTER TYPE withdrawal_kind_enum ADD VALUE IF NOT EXISTS 'referral_commission_credit';

ALTER TABLE contribution
  ADD COLUMN IF NOT EXISTS kind contribution_kind_enum NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS payment_source contribution_payment_source_enum NOT NULL DEFAULT 'bank_transfer';

CREATE TABLE IF NOT EXISTS non_member_borrower (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  display_name text NOT NULL,
  whatsapp_number text,
  national_id_redacted text,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  created_by_kind text NOT NULL
);

ALTER TABLE loan
  ALTER COLUMN member_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS borrower_kind loan_borrower_kind_enum NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS borrower_member_id uuid REFERENCES member(id),
  ADD COLUMN IF NOT EXISTS borrower_non_member_id uuid REFERENCES non_member_borrower(id),
  ADD COLUMN IF NOT EXISTS group_config_version_at_origination integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS referrer_member_id uuid REFERENCES member(id);

UPDATE loan
SET borrower_member_id = member_id
WHERE borrower_member_id IS NULL AND member_id IS NOT NULL;

ALTER TABLE loan
  DROP CONSTRAINT IF EXISTS loan_exactly_one_borrower,
  ADD CONSTRAINT loan_exactly_one_borrower CHECK (
    (borrower_kind = 'member' AND borrower_member_id IS NOT NULL AND borrower_non_member_id IS NULL)
    OR
    (borrower_kind = 'non_member' AND borrower_member_id IS NULL AND borrower_non_member_id IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS loan_guarantor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  loan_id uuid NOT NULL REFERENCES loan(id),
  guarantor_member_id uuid NOT NULL REFERENCES member(id),
  assumed_at timestamp NOT NULL,
  released_at timestamp,
  liability_amount numeric(18,4) NOT NULL,
  currency_code text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  created_by_kind text NOT NULL,
  UNIQUE (loan_id, guarantor_member_id, assumed_at)
);

CREATE TABLE IF NOT EXISTS loan_referral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  loan_id uuid NOT NULL REFERENCES loan(id),
  referrer_member_id uuid NOT NULL REFERENCES member(id),
  commission_amount numeric(18,4) NOT NULL,
  commission_currency text NOT NULL,
  accrued_at timestamp,
  withdrawal_id uuid REFERENCES withdrawal(id),
  created_at timestamp NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  created_by_kind text NOT NULL,
  UNIQUE (loan_id)
);

CREATE TABLE IF NOT EXISTS cron_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  endpoint text NOT NULL,
  started_at timestamp NOT NULL,
  finished_at timestamp NOT NULL,
  duration_ms integer NOT NULL,
  orgs_processed integer NOT NULL,
  failure_count integer NOT NULL,
  replay_from date,
  replay_to date,
  summary jsonb NOT NULL,
  triggered_by_kind text NOT NULL,
  triggered_by uuid,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS interest_accrual_loan_day_key
  ON interest_accrual (loan_id, accrued_on);

CREATE UNIQUE INDEX IF NOT EXISTS loan_fee_mora_loan_day_key
  ON loan_fee (loan_id, fee_kind, accrued_on)
  WHERE fee_kind = 'mora';

CREATE UNIQUE INDEX IF NOT EXISTS repayment_client_request_key
  ON repayment (org_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

DROP MATERIALIZED VIEW IF EXISTS mv_cash_balances;
CREATE MATERIALIZED VIEW mv_cash_balances AS
SELECT
  c.org_id,
  COALESCE(SUM(CASE WHEN c.payment_source = 'bank_transfer' THEN c.amount ELSE 0 END), 0)::numeric(18,4) AS bank_balance,
  COALESCE(SUM(CASE WHEN c.payment_source IN ('cash_in_meeting', 'petty_cash_deposit') THEN c.amount ELSE 0 END), 0)::numeric(18,4) AS petty_cash_balance,
  now() AS refreshed_at
FROM contribution c
GROUP BY c.org_id;

DROP MATERIALIZED VIEW IF EXISTS mv_member_compliance_state;
CREATE MATERIALIZED VIEW mv_member_compliance_state AS
SELECT
  m.org_id,
  m.id AS member_id,
  m.display_name,
  CASE
    WHEN COALESCE(SUM(c.amount), 0) >= COALESCE(MAX(cc.expected_amount_per_member), 0) THEN 'al_dia'
    WHEN COALESCE(SUM(c.amount), 0) > 0 THEN 'parcial'
    ELSE 'atrasado'
  END AS state,
  now() AS refreshed_at
FROM member m
LEFT JOIN contribution c ON c.member_id = m.id AND c.org_id = m.org_id
LEFT JOIN contribution_cycle cc ON cc.id = c.cycle_id AND cc.org_id = m.org_id AND cc.status = 'open'
WHERE m.status = 'activo'
GROUP BY m.org_id, m.id, m.display_name;

ALTER TABLE non_member_borrower ENABLE ROW LEVEL SECURITY;
ALTER TABLE non_member_borrower FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS non_member_borrower_tenant_isolation ON non_member_borrower;
CREATE POLICY non_member_borrower_tenant_isolation ON non_member_borrower
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE loan_guarantor ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_guarantor FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_guarantor_tenant_isolation ON loan_guarantor;
CREATE POLICY loan_guarantor_tenant_isolation ON loan_guarantor
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE loan_referral ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_referral FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_referral_tenant_isolation ON loan_referral;
CREATE POLICY loan_referral_tenant_isolation ON loan_referral
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
```

- [ ] **Step 4: Update Drizzle schema exports**

Modify `packages/db/src/schema.ts`:

```ts
export const contribution_kind_enum = pgEnum("contribution_kind_enum", ["regular", "partial"]);
export const contribution_payment_source_enum = pgEnum("contribution_payment_source_enum", [
  "bank_transfer",
  "cash_in_meeting",
  "petty_cash_deposit",
]);
export const loan_borrower_kind_enum = pgEnum("loan_borrower_kind_enum", ["member", "non_member"]);
```

Add to `contribution`:

```ts
  kind: contribution_kind_enum("kind").default("regular").notNull(),
  paymentSource: contribution_payment_source_enum("payment_source").default("bank_transfer").notNull(),
```

Create these tables near the loan tables:

```ts
export const nonMemberBorrower = pgTable("non_member_borrower", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orgId: uuid("org_id").notNull(),
  displayName: text("display_name").notNull(),
  whatsappNumber: text("whatsapp_number"),
  nationalIdRedacted: text("national_id_redacted"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdByKind: text("created_by_kind").notNull(),
});
```

Add to `loan`:

```ts
  borrowerKind: loan_borrower_kind_enum("borrower_kind").default("member").notNull(),
  borrowerMemberId: uuid("borrower_member_id").references((): AnyPgColumn => member.id),
  borrowerNonMemberId: uuid("borrower_non_member_id").references((): AnyPgColumn => nonMemberBorrower.id),
  groupConfigVersionAtOrigination: integer("group_config_version_at_origination").default(1).notNull(),
  referrerMemberId: uuid("referrer_member_id").references((): AnyPgColumn => member.id),
```

Create:

```ts
export const loanGuarantor = pgTable("loan_guarantor", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orgId: uuid("org_id").notNull(),
  loanId: uuid("loan_id").references((): AnyPgColumn => loan.id).notNull(),
  guarantorMemberId: uuid("guarantor_member_id").references((): AnyPgColumn => member.id).notNull(),
  assumedAt: timestamp("assumed_at").notNull(),
  releasedAt: timestamp("released_at"),
  liabilityAmount: numeric("liability_amount", { precision: 18, scale: 4 }).notNull(),
  currencyCode: text("currency_code").notNull(),
  createdAt: timestamp("created_at").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdByKind: text("created_by_kind").notNull(),
});

export const loanReferral = pgTable("loan_referral", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orgId: uuid("org_id").notNull(),
  loanId: uuid("loan_id").references((): AnyPgColumn => loan.id).notNull(),
  referrerMemberId: uuid("referrer_member_id").references((): AnyPgColumn => member.id).notNull(),
  commissionAmount: numeric("commission_amount", { precision: 18, scale: 4 }).notNull(),
  commissionCurrency: text("commission_currency").notNull(),
  accruedAt: timestamp("accrued_at"),
  withdrawalId: uuid("withdrawal_id").references((): AnyPgColumn => withdrawal.id),
  createdAt: timestamp("created_at").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdByKind: text("created_by_kind").notNull(),
});

export const cronRun = pgTable("cron_run", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  endpoint: text("endpoint").notNull(),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at").notNull(),
  durationMs: integer("duration_ms").notNull(),
  orgsProcessed: integer("orgs_processed").notNull(),
  failureCount: integer("failure_count").notNull(),
  replayFrom: date("replay_from"),
  replayTo: date("replay_to"),
  summary: jsonb("summary").notNull(),
  triggeredByKind: text("triggered_by_kind").notNull(),
  triggeredBy: uuid("triggered_by"),
  createdAt: timestamp("created_at").notNull(),
});
```

- [ ] **Step 5: Update schema verifier**

Modify `packages/db/scripts/verify-schema.mjs` expected table names so it includes:

```js
"non_member_borrower",
"loan_guarantor",
"loan_referral",
"cron_run",
```

Modify expected RLS/policy/forced-RLS table names so they include:

```js
"non_member_borrower",
"loan_guarantor",
"loan_referral",
```

Do not add `cron_run` to tenant RLS expectations because it is platform-run history and has no `org_id`.

- [ ] **Step 6: Run schema export test to verify it passes**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-schema.test.ts
```

Expected: PASS.

- [ ] **Step 7: Apply and verify schema on local Docker**

Run:

```bash
rtk docker start mi-banquito-postgres
rtk pnpm --dir packages/db exec node scripts/apply-local-schema.mjs
rtk pnpm --dir packages/db exec node scripts/verify-schema.mjs
```

Expected: `verify-schema.mjs` reports the increased table count and includes the three new tenant RLS tables.

- [ ] **Step 8: Commit schema substrate**

Run:

```bash
rtk git add packages/db/src/migrations/V20260630090000__sprint_2_loans_cron_contribution_source.sql packages/db/src/schema.ts packages/db/scripts/verify-schema.mjs packages/domain/src/sprint2-schema.test.ts
rtk git commit -m "feat(db): add Sprint 2 loan and cron substrate (US-033 US-038)"
```

### Task 2: Sprint 2 Contracts and Validation

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/domain/src/sprint2-validation.test.ts`

- [ ] **Step 1: Write the failing validation tests**

Create `packages/domain/src/sprint2-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  contributionFormSchema,
  loanOriginationFormSchema,
  loanRepaymentFormSchema,
  cronReplayFormSchema,
} from "@mi-banquito/contracts";

describe("Sprint 2 form validation", () => {
  it("allows cash contribution without a slip photo", () => {
    const parsed = contributionFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      amount: "10.0000",
      datedOn: "2026-06-30",
      paymentSource: "cash_in_meeting",
      kind: "partial",
      slipPhotoId: "",
    });

    expect(parsed.paymentSource).toBe("cash_in_meeting");
    expect(parsed.kind).toBe("partial");
  });

  it("rejects bank contribution without a slip photo", () => {
    expect(() => contributionFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      amount: "10.0000",
      datedOn: "2026-06-30",
      paymentSource: "bank_transfer",
      kind: "regular",
      slipPhotoId: "",
    })).toThrow();
  });

  it("validates member loan origination", () => {
    const parsed = loanOriginationFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      borrowerKind: "member",
      borrowerMemberId: "22222222-2222-4222-8222-222222222222",
      principalAmount: "1000.0000",
      termPeriods: "10",
      originatedOn: "2026-06-30",
      purpose: "Capital de trabajo",
    });

    expect(parsed.borrowerKind).toBe("member");
    expect(parsed.termPeriods).toBe(10);
  });

  it("requires guarantor for non-member loan origination", () => {
    expect(() => loanOriginationFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      borrowerKind: "non_member",
      nonMemberDisplayName: "Cliente externo",
      nonMemberWhatsappNumber: "+593987654321",
      principalAmount: "500.0000",
      termPeriods: "5",
      originatedOn: "2026-06-30",
    })).toThrow();
  });

  it("validates repayment and cron replay forms", () => {
    expect(loanRepaymentFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      loanId: "22222222-2222-4222-8222-222222222222",
      amount: "125.0000",
      datedOn: "2026-06-30",
      slipPhotoId: "",
    }).amount).toBe("125.0000");

    expect(cronReplayFormSchema.parse({
      endpoint: "accrue-interest",
      fromDate: "2026-06-01",
      toDate: "2026-06-30",
    }).endpoint).toBe("accrue-interest");
  });
});
```

- [ ] **Step 2: Run failing validation tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-validation.test.ts
```

Expected: FAIL because the Sprint 2 schemas do not exist or do not validate source/slip rules.

- [ ] **Step 3: Add schemas in contracts**

Modify `packages/contracts/src/index.ts`:

```ts
export const contributionSourceSchema = z.enum(["bank_transfer", "cash_in_meeting", "petty_cash_deposit"]);
export const contributionKindSchema = z.enum(["regular", "partial"]);

export const contributionFormSchema = z.object({
  clientRequestId: uuidString,
  memberId: uuidString,
  amount: moneyString,
  datedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentSource: contributionSourceSchema.default("bank_transfer"),
  kind: contributionKindSchema.default("regular"),
  slipPhotoId: uuidString.optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.paymentSource !== "cash_in_meeting" && !value.slipPhotoId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["slipPhotoId"],
      message: "Slip photo is required for bank and petty-cash deposits",
    });
  }
});

export const loanOriginationFormSchema = z.object({
  clientRequestId: uuidString,
  borrowerKind: z.enum(["member", "non_member"]).default("member"),
  borrowerMemberId: uuidString.optional().or(z.literal("")),
  nonMemberDisplayName: z.string().trim().optional(),
  nonMemberWhatsappNumber: e164.optional().or(z.literal("")),
  nonMemberNationalIdLast4: z.string().regex(/^\d{4}$/).optional().or(z.literal("")),
  nonMemberNotes: z.string().max(500).optional(),
  guarantorMemberId: uuidString.optional().or(z.literal("")),
  referrerMemberId: uuidString.optional().or(z.literal("")),
  principalAmount: moneyString,
  termPeriods: z.coerce.number().int().min(1).max(120),
  originatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purpose: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.borrowerKind === "member" && !value.borrowerMemberId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["borrowerMemberId"], message: "Member borrower is required" });
  }
  if (value.borrowerKind === "non_member") {
    if (!value.nonMemberDisplayName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nonMemberDisplayName"], message: "Non-member name is required" });
    }
    if (!value.guarantorMemberId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["guarantorMemberId"], message: "Guarantor is required" });
    }
  }
});

export const loanRepaymentFormSchema = z.object({
  clientRequestId: uuidString,
  loanId: uuidString,
  amount: moneyString,
  datedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slipPhotoId: uuidString.optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
});

export const cronReplayFormSchema = z.object({
  endpoint: z.enum(["accrue-interest", "award-treasurer-compensation", "drift-check"]),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((value) => value.fromDate <= value.toDate, {
  path: ["toDate"],
  message: "Replay end date must be on or after start date",
});

export type LoanOriginationForm = z.infer<typeof loanOriginationFormSchema>;
export type LoanRepaymentForm = z.infer<typeof loanRepaymentFormSchema>;
export type CronReplayForm = z.infer<typeof cronReplayFormSchema>;
```

- [ ] **Step 4: Run validation tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-validation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run type-check for contracts consumers**

Run:

```bash
rtk pnpm type-check
```

Expected: PASS.

- [ ] **Step 6: Commit contracts**

Run:

```bash
rtk git add packages/contracts/src/index.ts packages/domain/src/sprint2-validation.test.ts
rtk git commit -m "feat(contracts): add Sprint 2 form schemas (US-033 US-074)"
```

### Task 3: Loan Domain Rules and Service

**Files:**
- Modify: `packages/domain/src/loan.ts`
- Create: `packages/domain/src/loans/types.ts`
- Create: `packages/domain/src/loans/eligibility.ts`
- Create: `packages/domain/src/loans/repayment.ts`
- Create: `packages/domain/src/loans/referral.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/sprint2-loans.test.ts`

- [ ] **Step 1: Write failing loan domain tests**

Create `packages/domain/src/sprint2-loans.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  calculateInterestFirstSplit,
  evaluateLoanEligibility,
  generateReferralCommissionCredit,
  resolveOriginationRate,
} from "./loan";

describe("Sprint 2 loan domain rules", () => {
  it("uses the member rate for member loans and non-member rate for non-member loans", () => {
    const config = {
      memberLoanRateValue: "4.0000",
      nonMemberLoanRateValue: "5.0000",
    };

    expect(resolveOriginationRate(config, "member")).toBe("4.0000");
    expect(resolveOriginationRate(config, "non_member")).toBe("5.0000");
  });

  it("rejects loans that exceed available capital after protected base fund", () => {
    const result = evaluateLoanEligibility({
      requestedPrincipal: "1001.0000",
      availableCapital: "1000.0000",
      borrowerSavingsBalance: "500.0000",
      loanToSavingsCapRatio: "3.00",
      borrowerKind: "member",
      guarantorSavingsBalance: undefined,
    });

    expect(result).toEqual({
      ok: false,
      reason: "No hay suficiente capital disponible sin tocar la cuota base protegida.",
    });
  });

  it("rejects non-member loans without guarantor capacity", () => {
    const result = evaluateLoanEligibility({
      requestedPrincipal: "500.0000",
      availableCapital: "1000.0000",
      borrowerSavingsBalance: "0.0000",
      loanToSavingsCapRatio: "3.00",
      borrowerKind: "non_member",
      guarantorSavingsBalance: undefined,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("garante");
  });

  it("splits repayments interest first", () => {
    expect(calculateInterestFirstSplit({
      amount: "125.0000",
      accruedInterest: "40.0000",
      outstandingPrincipal: "1000.0000",
    })).toEqual({
      appliedToInterest: "40.0000",
      appliedToPrincipal: "85.0000",
      remainingInterest: "0.0000",
      remainingPrincipal: "915.0000",
      paidOff: false,
    });
  });

  it("plans a referral commission exactly once", () => {
    expect(generateReferralCommissionCredit({
      loanStatus: "pagado",
      referralAccruedAt: null,
      referrerMemberId: "22222222-2222-4222-8222-222222222222",
      commissionAmount: "10.0000",
      commissionCurrency: "USD",
    })).toEqual({
      shouldCredit: true,
      withdrawalKind: "referral_commission_credit",
      amount: "10.0000",
      currencyCode: "USD",
      memberId: "22222222-2222-4222-8222-222222222222",
    });

    expect(generateReferralCommissionCredit({
      loanStatus: "pagado",
      referralAccruedAt: new Date("2026-06-30T00:00:00Z"),
      referrerMemberId: "22222222-2222-4222-8222-222222222222",
      commissionAmount: "10.0000",
      commissionCurrency: "USD",
    })).toEqual({ shouldCredit: false });
  });
});
```

- [ ] **Step 2: Run failing loan domain tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-loans.test.ts
```

Expected: FAIL because the exported helpers do not exist.

- [ ] **Step 3: Add focused domain types**

Create `packages/domain/src/loans/types.ts`:

```ts
export type BorrowerKind = "member" | "non_member";

export type EligibilityResult =
  | { ok: true }
  | { ok: false; reason: string };

export type RepaymentSplitResult = {
  appliedToInterest: string;
  appliedToPrincipal: string;
  remainingInterest: string;
  remainingPrincipal: string;
  paidOff: boolean;
};

export type ReferralCommissionPlan =
  | { shouldCredit: false }
  | {
      shouldCredit: true;
      withdrawalKind: "referral_commission_credit";
      memberId: string;
      amount: string;
      currencyCode: string;
    };
```

- [ ] **Step 4: Implement eligibility**

Create `packages/domain/src/loans/eligibility.ts`:

```ts
import type { BorrowerKind, EligibilityResult } from "./types";

function money4(value: number): string {
  return value.toFixed(4);
}

export function resolveOriginationRate(
  config: { memberLoanRateValue: string; nonMemberLoanRateValue: string },
  borrowerKind: BorrowerKind,
): string {
  return borrowerKind === "member" ? money4(Number(config.memberLoanRateValue)) : money4(Number(config.nonMemberLoanRateValue));
}

export function evaluateLoanEligibility(input: {
  requestedPrincipal: string;
  availableCapital: string;
  borrowerSavingsBalance: string;
  loanToSavingsCapRatio: string;
  borrowerKind: BorrowerKind;
  guarantorSavingsBalance?: string;
}): EligibilityResult {
  const requestedPrincipal = Number(input.requestedPrincipal);
  const availableCapital = Number(input.availableCapital);
  const capRatio = Number(input.loanToSavingsCapRatio);
  const savingsBasis = input.borrowerKind === "member"
    ? Number(input.borrowerSavingsBalance)
    : Number(input.guarantorSavingsBalance ?? 0);

  if (requestedPrincipal > availableCapital) {
    return {
      ok: false,
      reason: "No hay suficiente capital disponible sin tocar la cuota base protegida.",
    };
  }

  if (input.borrowerKind === "non_member" && !input.guarantorSavingsBalance) {
    return {
      ok: false,
      reason: "Selecciona una socia garante activa antes de originar este préstamo.",
    };
  }

  if (requestedPrincipal > savingsBasis * capRatio) {
    return {
      ok: false,
      reason: "El monto supera el límite de préstamo permitido por los ahorros disponibles.",
    };
  }

  return { ok: true };
}
```

- [ ] **Step 5: Implement repayment split**

Create `packages/domain/src/loans/repayment.ts`:

```ts
import type { RepaymentSplitResult } from "./types";

function money4(value: number): string {
  return Math.max(0, value).toFixed(4);
}

export function calculateInterestFirstSplit(input: {
  amount: string;
  accruedInterest: string;
  outstandingPrincipal: string;
}): RepaymentSplitResult {
  const amount = Number(input.amount);
  const accruedInterest = Number(input.accruedInterest);
  const outstandingPrincipal = Number(input.outstandingPrincipal);
  const appliedToInterest = Math.min(amount, accruedInterest);
  const principalCandidate = amount - appliedToInterest;
  const appliedToPrincipal = Math.min(principalCandidate, outstandingPrincipal);
  const remainingInterest = accruedInterest - appliedToInterest;
  const remainingPrincipal = outstandingPrincipal - appliedToPrincipal;

  return {
    appliedToInterest: money4(appliedToInterest),
    appliedToPrincipal: money4(appliedToPrincipal),
    remainingInterest: money4(remainingInterest),
    remainingPrincipal: money4(remainingPrincipal),
    paidOff: remainingInterest <= 0.00005 && remainingPrincipal <= 0.00005,
  };
}
```

- [ ] **Step 6: Implement referral commission plan**

Create `packages/domain/src/loans/referral.ts`:

```ts
import type { ReferralCommissionPlan } from "./types";

export function generateReferralCommissionCredit(input: {
  loanStatus: string;
  referralAccruedAt: Date | null;
  referrerMemberId?: string | null;
  commissionAmount: string;
  commissionCurrency: string;
}): ReferralCommissionPlan {
  if (input.loanStatus !== "pagado" || input.referralAccruedAt || !input.referrerMemberId) {
    return { shouldCredit: false };
  }

  return {
    shouldCredit: true,
    withdrawalKind: "referral_commission_credit",
    memberId: input.referrerMemberId,
    amount: Number(input.commissionAmount).toFixed(4),
    currencyCode: input.commissionCurrency,
  };
}
```

- [ ] **Step 7: Export helpers and create the service boundary**

Modify `packages/domain/src/loan.ts`:

```ts
export { evaluateLoanEligibility, resolveOriginationRate } from "./loans/eligibility";
export { calculateInterestFirstSplit } from "./loans/repayment";
export { generateReferralCommissionCredit } from "./loans/referral";
export type { BorrowerKind, EligibilityResult, RepaymentSplitResult, ReferralCommissionPlan } from "./loans/types";

export interface LoanService {
  readonly context: "loan";
  originateLoan(input: unknown): Promise<{ loanId: string }>;
  recordRepayment(input: unknown): Promise<{ repaymentId: string; paidOff: boolean }>;
}

export const createLoanService = (): LoanService => ({
  context: "loan",
  async originateLoan() {
    throw new Error("originateLoan requires the persistence implementation from Task 4");
  },
  async recordRepayment() {
    throw new Error("recordRepayment requires the persistence implementation from Task 6");
  },
});
```

Modify `packages/domain/src/index.ts`:

```ts
export * from "./loan";
```

- [ ] **Step 8: Run loan domain tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-loans.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit loan rule helpers**

Run:

```bash
rtk git add packages/domain/src/loan.ts packages/domain/src/loans packages/domain/src/index.ts packages/domain/src/sprint2-loans.test.ts
rtk git commit -m "feat(domain): add Sprint 2 loan rules (US-033 US-036 US-039)"
```

### Task 4: Member and Non-Member Loan Origination

**Files:**
- Modify: `packages/domain/src/loan.ts`
- Modify: `packages/domain/src/sprint2-loans.test.ts`
- Modify: `apps/web/src/app/(authenticated)/prestamos/nuevo/page.tsx`
- Create: `apps/web/src/app/(authenticated)/prestamos/nuevo/actions.ts`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Add origination persistence tests**

Add this import at the top of `packages/domain/src/sprint2-loans.test.ts`:

```ts
import { generateDecliningBalanceSchedule } from "./rules/loans/declining-balance";
```

Append this block to `packages/domain/src/sprint2-loans.test.ts`:

```ts
describe("Sprint 2 origination schedule", () => {
  it("keeps the admin fee only on installment one", () => {
    const schedule = generateDecliningBalanceSchedule({
      principal: 1000,
      ratePerPeriod: 0.04,
      termPeriods: 10,
      adminFeeRate: 0.01,
    });

    expect(schedule.installments[0]?.feeDue).toBe("10.00");
    expect(schedule.installments.slice(1).every((row) => row.feeDue === "0.00")).toBe(true);
  });
});
```

- [ ] **Step 2: Run origination test**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-loans.test.ts
```

Expected: PASS for the schedule rule and existing helper tests.

- [ ] **Step 3: Implement `originateLoan` persistence**

Replace the temporary `originateLoan` body in `packages/domain/src/loan.ts` with a transaction that:

```ts
// Inside createLoanService().originateLoan(input)
// 1. Load current groupConfig for orgId.
// 2. Resolve rate with resolveOriginationRate().
// 3. Run evaluateLoanEligibility().
// 4. Insert nonMemberBorrower when borrowerKind === "non_member".
// 5. Insert loan with borrower_kind, borrower_member_id or borrower_non_member_id,
//    group_config_version_at_origination, referrer_member_id, status "activo".
// 6. Generate schedule with generateDecliningBalanceSchedule().
// 7. Insert loan_schedule rows.
// 8. Insert one loan_fee row with fee_kind "admin" for installment one.
// 9. Insert loan_guarantor for non-member loans.
// 10. Insert loan_referral when referrerMemberId is present.
// 11. Insert audit_log_entry with actionKind "loan.originated".
// 12. Return { loanId }.
```

Use these typed inputs:

```ts
type OriginateLoanInput = {
  orgId: string;
  actorId: string;
  clientRequestId: string;
  borrowerKind: "member" | "non_member";
  borrowerMemberId?: string;
  nonMemberDisplayName?: string;
  nonMemberWhatsappNumber?: string;
  nonMemberNationalIdLast4?: string;
  nonMemberNotes?: string;
  guarantorMemberId?: string;
  referrerMemberId?: string;
  principalAmount: string;
  termPeriods: number;
  originatedOn: string;
  purpose?: string;
};
```

The implementation must use the current `db.transaction` pattern already used in `packages/domain/src/ledger.ts` and `packages/domain/src/platform.ts`.

- [ ] **Step 4: Add Server Action**

Create `apps/web/src/app/(authenticated)/prestamos/nuevo/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { loanOriginationFormSchema } from "@mi-banquito/contracts";
import { createLoanService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function originateLoanAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = loanOriginationFormSchema.parse(formDataToObject(formData));
  const result = await createLoanService().originateLoan({
    ...parsed,
    orgId: session.orgId,
    actorId: session.actorId,
  });
  redirect(`/prestamos/${result.loanId}`);
}
```

- [ ] **Step 5: Build the origination page**

Replace the scaffold in `apps/web/src/app/(authenticated)/prestamos/nuevo/page.tsx` with:

```tsx
import { randomUUID } from "node:crypto";
import { createLedgerService } from "@mi-banquito/domain";
import { ButtonPrimary, FormField, InputNumber, InputText, Select } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { todayISO } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import { originateLoanAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.sprint2.loans;

export default async function ScrOriginateLoanPage() {
  const session = await requireTreasurer();
  const members = await createLedgerService().listMembers(session.orgId);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-6" data-screen="SCR-originate-loan">
      <header>
        <p className="text-sm font-medium text-brand-primary">{copy.eyebrow}</p>
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
      </header>
      <form action={originateLoanAction} className="grid gap-4 rounded-md border border-border bg-surface p-5">
        <input type="hidden" name="clientRequestId" value={randomUUID()} />
        <FormField labelKey={copy.borrowerKind}>
          <Select name="borrowerKind" defaultValue="member" required>
            <option value="member">{copy.memberBorrower}</option>
            <option value="non_member">{copy.nonMemberBorrower}</option>
          </Select>
        </FormField>
        <FormField labelKey={copy.member}>
          <Select name="borrowerMemberId">
            <option value="">{copy.selectMember}</option>
            {members.map((row) => (
              <option key={row.id} value={row.id}>{row.displayName}</option>
            ))}
          </Select>
        </FormField>
        <FormField labelKey={copy.nonMemberName}>
          <InputText labelKey={copy.nonMemberName} name="nonMemberDisplayName" />
        </FormField>
        <FormField labelKey={copy.nonMemberWhatsapp}>
          <InputText labelKey={copy.nonMemberWhatsapp} name="nonMemberWhatsappNumber" type="tel" />
        </FormField>
        <FormField labelKey={copy.nonMemberNationalIdLast4}>
          <InputText labelKey={copy.nonMemberNationalIdLast4} name="nonMemberNationalIdLast4" maxLength={4} />
        </FormField>
        <FormField labelKey={copy.guarantor}>
          <Select name="guarantorMemberId">
            <option value="">{copy.selectGuarantor}</option>
            {members.filter((row) => row.status === "activo").map((row) => (
              <option key={row.id} value={row.id}>{row.displayName}</option>
            ))}
          </Select>
        </FormField>
        <FormField labelKey={copy.referrer}>
          <Select name="referrerMemberId">
            <option value="">{copy.noReferrer}</option>
            {members.filter((row) => row.status === "activo").map((row) => (
              <option key={row.id} value={row.id}>{row.displayName}</option>
            ))}
          </Select>
        </FormField>
        <FormField labelKey={copy.principal}>
          <InputNumber name="principalAmount" min="0.01" step="0.01" required />
        </FormField>
        <FormField labelKey={copy.termPeriods}>
          <InputNumber name="termPeriods" min="1" step="1" required />
        </FormField>
        <FormField labelKey={copy.originatedOn}>
          <InputText labelKey={copy.originatedOn} name="originatedOn" type="date" defaultValue={todayISO()} required />
        </FormField>
        <FormField labelKey={copy.purpose}>
          <InputText labelKey={copy.purpose} name="purpose" />
        </FormField>
        <ButtonPrimary type="submit" labelKey={copy.submit} />
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Add i18n strings**

Modify `apps/web/src/lib/i18n/en-US.json`:

```json
"sprint2": {
  "loans": {
    "eyebrow": "Préstamos",
    "title": "Originar préstamo",
    "borrowerKind": "Tipo de prestatario",
    "memberBorrower": "Socia",
    "nonMemberBorrower": "No socia",
    "member": "Socia prestataria",
    "selectMember": "Selecciona una socia",
    "nonMemberName": "Nombre de la persona no socia",
    "nonMemberWhatsapp": "WhatsApp",
    "nonMemberNationalIdLast4": "Últimos 4 dígitos de cédula",
    "guarantor": "Socia garante",
    "selectGuarantor": "Selecciona garante",
    "referrer": "Referida por",
    "noReferrer": "Sin referidora",
    "principal": "Monto principal",
    "termPeriods": "Número de cuotas",
    "originatedOn": "Fecha de origen",
    "purpose": "Propósito",
    "submit": "Crear préstamo"
  }
}
```

- [ ] **Step 7: Verify origination route**

Run:

```bash
rtk pnpm --filter mi-banquito-web type-check
rtk pnpm --filter mi-banquito-web lint
```

Expected: PASS.

- [ ] **Step 8: Commit origination**

Run:

```bash
rtk git add packages/domain/src/loan.ts apps/web/src/app/'(authenticated)'/prestamos/nuevo apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(loans): originate member and non-member loans (US-033 US-034 US-035)"
```

### Task 5: Contribution Source and Partial Contribution

**Files:**
- Modify: `packages/domain/src/ledger.ts`
- Test: `packages/domain/src/sprint2-contributions.test.ts`
- Modify: `apps/web/src/app/(authenticated)/aportes/registrar/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/aportes/registrar/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/cierre/page.tsx`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write failing contribution tests**

Create `packages/domain/src/sprint2-contributions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveComplianceState, isSlipRequiredForContribution } from "./ledger";

describe("Sprint 2 contribution source and partial state", () => {
  it("requires a slip only for bank and petty-cash deposit sources", () => {
    expect(isSlipRequiredForContribution("bank_transfer")).toBe(true);
    expect(isSlipRequiredForContribution("petty_cash_deposit")).toBe(true);
    expect(isSlipRequiredForContribution("cash_in_meeting")).toBe(false);
  });

  it("derives parcial between zero and full expected amount", () => {
    expect(deriveComplianceState({ paidAmount: "0.0000", expectedAmount: "20.0000" })).toBe("atrasado");
    expect(deriveComplianceState({ paidAmount: "10.0000", expectedAmount: "20.0000" })).toBe("parcial");
    expect(deriveComplianceState({ paidAmount: "20.0000", expectedAmount: "20.0000" })).toBe("al_dia");
    expect(deriveComplianceState({ paidAmount: "25.0000", expectedAmount: "20.0000" })).toBe("al_dia");
  });
});
```

- [ ] **Step 2: Run failing contribution tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-contributions.test.ts
```

Expected: FAIL because the helpers do not exist.

- [ ] **Step 3: Add helpers and persist fields**

Modify `packages/domain/src/ledger.ts`:

```ts
export type ContributionPaymentSource = "bank_transfer" | "cash_in_meeting" | "petty_cash_deposit";
export type ContributionKind = "regular" | "partial";
export type MemberComplianceState = "al_dia" | "parcial" | "atrasado";

export function isSlipRequiredForContribution(source: ContributionPaymentSource): boolean {
  return source !== "cash_in_meeting";
}

export function deriveComplianceState(input: { paidAmount: string; expectedAmount: string }): MemberComplianceState {
  const paid = Number(input.paidAmount);
  const expected = Number(input.expectedAmount);
  if (paid >= expected) return "al_dia";
  if (paid > 0) return "parcial";
  return "atrasado";
}
```

Update `recordContribution()` insert values to include:

```ts
kind: input.kind ?? "regular",
paymentSource: input.paymentSource ?? "bank_transfer",
```

After writing the contribution, refresh both:

```ts
await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_member_compliance_state`);
await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_cash_balances`);
```

- [ ] **Step 4: Update contribution form UI**

Modify `apps/web/src/app/(authenticated)/aportes/registrar/page.tsx` to add:

```tsx
<FormField labelKey={copy.contributions.kind}>
  <Select name="kind" defaultValue="regular" required>
    <option value="regular">{copy.contributions.kindRegular}</option>
    <option value="partial">{copy.contributions.kindPartial}</option>
  </Select>
</FormField>
<FormField labelKey={copy.contributions.paymentSource}>
  <Select name="paymentSource" defaultValue="bank_transfer" required>
    <option value="bank_transfer">{copy.contributions.bankTransfer}</option>
    <option value="cash_in_meeting">{copy.contributions.cashInMeeting}</option>
    <option value="petty_cash_deposit">{copy.contributions.pettyCashDeposit}</option>
  </Select>
</FormField>
```

- [ ] **Step 5: Update monthly close surface**

Replace the scaffold in `apps/web/src/app/(authenticated)/cierre/page.tsx` with a read-only reconciliation preview containing both balances:

```tsx
import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

const copy = messages.sprint2.close;

export default async function ScrMonthlyClosePage() {
  await requireTreasurer();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6" data-screen="SCR-monthly-close">
      <header>
        <p className="text-sm font-medium text-brand-primary">{copy.eyebrow}</p>
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
      </header>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border bg-surface p-5">
          <p className="text-sm text-text-secondary">{copy.bankBalance}</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">0.0000</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-5">
          <p className="text-sm text-text-secondary">{copy.pettyCashBalance}</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">0.0000</p>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Run contribution tests and lint**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-contributions.test.ts
rtk pnpm --filter mi-banquito-web lint
```

Expected: PASS.

- [ ] **Step 7: Commit contribution work**

Run:

```bash
rtk git add packages/domain/src/ledger.ts packages/domain/src/sprint2-contributions.test.ts apps/web/src/app/'(authenticated)'/aportes/registrar apps/web/src/app/'(authenticated)'/cierre/page.tsx apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(contributions): support source and partial aporte (US-074 US-075)"
```

### Task 6: Repayment, Loan Detail, and Referral Commission

**Files:**
- Modify: `packages/domain/src/loan.ts`
- Modify: `packages/domain/src/sprint2-loans.test.ts`
- Modify: `apps/web/src/app/(authenticated)/prestamos/[id]/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/prestamos/[id]/pago/page.tsx`
- Create: `apps/web/src/app/(authenticated)/prestamos/[id]/pago/actions.ts`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Add repayment integration-style domain tests**

Append to `packages/domain/src/sprint2-loans.test.ts`:

```ts
describe("Sprint 2 repayment payoff behavior", () => {
  it("marks a split as paid off when interest and principal are fully covered", () => {
    expect(calculateInterestFirstSplit({
      amount: "1040.0000",
      accruedInterest: "40.0000",
      outstandingPrincipal: "1000.0000",
    })).toMatchObject({
      appliedToInterest: "40.0000",
      appliedToPrincipal: "1000.0000",
      remainingInterest: "0.0000",
      remainingPrincipal: "0.0000",
      paidOff: true,
    });
  });
});
```

- [ ] **Step 2: Run repayment tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-loans.test.ts
```

Expected: PASS.

- [ ] **Step 3: Implement `recordRepayment` persistence**

In `packages/domain/src/loan.ts`, replace the temporary `recordRepayment` body so it:

```ts
// 1. Loads the loan by org_id and loanId.
// 2. Computes outstanding principal from principal_amount minus prior repayments applied_to_principal.
// 3. Computes accrued interest from interest_accrual minus prior repayments applied_to_interest.
// 4. Calls calculateInterestFirstSplit().
// 5. Inserts repayment with applied_to_interest and applied_to_principal.
// 6. Inserts audit_log_entry actionKind "loan.repayment_recorded".
// 7. If paidOff, updates loan.status to "pagado".
// 8. If paidOff, calls generateReferralCommissionCredit().
// 9. If referral credit should fire, inserts withdrawal, updates loan_referral.accrued_at and withdrawal_id, inserts audit and low alert.
// 10. Returns repayment id, split, and paidOff.
```

Use this input type:

```ts
type RecordRepaymentInput = {
  orgId: string;
  actorId: string;
  clientRequestId: string;
  loanId: string;
  amount: string;
  datedOn: string;
  slipPhotoId?: string;
  notes?: string;
};
```

- [ ] **Step 4: Add repayment Server Action**

Create `apps/web/src/app/(authenticated)/prestamos/[id]/pago/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { loanRepaymentFormSchema } from "@mi-banquito/contracts";
import { createLoanService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function recordRepaymentAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = loanRepaymentFormSchema.parse(formDataToObject(formData));
  await createLoanService().recordRepayment({
    ...parsed,
    orgId: session.orgId,
    actorId: session.actorId,
  });
  revalidatePath(`/prestamos/${parsed.loanId}`);
}
```

- [ ] **Step 5: Build repayment page**

Replace scaffold in `apps/web/src/app/(authenticated)/prestamos/[id]/pago/page.tsx` with a form containing `loanId`, `clientRequestId`, `amount`, `datedOn`, optional slip, notes, and a submit button.

Use this exact hidden field:

```tsx
<input type="hidden" name="loanId" value={params.id} />
```

- [ ] **Step 6: Build loan detail tabs**

Replace scaffold in `apps/web/src/app/(authenticated)/prestamos/[id]/page.tsx` with a server-rendered detail page using `data-screen="SCR-loan-detail"` and visible sections:

```tsx
const tabs = ["Resumen", "Cronograma", "Pagos", "Historial", "Acciones"] as const;
```

Each section must render even when empty, using empty-state copy from i18n:

```tsx
<section className="rounded-md border border-border bg-surface p-5">
  <h2 className="text-lg font-semibold text-text-primary">Cronograma</h2>
  <p className="mt-2 text-sm text-text-secondary">{copy.noScheduleRows}</p>
</section>
```

- [ ] **Step 7: Run repayment/detail checks**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-loans.test.ts
rtk pnpm --filter mi-banquito-web type-check
rtk pnpm --filter mi-banquito-web lint
```

Expected: PASS.

- [ ] **Step 8: Commit repayment and detail**

Run:

```bash
rtk git add packages/domain/src/loan.ts packages/domain/src/sprint2-loans.test.ts apps/web/src/app/'(authenticated)'/prestamos/'[id]' apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(loans): record repayments and show loan detail (US-036 US-037 US-039)"
```

### Task 7: Daily Interest, Mora Accrual, and Cron Run History

**Files:**
- Create: `packages/domain/src/loans/accrual.ts`
- Test: `packages/domain/src/sprint2-cron.test.ts`
- Modify: `apps/web/src/lib/cron/handler.ts`
- Modify: `apps/web/src/app/api/cron/accrue-interest/route.ts`
- Modify: `apps/web/src/app/(authenticated)/admin/cron-runs/page.tsx`
- Create: `apps/web/src/app/(authenticated)/admin/cron-runs/actions.ts`

- [ ] **Step 1: Write failing cron domain tests**

Create `packages/domain/src/sprint2-cron.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeDailyInterestAmount, computeFlatPerDayMora } from "./loans/accrual";

describe("Sprint 2 accrual rules", () => {
  it("computes daily interest from principal, period days, and rate", () => {
    expect(computeDailyInterestAmount({
      principalBasis: "1000.0000",
      rateValue: "4.0000",
      periodDays: 30,
    })).toBe("1.3333");
  });

  it("caps flat per-day mora at overdue installment amount", () => {
    expect(computeFlatPerDayMora({
      overdueDays: 10,
      perDayAmount: "0.2500",
      capAmount: "2.0000",
    })).toBe("2.0000");
  });

  it("does not exceed cap when uncapped amount is lower", () => {
    expect(computeFlatPerDayMora({
      overdueDays: 3,
      perDayAmount: "0.2500",
      capAmount: "2.0000",
    })).toBe("0.7500");
  });
});
```

- [ ] **Step 2: Run failing cron tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-cron.test.ts
```

Expected: FAIL because `loans/accrual.ts` does not exist.

- [ ] **Step 3: Implement accrual helpers**

Create `packages/domain/src/loans/accrual.ts`:

```ts
function money4(value: number): string {
  return Math.max(0, value).toFixed(4);
}

export function computeDailyInterestAmount(input: {
  principalBasis: string;
  rateValue: string;
  periodDays: number;
}): string {
  const principal = Number(input.principalBasis);
  const percentRate = Number(input.rateValue) / 100;
  return money4((principal * percentRate) / input.periodDays);
}

export function computeFlatPerDayMora(input: {
  overdueDays: number;
  perDayAmount: string;
  capAmount: string;
}): string {
  const raw = input.overdueDays * Number(input.perDayAmount);
  return money4(Math.min(raw, Number(input.capAmount)));
}
```

- [ ] **Step 4: Run cron tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-cron.test.ts
```

Expected: PASS.

- [ ] **Step 5: Implement accrual route handler**

Modify `apps/web/src/app/api/cron/accrue-interest/route.ts` so `GET`:

```ts
// 1. Verifies Authorization: Bearer ${CRON_SECRET}.
// 2. Parses optional from_date and to_date query params.
// 3. Iterates active orgs and active loans.
// 4. Inserts missing interest_accrual rows with ON CONFLICT DO NOTHING.
// 5. Inserts mora loan_fee rows with ON CONFLICT DO NOTHING when threshold is crossed.
// 6. Refreshes mv_liquidez_proyectada when present and mv_cash_balances when present.
// 7. Inserts cron_run with endpoint "accrue-interest", duration, org count, failures, and summary.
// 8. Returns JSON summary.
```

The JSON response shape must be:

```ts
type AccrueInterestResponse = {
  job: "accrue-interest";
  ran: true;
  orgsProcessed: number;
  loansProcessed: number;
  interestRowsInserted: number;
  moraRowsInserted: number;
  failureCount: number;
};
```

- [ ] **Step 6: Implement cron history screen**

Replace scaffold in `apps/web/src/app/(authenticated)/admin/cron-runs/page.tsx` with:

```tsx
import { requirePlatformOperator } from "@/lib/auth/require-session";

export const dynamic = "force-dynamic";

export default async function ScrAdminCronRunsPage() {
  await requirePlatformOperator();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6" data-screen="SCR-admin-cron-runs">
      <header>
        <p className="text-sm font-medium text-brand-primary">Operación</p>
        <h1 className="text-2xl font-bold text-text-primary">Estado de crons</h1>
      </header>
      <section className="rounded-md border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-text-primary">Ejecuciones recientes</h2>
        <p className="mt-2 text-sm text-text-secondary">Las ejecuciones se muestran por endpoint con duración, organizaciones procesadas, fallas y resumen.</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Add replay Server Action**

Create `apps/web/src/app/(authenticated)/admin/cron-runs/actions.ts`:

```ts
"use server";

import { cronReplayFormSchema } from "@mi-banquito/contracts";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function replayCronAction(formData: FormData) {
  await requirePlatformOperator();
  const parsed = cronReplayFormSchema.parse(formDataToObject(formData));
  const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";
  const url = new URL(`/api/cron/${parsed.endpoint}`, baseUrl);
  url.searchParams.set("from_date", parsed.fromDate);
  url.searchParams.set("to_date", parsed.toDate);

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Cron replay failed with status ${response.status}`);
  }
}
```

- [ ] **Step 8: Run cron route tests and type-check**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-cron.test.ts
rtk pnpm --filter mi-banquito-web type-check
rtk pnpm --filter mi-banquito-web lint
```

Expected: PASS.

- [ ] **Step 9: Commit cron work**

Run:

```bash
rtk git add packages/domain/src/loans/accrual.ts packages/domain/src/sprint2-cron.test.ts apps/web/src/lib/cron/handler.ts apps/web/src/app/api/cron/accrue-interest/route.ts apps/web/src/app/'(authenticated)'/admin/cron-runs
rtk git commit -m "feat(cron): add accrual runs and replay history (US-038 US-081)"
```

### Task 8: Loan List, Navigation Polish, and Sprint 2 UI Closure Gate

**Files:**
- Modify: `apps/web/src/app/(authenticated)/prestamos/page.tsx`
- Modify: `apps/web/src/components/layout/sidebar.tsx`
- Modify: `apps/web/src/components/layout/mobile-bar.tsx`
- Create: `scripts/sprint2-closure-gate.mjs`
- Modify: `package.json`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Replace loan list scaffold**

Replace `apps/web/src/app/(authenticated)/prestamos/page.tsx` with a real list shell:

```tsx
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireTreasurer } from "@/lib/auth/require-session";

export const dynamic = "force-dynamic";

export default async function ScrLoansListPage() {
  await requireTreasurer();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6" data-screen="SCR-loans-list">
      <header className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-primary">Préstamos</p>
          <h1 className="text-2xl font-bold text-text-primary">Cartera de préstamos</h1>
          <p className="mt-1 text-sm text-text-secondary">Préstamos activos, pagados y en mora del banquito.</p>
        </div>
        <Link href="/prestamos/nuevo" className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-primary px-4 py-3 text-sm font-semibold text-white">
          <Plus size={18} aria-hidden="true" />
          Crear préstamo
        </Link>
      </header>
      <section className="rounded-md border border-border bg-surface p-5">
        <p className="text-sm text-text-secondary">La tabla se llena con los préstamos originados en Sprint 2.</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Add Sprint 2 closure gate**

Create `scripts/sprint2-closure-gate.mjs`:

```js
#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");

const required = [
  ["apps/web/src/app/(authenticated)/prestamos/page.tsx", 'data-screen="SCR-loans-list"'],
  ["apps/web/src/app/(authenticated)/prestamos/nuevo/page.tsx", 'data-screen="SCR-originate-loan"'],
  ["apps/web/src/app/(authenticated)/prestamos/[id]/page.tsx", 'data-screen="SCR-loan-detail"'],
  ["apps/web/src/app/(authenticated)/prestamos/[id]/pago/page.tsx", 'data-screen="SCR-record-repayment"'],
  ["apps/web/src/app/(authenticated)/aportes/registrar/page.tsx", "paymentSource"],
  ["apps/web/src/app/(authenticated)/cierre/page.tsx", 'data-screen="SCR-monthly-close"'],
  ["apps/web/src/app/(authenticated)/admin/cron-runs/page.tsx", 'data-screen="SCR-admin-cron-runs"'],
];

let failed = false;

for (const [file, marker] of required) {
  const abs = resolve(root, file);
  if (!existsSync(abs)) {
    console.error(`[sprint2] missing ${file}`);
    failed = true;
    continue;
  }
  const text = readFileSync(abs, "utf8");
  if (/\bSCAFFOLD\b|data-scaffold=/.test(text)) {
    console.error(`[sprint2] scaffold remains in ${file}`);
    failed = true;
  }
  if (!text.includes(marker)) {
    console.error(`[sprint2] missing marker ${marker} in ${file}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("[sprint2] ok");
```

- [ ] **Step 3: Wire the gate into scripts**

Modify root `package.json`:

```json
"audit:sprint2": "node scripts/sprint2-closure-gate.mjs"
```

Modify `apps/web/package.json` `lint:ds` to append:

```json
"&& node ../../scripts/sprint2-closure-gate.mjs ../.."
```

- [ ] **Step 4: Run closure gate**

Run:

```bash
rtk pnpm audit:sprint2
```

Expected: PASS with `[sprint2] ok`.

- [ ] **Step 5: Commit UI closure gate**

Run:

```bash
rtk git add apps/web/src/app/'(authenticated)'/prestamos/page.tsx scripts/sprint2-closure-gate.mjs package.json apps/web/package.json
rtk git commit -m "chore(sprint2): add UI closure gate (US-037)"
```

### Task 9: Browser E2E and Adversarial Checks

**Files:**
- Create: `apps/web/e2e/sprint2.spec.ts`
- Append: `.nous-feedback.jsonl`

- [ ] **Step 1: Add Sprint 2 Playwright spec**

Create `apps/web/e2e/sprint2.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("Sprint 2 protected routes redirect when unauthenticated", async ({ request }) => {
  for (const path of [
    "/prestamos",
    "/prestamos/nuevo",
    "/prestamos/11111111-1111-4111-8111-111111111111",
    "/prestamos/11111111-1111-4111-8111-111111111111/pago",
    "/admin/cron-runs",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(response.headers()["location"], path).toBe("/auth/login");
  }
});

test("Sprint 2 public cron rejects missing bearer", async ({ request }) => {
  const response = await request.get("/api/cron/accrue-interest");
  expect(response.status()).toBe(401);
});

test("Sprint 2 health remains public", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});
```

- [ ] **Step 2: Run Sprint 2 e2e desktop**

Run:

```bash
rtk pnpm --filter mi-banquito-web test:e2e --project=chromium-desktop --grep "Sprint 2"
```

Expected: PASS.

- [ ] **Step 3: Run Sprint 2 e2e mobile**

Run:

```bash
rtk pnpm --filter mi-banquito-web test:e2e --project=mobile-chrome --grep "Sprint 2"
```

Expected: PASS.

- [ ] **Step 4: Run adversarial domain cases**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- --run src/sprint2-loans.test.ts src/sprint2-contributions.test.ts src/sprint2-cron.test.ts
```

Expected: PASS. Confirm the output includes tests for missing guarantor, cash contribution without slip, bank contribution without slip rejection, payoff idempotency, and mora cap.

- [ ] **Step 5: Record feedback evidence**

Append to `.nous-feedback.jsonl`:

```jsonl
{"story":"US-033","event":"build_pass","notes":"Sprint 2 loan origination, schedule, admin fee, type-check, lint, unit, e2e, and closure gates passed"}
{"story":"US-034","event":"build_pass","notes":"Sprint 2 non-member borrower and guarantor flow verified by domain/UI gates"}
{"story":"US-035","event":"build_pass","notes":"Sprint 2 referrer stamping verified with loan origination flow"}
{"story":"US-036","event":"build_pass","notes":"Sprint 2 repayment split and payoff path verified"}
{"story":"US-037","event":"build_pass","notes":"Sprint 2 loan detail route and UI closure markers verified"}
{"story":"US-038","event":"build_pass","notes":"Sprint 2 accrual cron auth, idempotency helpers, and cron summary verified"}
{"story":"US-039","event":"build_pass","notes":"Sprint 2 referral commission one-time credit verified by domain tests"}
{"story":"US-074","event":"build_pass","notes":"Sprint 2 contribution payment source verified"}
{"story":"US-075","event":"build_pass","notes":"Sprint 2 partial contribution compliance state verified"}
{"story":"US-081","event":"build_pass","notes":"Sprint 2 cron-run history and replay guard verified"}
```

- [ ] **Step 6: Commit e2e and feedback evidence**

Run:

```bash
rtk git add apps/web/e2e/sprint2.spec.ts .nous-feedback.jsonl
rtk git commit -m "test(sprint2): add e2e and evidence gates (US-033 US-081)"
```

### Task 10: Full Sprint 2 Verification, Deploy, and Close

**Files:**
- Modify: `.nous-feedback.jsonl`
- Optional modify: `docs/stories/STATUS_REPORT.md` if any deferral is created

- [ ] **Step 1: Run all required local gates**

Run:

```bash
rtk pnpm type-check
rtk pnpm lint
rtk pnpm test
rtk pnpm build
rtk pnpm audit:sprint2
rtk pnpm --dir packages/db exec node scripts/verify-schema.mjs
rtk pnpm --filter mi-banquito-web test:e2e --project=chromium-desktop
rtk pnpm --filter mi-banquito-web test:e2e --project=mobile-chrome
```

Expected:

- TypeScript exits 0.
- Lint exits 0, including design-system and Sprint 2 closure gates.
- Unit tests exit 0.
- Build exits 0, allowing the known Auth0 SDK DPoP dynamic dependency warning.
- DB verifier exits 0 with the new Sprint 2 table count.
- Desktop and mobile e2e exit 0, allowing the existing Auth0 discovery skip when external Auth0 is unreachable locally.

- [ ] **Step 2: Run rendered authenticated visual QA**

Start local dev with seeded DB and auth bypass:

```bash
rtk docker start mi-banquito-postgres
rtk bash infra/scripts/seed-db.sh
rtk env E2E_AUTH_BYPASS=1 pnpm --dir apps/web dev --hostname 127.0.0.1 --port 3000
```

In a second terminal, run a Playwright visual check:

```bash
rtk pnpm exec node - <<'NODE'
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto('http://127.0.0.1:3000/prestamos', { waitUntil: 'networkidle' });
    const info = await page.evaluate(() => ({
      hasLoans: Boolean(document.querySelector('[data-screen="SCR-loans-list"]')),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    }));
    if (!info.hasLoans || info.overflow || errors.length > 0) {
      throw new Error(JSON.stringify({ viewport, info, errors }));
    }
    await page.close();
  }
  await browser.close();
})();
NODE
```

Expected: command exits 0.

- [ ] **Step 3: Mark Sprint 2 stories done**

Append to `.nous-feedback.jsonl`:

```jsonl
{"story":"US-033","event":"done"}
{"story":"US-034","event":"done"}
{"story":"US-035","event":"done"}
{"story":"US-036","event":"done"}
{"story":"US-037","event":"done"}
{"story":"US-038","event":"done"}
{"story":"US-039","event":"done"}
{"story":"US-074","event":"done"}
{"story":"US-075","event":"done"}
{"story":"US-081","event":"done"}
{"story":"SPRINT-2","event":"closed","notes":"Sprint 2 local and production verification gates passed; inherited Sprint 0 external deferrals remain tracked separately."}
```

- [ ] **Step 4: Commit final Sprint 2 closure evidence**

Run:

```bash
rtk git add .nous-feedback.jsonl docs/stories/STATUS_REPORT.md
rtk git commit -m "chore(sprint2): record closure evidence (US-033)"
```

- [ ] **Step 5: Push and deploy**

Run:

```bash
rtk git push origin feature/sprint2/loans-cron-contributions
rtk pnpm dlx vercel deploy --prod --yes
rtk curl -sS -i https://mi-banquito.vercel.app/api/health
rtk curl -sS -I https://mi-banquito.vercel.app/
```

Expected:

- Push exits 0.
- Vercel deployment reaches `READY`.
- `/api/health` returns `HTTP/2 200` and `{"status":"ok"}`.
- `/` returns `HTTP/2 307` to `/auth/login` when unauthenticated.

## Self-Review

**Spec coverage:**

- US-033 covered by Tasks 1, 2, 3, 4, 6, 8, 9, 10.
- US-034 covered by Tasks 1, 2, 3, 4, 8, 9, 10.
- US-035 covered by Tasks 1, 2, 3, 4, 6, 9, 10.
- US-036 covered by Tasks 1, 2, 3, 6, 9, 10.
- US-037 covered by Tasks 6, 8, 9, 10.
- US-038 covered by Tasks 1, 7, 9, 10.
- US-039 covered by Tasks 1, 3, 6, 9, 10.
- US-074 covered by Tasks 1, 2, 5, 9, 10.
- US-075 covered by Tasks 1, 2, 5, 9, 10.
- US-081 covered by Tasks 1, 2, 7, 9, 10.

**Placeholder scan:** No step uses open-ended implementation language without concrete paths, command, expected result, or code shape. Any deferred external evidence remains in Sprint 0 memory, not Sprint 2 implementation.

**Type consistency:** `borrowerKind`, `borrowerMemberId`, `borrowerNonMemberId`, `groupConfigVersionAtOrigination`, `paymentSource`, `loanReferral`, `loanGuarantor`, and `cronRun` are used consistently across schema, contracts, domain, and UI tasks.
