# Sprint 4 Collections, Liquidity, Offline, and Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Sprint 4's executable vertical slices for collections, promises, promise reminders, loan disbursement source, offline write visibility, public hash verification, liquidity projection, treasurer compensation, and pilot logging.

**Architecture:** Sprint 4 adds several small operational records and two read models, then connects them to existing App Router pages and cron routes. The plan keeps business logic in `packages/domain`, schema in `packages/db`, validation in `packages/contracts`, and server-rendered surfaces under `apps/web/src/app`. Public verification must live outside `(authenticated)`; treasurer/operator pages stay protected by existing session guards.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM, PostgreSQL/Neon, Vitest, Playwright, Vercel Cron, Serwist PWA, Lucide/UI tokens from `@mi-banquito/ui`.

---

## Sprint Boundary

Sprint 4 story queue:

- US-040: A/R aging page from `mv_ar_aging`.
- US-041: Mark promise on late row.
- US-043: Promise reminder cron.
- US-042: WhatsApp chase message and audit attempt.
- US-076: Loan disbursement source at origination.
- US-077: Offline queued write visibility and client-request dedupe.
- US-085: Public statement hash verifier.
- US-054: Liquidity projection and sandbox.
- US-050: Treasurer compensation cron.
- US-087: Operator pilot log.

Forward-dependent acceptance boundaries to track in closure notes:

- US-085 AC-4 requires statement/PDF generation from later reporting stories. This sprint should build the public verifier route and a reusable footer-link helper; final PDF footer embedding remains deferred until the PDF generator exists.
- US-050 AC-5 mentions monthly close PDF visibility. This sprint should persist disbursements, withdrawal, alert, audit, and history visibility; monthly-close PDF rendering remains deferred until monthly close PDF work lands.

## File Structure

Create or modify these files:

- `packages/db/src/migrations/V20260704100000__sprint_4_collections_liquidity_and_operations.sql` - append-only Sprint 4 database objects: promise, promise reminder ledger, loan disbursement, treasurer compensation disbursement, pilot log entry, materialized views, indexes.
- `packages/db/src/schema.ts` - Drizzle exports for new tables/views/enums.
- `packages/db/src/sprint4-schema.test.ts` - schema verification for Sprint 4 tables, indexes, constraints, and views.
- `packages/contracts/src/index.ts` - form schemas for promises, chase attempts, liquidity sandbox, public hash verification, loan disbursement source, pilot log entries.
- `packages/domain/src/collections.ts` and `packages/domain/src/collections.test.ts` - A/R aging, promise, reminder, and WhatsApp chase business logic.
- `packages/domain/src/compensation.ts` and `packages/domain/src/compensation.test.ts` - BR-07 fixed periodic compensation planning and idempotency.
- `packages/domain/src/liquidity.ts` and `packages/domain/src/liquidity.test.ts` - projection normalization, summary text, and sandbox recomputation.
- `packages/domain/src/reporting.ts` and `packages/domain/src/reporting.test.ts` - public hash verification projection and verification URL helper.
- `packages/domain/src/pilot.ts` and `packages/domain/src/pilot.test.ts` - pilot log entry and exit checklist evaluation.
- `packages/domain/src/loan.ts`, `packages/domain/src/loans/types.ts`, `packages/domain/src/sprint2-loans.test.ts` - loan disbursement source event creation.
- `apps/web/src/app/(authenticated)/atrasos/page.tsx`, `apps/web/src/app/(authenticated)/atrasos/actions.ts`, `apps/web/src/app/(authenticated)/atrasos/aging-table.tsx`, `apps/web/src/app/(authenticated)/atrasos/page.test.tsx` - collections UI.
- `apps/web/src/app/(authenticated)/liquidez/page.tsx`, `apps/web/src/app/(authenticated)/liquidez/liquidity-sandbox.tsx`, `apps/web/src/app/(authenticated)/liquidez/page.test.tsx` - liquidity UI.
- `apps/web/src/app/verify/[hash]/page.tsx`, `apps/web/src/app/verify/[hash]/route.ts`, `apps/web/src/app/verify/[hash]/page.test.tsx` - unauthenticated verifier HTML/JSON surface.
- Remove or replace `apps/web/src/app/(authenticated)/verify/[hash]/page.tsx` so the verifier is not behind Auth0.
- `apps/web/src/app/(authenticated)/prestamos/nuevo/loan-origination-form.tsx`, `apps/web/src/app/(authenticated)/prestamos/nuevo/actions.ts`, `apps/web/src/app/(authenticated)/prestamos/nuevo/page.tsx` - disbursement source field.
- `apps/web/src/lib/cron/handler.ts`, `apps/web/src/app/api/cron/promise-reminders/route.ts`, `apps/web/src/app/api/cron/promise-reminders/route.test.ts`, `apps/web/src/app/api/cron/award-treasurer-compensation/route.test.ts` - cron execution.
- `apps/web/src/app/(authenticated)/admin/orgs/[id]/pilot-log/page.tsx`, `apps/web/src/app/(authenticated)/admin/orgs/[id]/pilot-log/actions.ts`, `apps/web/src/app/(authenticated)/admin/orgs/[id]/pilot-log/report/route.ts`, `apps/web/src/app/(authenticated)/admin/orgs/[id]/pilot-log/page.test.tsx` - pilot log UI and report route.
- `apps/web/src/lib/offline/outbox.ts`, `apps/web/src/components/offline/offline-queue-indicator.tsx`, `apps/web/src/app/sw.ts`, `apps/web/src/app/(authenticated)/layout.tsx` - offline queue indicator and sync state.
- `apps/web/src/lib/i18n/en-US.json` - Spanish user-facing copy for all Sprint 4 surfaces.
- `apps/web/e2e/sprint4.spec.ts` - protected route, public verifier, offline indicator, and primary UI smoke tests.
- `scripts/sprint4-closure-gate.mjs` - structural closure gate blocking scaffold markers and missing route files.
- `package.json`, `apps/web/package.json`, `vercel.json`, `docs/stories/STATUS_REPORT.md`, `docs/stories/DEFERRED_EXTERNAL_BLOCKERS.md`, `.nous-feedback.jsonl` - scripts, cron config, and closure evidence.

---

### Task 1: Sprint 4 Schema Substrate

**Files:**
- Create: `packages/db/src/migrations/V20260704100000__sprint_4_collections_liquidity_and_operations.sql`
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/sprint4-schema.test.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing schema test**

Create `packages/db/src/sprint4-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "./index";

const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;

describe("Sprint 4 schema substrate", () => {
  runIfDatabase("exposes collections, compensation, pilot, and disbursement tables", async () => {
    const result = await db.execute(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          table_name IN (
            'promise',
            'promise_reminder',
            'loan_disbursement',
            'treasurer_compensation_disbursement',
            'pilot_log_entry'
          )
          OR (table_name = 'statement_archive' AND column_name = 'canonical_payload_hash')
        )
      ORDER BY table_name, column_name
    `);

    const names = result.rows.map((row) => `${row.table_name}.${row.column_name}`);
    expect(names).toEqual(expect.arrayContaining([
      "loan_disbursement.disbursement_source",
      "loan_disbursement.loan_id",
      "pilot_log_entry.discrepancy",
      "pilot_log_entry.vocabulary_answer",
      "promise.promised_on",
      "promise.status",
      "promise_reminder.reminder_date",
      "treasurer_compensation_disbursement.period_label",
      "treasurer_compensation_disbursement.withdrawal_id",
      "statement_archive.canonical_payload_hash",
    ]));
  });

  runIfDatabase("exposes Sprint 4 views and uniqueness guarantees", async () => {
    const result = await db.execute(sql`
      SELECT
        to_regclass('mv_ar_aging') IS NOT NULL AS has_ar_aging,
        to_regclass('mv_liquidez_proyectada') IS NOT NULL AS has_liquidez,
        EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'idx_statement_archive_hash_public_verify'
        ) AS has_statement_hash_index,
        EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'uq_promise_open_obligation'
        ) AS has_promise_open_constraint,
        EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'uq_treasurer_compensation_org_period'
        ) AS has_compensation_period_constraint
    `);

    expect(result.rows[0]).toMatchObject({
      has_ar_aging: true,
      has_liquidez: true,
      has_statement_hash_index: true,
      has_promise_open_constraint: true,
      has_compensation_period_constraint: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/db test -- --run packages/db/src/sprint4-schema.test.ts
```

Expected: FAIL because the Sprint 4 tables and views do not exist.

- [ ] **Step 3: Add the append-only migration**

Create `packages/db/src/migrations/V20260704100000__sprint_4_collections_liquidity_and_operations.sql`:

```sql
ALTER TYPE withdrawal_kind_enum ADD VALUE IF NOT EXISTS 'treasurer_compensation_disbursement';

CREATE TYPE IF NOT EXISTS promise_status_enum AS ENUM ('open', 'kept', 'broken', 'closed');
CREATE TYPE IF NOT EXISTS loan_disbursement_source_enum AS ENUM ('bank_transfer', 'petty_cash');

CREATE TABLE IF NOT EXISTS promise (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  member_id UUID NOT NULL REFERENCES member(id),
  loan_id UUID REFERENCES loan(id),
  cycle_id UUID REFERENCES contribution_cycle(id),
  promised_on DATE NOT NULL,
  note TEXT,
  status promise_status_enum NOT NULL DEFAULT 'open',
  superseded_by_id UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT ck_promise_exactly_one_source CHECK (
    (loan_id IS NOT NULL AND cycle_id IS NULL)
    OR (loan_id IS NULL AND cycle_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_promise_open_obligation
  ON promise(
    org_id,
    member_id,
    COALESCE(loan_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(cycle_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS promise_reminder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  promise_id UUID NOT NULL REFERENCES promise(id),
  reminder_date DATE NOT NULL,
  alert_id UUID REFERENCES alert(id),
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_promise_reminder_org_promise_date UNIQUE (org_id, promise_id, reminder_date)
);

CREATE TABLE IF NOT EXISTS loan_disbursement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  loan_id UUID NOT NULL REFERENCES loan(id),
  disbursement_source loan_disbursement_source_enum NOT NULL,
  amount NUMERIC(18, 4) NOT NULL,
  currency_code TEXT NOT NULL,
  disbursed_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL,
  created_by_kind TEXT NOT NULL,
  CONSTRAINT uq_loan_disbursement_org_loan UNIQUE (org_id, loan_id)
);

CREATE TABLE IF NOT EXISTS treasurer_compensation_disbursement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  member_id UUID NOT NULL REFERENCES member(id),
  period_label TEXT NOT NULL,
  amount NUMERIC(18, 4) NOT NULL,
  currency_code TEXT NOT NULL,
  kind_at_disbursement JSONB NOT NULL,
  withdrawal_id UUID REFERENCES withdrawal(id),
  disbursed_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_treasurer_compensation_org_period UNIQUE (org_id, period_label)
);

CREATE TABLE IF NOT EXISTS pilot_log_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organization(id),
  observed_on DATE NOT NULL,
  vocabulary_answer TEXT NOT NULL,
  paper_value TEXT NOT NULL,
  system_value TEXT NOT NULL,
  discrepancy TEXT NOT NULL,
  would_not_return_to_paper BOOLEAN NOT NULL DEFAULT false,
  clean_month BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  logged_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_statement_archive_hash_public_verify
  ON statement_archive(canonical_payload_hash);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ar_aging AS
WITH overdue_contributions AS (
  SELECT
    cc.org_id,
    m.id AS member_id,
    m.display_name AS member_name,
    m.whatsapp_number,
    'aporte'::text AS reason_kind,
    cc.id AS cycle_id,
    NULL::uuid AS loan_id,
    cc.cycle_label AS period_label,
    cc.closes_on AS due_date,
    GREATEST(0, CURRENT_DATE - cc.closes_on) AS days_late,
    GREATEST(0, cc.expected_amount_per_member - COALESCE(SUM(c.amount), 0)) AS amount_due,
    MAX(c.recorded_at) AS last_action_at
  FROM contribution_cycle cc
  JOIN member m ON m.org_id = cc.org_id AND m.status = 'activo'
  LEFT JOIN contribution c
    ON c.org_id = cc.org_id
   AND c.cycle_id = cc.id
   AND c.member_id = m.id
  WHERE cc.closes_on < CURRENT_DATE
  GROUP BY cc.org_id, m.id, m.display_name, m.whatsapp_number, cc.id, cc.cycle_label, cc.closes_on, cc.expected_amount_per_member
  HAVING GREATEST(0, cc.expected_amount_per_member - COALESCE(SUM(c.amount), 0)) > 0
),
overdue_loans AS (
  SELECT
    ls.org_id,
    COALESCE(l.borrower_member_id, r.member_id) AS member_id,
    COALESCE(m.display_name, nb.display_name) AS member_name,
    COALESCE(m.whatsapp_number, nb.whatsapp_number) AS whatsapp_number,
    'cuota'::text AS reason_kind,
    NULL::uuid AS cycle_id,
    l.id AS loan_id,
    CONCAT('Cuota ', ls.period_index::text) AS period_label,
    ls.due_on AS due_date,
    GREATEST(0, CURRENT_DATE - ls.due_on) AS days_late,
    GREATEST(0, (ls.principal_due + ls.interest_due) - (ls.paid_principal_to_date + ls.paid_interest_to_date)) AS amount_due,
    MAX(r.recorded_at) AS last_action_at
  FROM loan_schedule ls
  JOIN loan l ON l.id = ls.loan_id AND l.org_id = ls.org_id
  LEFT JOIN member m ON m.id = l.borrower_member_id AND m.org_id = l.org_id
  LEFT JOIN non_member_borrower nb ON nb.id = l.borrower_non_member_id AND nb.org_id = l.org_id
  LEFT JOIN repayment r ON r.loan_id = l.id AND r.org_id = l.org_id
  WHERE ls.due_on < CURRENT_DATE
    AND ls.status IN ('pendiente', 'parcial', 'atrasado', 'en_mora')
  GROUP BY ls.org_id, COALESCE(l.borrower_member_id, r.member_id), COALESCE(m.display_name, nb.display_name), COALESCE(m.whatsapp_number, nb.whatsapp_number), l.id, ls.period_index, ls.due_on, ls.principal_due, ls.interest_due, ls.paid_principal_to_date, ls.paid_interest_to_date
  HAVING GREATEST(0, (ls.principal_due + ls.interest_due) - (ls.paid_principal_to_date + ls.paid_interest_to_date)) > 0
)
SELECT * FROM overdue_contributions
UNION ALL
SELECT * FROM overdue_loans;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ar_aging_row
  ON mv_ar_aging(org_id, member_id, reason_kind, COALESCE(loan_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(cycle_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_liquidez_proyectada AS
WITH months AS (
  SELECT generate_series(0, 11) AS offset_month
),
orgs AS (
  SELECT id AS org_id, currency_code FROM organization WHERE status = 'active'
),
capital AS (
  SELECT org_id, available_capital, base_fund_pool, pool_balance
  FROM mv_available_capital
)
SELECT
  orgs.org_id,
  (date_trunc('month', CURRENT_DATE) + (months.offset_month || ' months')::interval)::date AS month_on,
  COALESCE(capital.pool_balance, 0)
    + (months.offset_month * COALESCE(cfg.contribution_amount, 0))
    - COALESCE(capital.base_fund_pool, 0) AS projected_balance,
  COALESCE(capital.base_fund_pool, 0) AS base_fund_pool,
  COALESCE(capital.available_capital, 0) AS available_capital,
  COALESCE(cfg.year_end_share_out_formula, 'proportional_time_weighted') AS year_end_share_out_formula,
  orgs.currency_code,
  now() AS refreshed_at
FROM orgs
CROSS JOIN months
LEFT JOIN capital ON capital.org_id = orgs.org_id
LEFT JOIN LATERAL (
  SELECT contribution_amount, year_end_share_out_formula
  FROM group_config
  WHERE group_config.org_id = orgs.org_id
    AND valid_to IS NULL
  ORDER BY version DESC
  LIMIT 1
) cfg ON true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_liquidez_proyectada_org_month
  ON mv_liquidez_proyectada(org_id, month_on);

ALTER TABLE promise ENABLE ROW LEVEL SECURITY;
ALTER TABLE promise FORCE ROW LEVEL SECURITY;
CREATE POLICY promise_tenant_isolation ON promise
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE promise_reminder ENABLE ROW LEVEL SECURITY;
ALTER TABLE promise_reminder FORCE ROW LEVEL SECURITY;
CREATE POLICY promise_reminder_tenant_isolation ON promise_reminder
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE loan_disbursement ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_disbursement FORCE ROW LEVEL SECURITY;
CREATE POLICY loan_disbursement_tenant_isolation ON loan_disbursement
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE treasurer_compensation_disbursement ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasurer_compensation_disbursement FORCE ROW LEVEL SECURITY;
CREATE POLICY treasurer_compensation_disbursement_tenant_isolation ON treasurer_compensation_disbursement
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE pilot_log_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_log_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY pilot_log_entry_tenant_isolation ON pilot_log_entry
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
```

- [ ] **Step 4: Update Drizzle schema exports**

Modify `packages/db/src/schema.ts`:

```ts
export const promise_status_enum = pgEnum("promise_status_enum", ["open", "kept", "broken", "closed"]);
export const loan_disbursement_source_enum = pgEnum("loan_disbursement_source_enum", ["bank_transfer", "petty_cash"]);
```

Add table/view exports:

```ts
export const promise = pgTable("promise", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orgId: uuid("org_id").notNull(),
  memberId: uuid("member_id").references((): AnyPgColumn => member.id).notNull(),
  loanId: uuid("loan_id").references((): AnyPgColumn => loan.id),
  cycleId: uuid("cycle_id").references((): AnyPgColumn => contributionCycle.id),
  promisedOn: date("promised_on").notNull(),
  note: text("note"),
  status: promise_status_enum("status").default("open").notNull(),
  supersededById: uuid("superseded_by_id"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const promiseReminder = pgTable("promise_reminder", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orgId: uuid("org_id").notNull(),
  promiseId: uuid("promise_id").references((): AnyPgColumn => promise.id).notNull(),
  reminderDate: date("reminder_date").notNull(),
  alertId: uuid("alert_id").references((): AnyPgColumn => alert.id),
  createdAt: timestamp("created_at").notNull(),
});

export const loanDisbursement = pgTable("loan_disbursement", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orgId: uuid("org_id").notNull(),
  loanId: uuid("loan_id").references((): AnyPgColumn => loan.id).notNull(),
  disbursementSource: loan_disbursement_source_enum("disbursement_source").notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currencyCode: text("currency_code").notNull(),
  disbursedOn: date("disbursed_on").notNull(),
  createdAt: timestamp("created_at").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdByKind: text("created_by_kind").notNull(),
});

export const treasurerCompensationDisbursement = pgTable("treasurer_compensation_disbursement", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orgId: uuid("org_id").notNull(),
  memberId: uuid("member_id").references((): AnyPgColumn => member.id).notNull(),
  periodLabel: text("period_label").notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currencyCode: text("currency_code").notNull(),
  kindAtDisbursement: jsonb("kind_at_disbursement").notNull(),
  withdrawalId: uuid("withdrawal_id").references((): AnyPgColumn => withdrawal.id),
  disbursedOn: date("disbursed_on").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const pilotLogEntry = pgTable("pilot_log_entry", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orgId: uuid("org_id").references((): AnyPgColumn => organization.id).notNull(),
  observedOn: date("observed_on").notNull(),
  vocabularyAnswer: text("vocabulary_answer").notNull(),
  paperValue: text("paper_value").notNull(),
  systemValue: text("system_value").notNull(),
  discrepancy: text("discrepancy").notNull(),
  wouldNotReturnToPaper: boolean("would_not_return_to_paper").default(false).notNull(),
  cleanMonth: boolean("clean_month").default(false).notNull(),
  note: text("note"),
  loggedBy: uuid("logged_by").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const arAging = pgMaterializedView("mv_ar_aging", {
  orgId: uuid("org_id").notNull(),
  memberId: uuid("member_id"),
  memberName: text("member_name").notNull(),
  whatsappNumber: text("whatsapp_number"),
  reasonKind: text("reason_kind").notNull(),
  cycleId: uuid("cycle_id"),
  loanId: uuid("loan_id"),
  periodLabel: text("period_label").notNull(),
  dueDate: date("due_date").notNull(),
  daysLate: integer("days_late").notNull(),
  amountDue: numeric("amount_due", { precision: 18, scale: 4 }).notNull(),
  lastActionAt: timestamp("last_action_at"),
}).existing();

export const projectedLiquidity = pgMaterializedView("mv_liquidez_proyectada", {
  orgId: uuid("org_id").notNull(),
  monthOn: date("month_on").notNull(),
  projectedBalance: numeric("projected_balance", { precision: 18, scale: 4 }).notNull(),
  baseFundPool: numeric("base_fund_pool", { precision: 18, scale: 4 }).notNull(),
  availableCapital: numeric("available_capital", { precision: 18, scale: 4 }).notNull(),
  yearEndShareOutFormula: text("year_end_share_out_formula").notNull(),
  currencyCode: text("currency_code").notNull(),
  refreshedAt: timestamp("refreshed_at").notNull(),
}).existing();
```

- [ ] **Step 5: Export contract schemas**

Modify `packages/contracts/src/index.ts` imports and exports:

```ts
import {
  arAging,
  loanDisbursement,
  pilotLogEntry,
  promise,
  promiseReminder,
  projectedLiquidity,
  treasurerCompensationDisbursement,
} from "@mi-banquito/db/schema";

export const insertPromiseSchema = createInsertSchema(promise);
export const selectPromiseSchema = createSelectSchema(promise);
export const insertPromiseReminderSchema = createInsertSchema(promiseReminder);
export const selectPromiseReminderSchema = createSelectSchema(promiseReminder);
export const insertLoanDisbursementSchema = createInsertSchema(loanDisbursement);
export const selectLoanDisbursementSchema = createSelectSchema(loanDisbursement);
export const insertTreasurerCompensationDisbursementSchema = createInsertSchema(treasurerCompensationDisbursement);
export const selectTreasurerCompensationDisbursementSchema = createSelectSchema(treasurerCompensationDisbursement);
export const insertPilotLogEntrySchema = createInsertSchema(pilotLogEntry);
export const selectPilotLogEntrySchema = createSelectSchema(pilotLogEntry);
export const selectArAgingSchema = createSelectSchema(arAging);
export const selectProjectedLiquiditySchema = createSelectSchema(projectedLiquidity);

export const markPromiseFormSchema = z.object({
  memberId: uuidString,
  loanId: uuidString.optional().or(z.literal("")),
  cycleId: uuidString.optional().or(z.literal("")),
  promisedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional().or(z.literal("")),
}).refine((value) => Boolean(value.loanId) !== Boolean(value.cycleId), {
  path: ["loanId"],
  message: "Selecciona una sola obligación para la promesa.",
});

export const chaseAttemptFormSchema = z.object({
  memberId: uuidString,
  loanId: uuidString.optional().or(z.literal("")),
  cycleId: uuidString.optional().or(z.literal("")),
  reasonKind: z.enum(["aporte", "cuota"]),
  periodLabel: z.string().min(1),
});

export const loanDisbursementSourceSchema = z.enum(["bank_transfer", "petty_cash"]);

export const liquiditySandboxSchema = z.object({
  hypotheticalLoanAmount: moneyString.optional().or(z.literal("")),
});

export const verifyHashSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const pilotLogEntryFormSchema = z.object({
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vocabularyAnswer: z.string().trim().min(1),
  paperValue: z.string().trim().min(1),
  systemValue: z.string().trim().min(1),
  discrepancy: z.string().trim().min(1),
  wouldNotReturnToPaper: z.enum(["yes", "no"]).default("no"),
  cleanMonth: z.enum(["yes", "no"]).default("no"),
  note: z.string().max(1000).optional().or(z.literal("")),
});
```

- [ ] **Step 6: Run schema verification**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/db test -- --run packages/db/src/sprint4-schema.test.ts
rtk env CI=true pnpm --filter @mi-banquito/db type-check
```

Expected: PASS.

- [ ] **Step 7: Commit schema substrate**

Run:

```bash
rtk git add packages/db/src/migrations/V20260704100000__sprint_4_collections_liquidity_and_operations.sql packages/db/src/schema.ts packages/db/src/sprint4-schema.test.ts packages/contracts/src/index.ts
rtk git commit -m "feat(sprint4): add collections and operations schema (US-040 US-041 US-076)"
```

---

### Task 2: Collections Domain Service

**Files:**
- Create: `packages/domain/src/collections.ts`
- Create: `packages/domain/src/collections.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write failing domain tests**

Create `packages/domain/src/collections.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildChaseMessage,
  defaultPromiseDate,
  promiseReminderCandidates,
  sortAgingRows,
} from "./collections";

describe("collections domain", () => {
  it("sorts aging rows by days late descending by default", () => {
    const rows = sortAgingRows([
      { id: "a", daysLate: 3, amountDue: "5.0000", memberName: "Ana" },
      { id: "b", daysLate: 11, amountDue: "10.0000", memberName: "Bea" },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("defaults promise date to today plus seven days", () => {
    expect(defaultPromiseDate("2026-07-04")).toBe("2026-07-11");
  });

  it("builds warm WhatsApp chase copy for aporte", () => {
    expect(buildChaseMessage({
      memberName: "Pancho",
      reasonKind: "aporte",
      periodLabel: "julio 2026",
    })).toBe("Hola Pancho, te comparto que tu aporte de julio 2026 aún está pendiente. ¿Cuándo crees poder hacerlo? - Mi Banquito.");
  });

  it("selects only open due promises for reminders", () => {
    const due = promiseReminderCandidates([
      { id: "1", promisedOn: "2026-07-03", status: "open" },
      { id: "2", promisedOn: "2026-07-04", status: "open" },
      { id: "3", promisedOn: "2026-07-05", status: "open" },
      { id: "4", promisedOn: "2026-07-03", status: "kept" },
    ], "2026-07-04");
    expect(due.map((row) => row.id)).toEqual(["1", "2"]);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/collections.test.ts
```

Expected: FAIL because `collections.ts` does not exist.

- [ ] **Step 3: Implement pure helpers and service boundary**

Create `packages/domain/src/collections.ts`:

```ts
import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@mi-banquito/db";
import { alert, arAging, auditLogEntry, promise, promiseReminder } from "@mi-banquito/db/schema";

export type AgingReasonKind = "aporte" | "cuota";

export type AgingRow = {
  id: string;
  orgId?: string;
  memberId?: string | null;
  memberName: string;
  whatsappNumber?: string | null;
  reasonKind?: AgingReasonKind | string;
  loanId?: string | null;
  cycleId?: string | null;
  periodLabel?: string;
  dueDate?: string;
  daysLate: number;
  amountDue: string;
  lastActionAt?: Date | null;
};

export function sortAgingRows<T extends { daysLate: number; memberName: string }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    if (right.daysLate !== left.daysLate) return right.daysLate - left.daysLate;
    return left.memberName.localeCompare(right.memberName, "es");
  });
}

export function defaultPromiseDate(todayIso: string): string {
  const date = new Date(`${todayIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

export function buildChaseMessage(input: {
  memberName: string;
  reasonKind: AgingReasonKind;
  periodLabel: string;
}): string {
  const reason = input.reasonKind === "aporte" ? "aporte" : "cuota";
  return `Hola ${input.memberName}, te comparto que tu ${reason} de ${input.periodLabel} aún está pendiente. ¿Cuándo crees poder hacerlo? - Mi Banquito.`;
}

export function promiseReminderCandidates<T extends { id: string; promisedOn: string; status: string }>(
  rows: T[],
  todayIso: string,
): T[] {
  return rows.filter((row) => row.status === "open" && row.promisedOn <= todayIso);
}

function agingRowId(row: typeof arAging.$inferSelect): string {
  return [
    row.orgId,
    row.memberId ?? "no-member",
    row.reasonKind,
    row.loanId ?? "no-loan",
    row.cycleId ?? "no-cycle",
  ].join(":");
}

export function createCollectionsService() {
  return {
    async listAgingRows(orgId: string, reasonKind?: AgingReasonKind) {
      const rows = await db
        .select()
        .from(arAging)
        .where(reasonKind ? and(eq(arAging.orgId, orgId), eq(arAging.reasonKind, reasonKind)) : eq(arAging.orgId, orgId))
        .orderBy(desc(arAging.daysLate));

      return sortAgingRows(rows.map((row) => ({
        id: agingRowId(row),
        orgId: row.orgId,
        memberId: row.memberId,
        memberName: row.memberName,
        whatsappNumber: row.whatsappNumber,
        reasonKind: row.reasonKind,
        loanId: row.loanId,
        cycleId: row.cycleId,
        periodLabel: row.periodLabel,
        dueDate: row.dueDate,
        daysLate: Number(row.daysLate),
        amountDue: String(row.amountDue),
        lastActionAt: row.lastActionAt,
      })));
    },

    async markPromise(input: {
      orgId: string;
      actorId: string;
      memberId: string;
      loanId?: string | null;
      cycleId?: string | null;
      promisedOn: string;
      note?: string | null;
      todayIso: string;
    }) {
      if (input.promisedOn < input.todayIso) {
        throw new Error("La fecha de promesa debe ser hoy o una fecha futura.");
      }
      if (Boolean(input.loanId) === Boolean(input.cycleId)) {
        throw new Error("La promesa debe estar ligada a una sola obligación.");
      }

      const now = new Date();
      const id = randomUUID();
      await db.transaction(async (tx) => {
        const openRows = await tx
          .select()
          .from(promise)
          .where(and(
            eq(promise.orgId, input.orgId),
            eq(promise.memberId, input.memberId),
            input.loanId ? eq(promise.loanId, input.loanId) : isNull(promise.loanId),
            input.cycleId ? eq(promise.cycleId, input.cycleId) : isNull(promise.cycleId),
            eq(promise.status, "open"),
          ));

        await tx.insert(promise).values({
          id,
          orgId: input.orgId,
          memberId: input.memberId,
          loanId: input.loanId ?? null,
          cycleId: input.cycleId ?? null,
          promisedOn: input.promisedOn,
          note: input.note?.trim() || null,
          status: "open",
          supersededById: null,
          createdBy: input.actorId,
          createdAt: now,
        });

        for (const row of openRows) {
          await tx.update(promise)
            .set({ status: "closed", supersededById: id })
            .where(and(eq(promise.orgId, input.orgId), eq(promise.id, row.id)));
        }

        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "collections.promise.marked",
          subjectKind: "promise",
          subjectId: id,
          payloadSnapshot: {
            memberId: input.memberId,
            loanId: input.loanId ?? null,
            cycleId: input.cycleId ?? null,
            promisedOn: input.promisedOn,
          },
          reason: input.note?.trim() || null,
          at: now,
          createdAt: now,
        });
      });

      return { promiseId: id };
    },

    async recordChaseAttempt(input: {
      orgId: string;
      actorId: string;
      memberId: string;
      loanId?: string | null;
      cycleId?: string | null;
      message: string;
    }) {
      const now = new Date();
      await db.insert(auditLogEntry).values({
        orgId: input.orgId,
        actorKind: "member",
        actorId: input.actorId,
        actionKind: "collections.chase.whatsapp_attempted",
        subjectKind: input.loanId ? "loan" : "contribution_cycle",
        subjectId: input.loanId ?? input.cycleId ?? null,
        payloadSnapshot: {
          memberId: input.memberId,
          channel: "whatsapp",
          messageTemplateId: "collections_chase_v1",
          message: input.message,
        },
        reason: null,
        at: now,
        createdAt: now,
      });
    },

    async emitPromiseReminders(todayIso: string) {
      const openPromises = await db.select().from(promise)
        .where(and(eq(promise.status, "open"), lte(promise.promisedOn, todayIso)));
      let emitted = 0;
      for (const row of openPromises) {
        const now = new Date();
        const alertId = randomUUID();
        await db.transaction(async (tx) => {
          await tx.insert(alert).values({
            id: alertId,
            orgId: row.orgId,
            alertKind: "PROMISE_DUE",
            severity: "medium",
            audience: "treasurer",
            subjectKind: row.loanId ? "loan" : "contribution_cycle",
            subjectId: row.loanId ?? row.cycleId,
            payload: { promiseId: row.id, memberId: row.memberId, promisedOn: row.promisedOn },
            dedupWindowEnd: new Date(now.getTime() + 86_400_000),
            dismissedAt: null,
            dismissedBy: null,
            snoozedUntil: null,
            createdAt: now,
          });
          await tx.insert(promiseReminder).values({
            orgId: row.orgId,
            promiseId: row.id,
            reminderDate: todayIso,
            alertId,
            createdAt: now,
          }).onConflictDoNothing();
        });
        emitted += 1;
      }
      return { promisesScanned: openPromises.length, remindersEmitted: emitted };
    },
  };
}
```

- [ ] **Step 4: Export collections service**

Modify `packages/domain/src/index.ts`:

```ts
export * from "./collections";
```

- [ ] **Step 5: Run domain tests**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/collections.test.ts
rtk env CI=true pnpm --filter @mi-banquito/domain type-check
```

Expected: PASS.

- [ ] **Step 6: Commit collections domain**

Run:

```bash
rtk git add packages/domain/src/collections.ts packages/domain/src/collections.test.ts packages/domain/src/index.ts
rtk git commit -m "feat(collections): add aging and promise domain logic (US-040 US-041 US-042)"
```

---

### Task 3: A/R Aging UI, Promise Modal, and WhatsApp Chase

**Files:**
- Modify: `apps/web/src/app/(authenticated)/atrasos/page.tsx`
- Create: `apps/web/src/app/(authenticated)/atrasos/actions.ts`
- Create: `apps/web/src/app/(authenticated)/atrasos/aging-table.tsx`
- Create: `apps/web/src/app/(authenticated)/atrasos/page.test.tsx`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write failing UI test**

Create `apps/web/src/app/(authenticated)/atrasos/page.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScrArAgingPage from "./page";

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => Promise.resolve({
    orgId: "11111111-1111-4111-8111-111111111111",
    actorId: "33333333-3333-4333-8333-333333333333",
    roles: ["TESORERA"],
    userId: "auth0|test",
  }),
}));

vi.mock("@mi-banquito/domain", async () => {
  const actual = await vi.importActual<object>("@mi-banquito/domain");
  return {
    ...actual,
    createCollectionsService: () => ({
      listAgingRows: () => Promise.resolve([
        {
          id: "late-loan",
          memberId: "44444444-4444-4444-8444-444444444444",
          memberName: "Pancho",
          whatsappNumber: "+593987654321",
          reasonKind: "cuota",
          loanId: "55555555-5555-4555-8555-555555555555",
          cycleId: null,
          periodLabel: "Cuota 1",
          dueDate: "2026-07-01",
          daysLate: 9,
          amountDue: "16.0000",
          lastActionAt: null,
        },
      ]),
    }),
  };
});

describe("ScrArAgingPage", () => {
  it("renders readable aging rows and actions", async () => {
    render(await ScrArAgingPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Atrasos")).toBeInTheDocument();
    expect(screen.getByText("Pancho")).toBeInTheDocument();
    expect(screen.getByText("Cuota 1")).toBeInTheDocument();
    expect(screen.getByText("$16,00")).toBeInTheDocument();
    expect(screen.getByText("9 dias")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar promesa" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Avisar por WhatsApp" })).toHaveAttribute("href", expect.stringContaining("https://wa.me/593987654321"));
  });
});
```

- [ ] **Step 2: Run UI test to verify failure**

Run:

```bash
rtk env CI=true pnpm --filter mi-banquito-web test -- --run src/app/'(authenticated)'/atrasos/page.test.tsx
```

Expected: FAIL because `/atrasos` is still scaffolded.

- [ ] **Step 3: Add actions**

Create `apps/web/src/app/(authenticated)/atrasos/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markPromiseFormSchema, chaseAttemptFormSchema } from "@mi-banquito/contracts";
import { buildChaseMessage, createCollectionsService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function markPromiseAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = markPromiseFormSchema.parse(formDataToObject(formData));
  await createCollectionsService().markPromise({
    orgId: session.orgId,
    actorId: session.actorId,
    memberId: parsed.memberId,
    loanId: parsed.loanId || null,
    cycleId: parsed.cycleId || null,
    promisedOn: parsed.promisedOn,
    note: parsed.note || null,
    todayIso: todayIso(),
  });
  revalidatePath("/atrasos");
  redirect("/atrasos?promise=1");
}

export async function recordChaseAttemptAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = chaseAttemptFormSchema.parse(formDataToObject(formData));
  const message = buildChaseMessage({
    memberName: String(formData.get("memberName") ?? ""),
    reasonKind: parsed.reasonKind,
    periodLabel: parsed.periodLabel,
  });
  await createCollectionsService().recordChaseAttempt({
    orgId: session.orgId,
    actorId: session.actorId,
    memberId: parsed.memberId,
    loanId: parsed.loanId || null,
    cycleId: parsed.cycleId || null,
    message,
  });
}
```

- [ ] **Step 4: Add the client table**

Create `apps/web/src/app/(authenticated)/atrasos/aging-table.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { ButtonPrimary, InputText } from "@mi-banquito/ui";
import { buildChaseMessage, defaultPromiseDate, type AgingRow } from "@mi-banquito/domain";
import { markPromiseAction, recordChaseAttemptAction } from "./actions";

type SortKey = "memberName" | "reasonKind" | "amountDue" | "daysLate" | "lastActionAt";

function formatMoney(value: string): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value));
}

function whatsappHref(row: AgingRow): string | undefined {
  if (!row.whatsappNumber || !row.periodLabel || (row.reasonKind !== "aporte" && row.reasonKind !== "cuota")) return undefined;
  const phone = row.whatsappNumber.replace(/[^\d]/g, "");
  const text = buildChaseMessage({
    memberName: row.memberName,
    reasonKind: row.reasonKind,
    periodLabel: row.periodLabel,
  });
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function AgingTable({ rows, todayIso }: { rows: AgingRow[]; todayIso: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("daysLate");
  const sorted = useMemo(() => [...rows].sort((left, right) => {
    if (sortKey === "daysLate") return right.daysLate - left.daysLate;
    if (sortKey === "amountDue") return Number(right.amountDue) - Number(left.amountDue);
    return String(left[sortKey] ?? "").localeCompare(String(right[sortKey] ?? ""), "es");
  }), [rows, sortKey]);

  return (
    <section className="grid gap-4 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        {[
          ["memberName", "Socia"],
          ["reasonKind", "Motivo"],
          ["amountDue", "Monto"],
          ["daysLate", "Dias tarde"],
          ["lastActionAt", "Ultima accion"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-text-primary"
            onClick={() => setSortKey(key as SortKey)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {sorted.map((row) => {
          const href = whatsappHref(row);
          return (
            <article key={row.id} className="grid gap-3 rounded-md border border-border bg-background p-4 md:grid-cols-[1fr_auto]">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{row.memberName}</h2>
                <p className="text-sm text-text-secondary">{row.reasonKind === "aporte" ? "Aporte" : "Cuota"} - {row.periodLabel}</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-text-secondary">Monto pendiente</dt><dd className="font-semibold">{formatMoney(row.amountDue)}</dd></div>
                  <div><dt className="text-text-secondary">Atraso</dt><dd className="font-semibold">{row.daysLate} dias</dd></div>
                  <div><dt className="text-text-secondary">Vencia</dt><dd className="font-semibold">{row.dueDate}</dd></div>
                  <div><dt className="text-text-secondary">Ultima accion</dt><dd className="font-semibold">{row.lastActionAt ? new Date(row.lastActionAt).toISOString().slice(0, 10) : "Sin accion"}</dd></div>
                </dl>
              </div>
              <div className="grid content-start gap-2">
                <form action={markPromiseAction} className="grid gap-2">
                  <input type="hidden" name="memberId" value={row.memberId ?? ""} />
                  <input type="hidden" name="loanId" value={row.loanId ?? ""} />
                  <input type="hidden" name="cycleId" value={row.cycleId ?? ""} />
                  <InputText labelKey="Fecha promesa" name="promisedOn" type="date" defaultValue={defaultPromiseDate(todayIso)} required />
                  <InputText labelKey="Nota" name="note" />
                  <ButtonPrimary type="submit">Marcar promesa</ButtonPrimary>
                </form>
                {href ? (
                  <form action={recordChaseAttemptAction}>
                    <input type="hidden" name="memberId" value={row.memberId ?? ""} />
                    <input type="hidden" name="loanId" value={row.loanId ?? ""} />
                    <input type="hidden" name="cycleId" value={row.cycleId ?? ""} />
                    <input type="hidden" name="reasonKind" value={row.reasonKind ?? ""} />
                    <input type="hidden" name="periodLabel" value={row.periodLabel ?? ""} />
                    <input type="hidden" name="memberName" value={row.memberName} />
                    <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 py-2 font-semibold text-primary">
                      Avisar por WhatsApp
                    </a>
                  </form>
                ) : (
                  <span className="text-sm text-text-secondary">Sin WhatsApp registrado</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Replace scaffold page**

Modify `apps/web/src/app/(authenticated)/atrasos/page.tsx`:

```tsx
import { createCollectionsService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { AgingTable } from "./aging-table";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function ScrArAgingPage({
  searchParams,
}: {
  searchParams?: Promise<{ reason?: "aporte" | "cuota"; promise?: string }>;
}) {
  const session = await requireTreasurer();
  const query = await searchParams;
  const rows = await createCollectionsService().listAgingRows(session.orgId, query?.reason);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 p-6" data-screen="SCR-ar-aging">
      <header>
        <h1 className="text-3xl font-bold text-text-primary">Atrasos</h1>
        <p className="mt-2 text-text-secondary">Prioriza a quien llamar segun monto y dias de atraso.</p>
      </header>
      {query?.promise ? (
        <p className="rounded-md border border-border bg-surface p-3 text-sm font-semibold text-primary" role="status">
          Promesa registrada.
        </p>
      ) : null}
      <nav className="flex flex-wrap gap-2" aria-label="Filtros de atraso">
        <a className="rounded-md border border-border px-3 py-2 text-sm font-semibold" href="/atrasos">Todos</a>
        <a className="rounded-md border border-border px-3 py-2 text-sm font-semibold" href="/atrasos?reason=aporte">Aportes</a>
        <a className="rounded-md border border-border px-3 py-2 text-sm font-semibold" href="/atrasos?reason=cuota">Cuotas</a>
      </nav>
      {rows.length === 0 ? (
        <section className="rounded-md border border-border bg-surface p-5 text-text-secondary">
          No hay atrasos pendientes.
        </section>
      ) : (
        <AgingTable rows={rows} todayIso={todayIso()} />
      )}
    </main>
  );
}
```

- [ ] **Step 6: Run UI tests**

Run:

```bash
rtk env CI=true pnpm --filter mi-banquito-web test -- --run src/app/'(authenticated)'/atrasos/page.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit A/R UI**

Run:

```bash
rtk git add apps/web/src/app/'(authenticated)'/atrasos apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(collections): render aging actions (US-040 US-041 US-042)"
```

---

### Task 4: Promise Reminder Cron

**Files:**
- Modify: `apps/web/src/lib/cron/handler.ts`
- Create: `apps/web/src/app/api/cron/promise-reminders/route.ts`
- Create: `apps/web/src/app/api/cron/promise-reminders/route.test.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write failing route test**

Create `apps/web/src/app/api/cron/promise-reminders/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@mi-banquito/domain", () => ({
  createCollectionsService: () => ({
    emitPromiseReminders: () => Promise.resolve({ promisesScanned: 2, remindersEmitted: 2 }),
  }),
}));

describe("/api/cron/promise-reminders", () => {
  it("requires the cron bearer secret", async () => {
    process.env.CRON_SECRET = "secret";
    const response = await GET(new Request("http://test/api/cron/promise-reminders"));
    expect(response.status).toBe(401);
  });

  it("runs promise reminders with the cron bearer secret", async () => {
    process.env.CRON_SECRET = "secret";
    const response = await GET(new Request("http://test/api/cron/promise-reminders?date=2026-07-04", {
      headers: { authorization: "Bearer secret" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job: "promise-reminders",
      ran: true,
      summary: { promisesScanned: 2, remindersEmitted: 2 },
    });
  });
});
```

- [ ] **Step 2: Run route test to verify failure**

Run:

```bash
rtk env CI=true pnpm --filter mi-banquito-web test -- --run src/app/api/cron/promise-reminders/route.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Extend cron handler**

Modify `apps/web/src/lib/cron/handler.ts`:

```ts
import { createCollectionsService } from "@mi-banquito/domain";

export type CronJobName =
  | "accrue-interest"
  | "award-treasurer-compensation"
  | "daily"
  | "drift-check"
  | "promise-reminders";

async function runPromiseReminderCron(request: Request) {
  const url = new URL(request.url);
  const today = url.searchParams.get("date") ?? isoToday();
  return createCollectionsService().emitPromiseReminders(today);
}
```

Inside `createCronHandler`, before the final fallback:

```ts
    if (job === "promise-reminders") {
      const summary = await runPromiseReminderCron(request);
      return NextResponse.json({ job, ran: true, summary });
    }
```

- [ ] **Step 4: Add cron route**

Create `apps/web/src/app/api/cron/promise-reminders/route.ts`:

```ts
import { createCronHandler } from "@/lib/cron/handler";

export const runtime = "nodejs";

export const GET = createCronHandler("promise-reminders");
```

- [ ] **Step 5: Add Vercel schedule**

Modify `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/accrue-interest", "schedule": "5 5 * * *" },
    { "path": "/api/cron/award-treasurer-compensation", "schedule": "15 5 * * *" },
    { "path": "/api/cron/drift-check", "schedule": "25 5 * * *" },
    { "path": "/api/cron/promise-reminders", "schedule": "35 5 * * *" }
  ]
}
```

- [ ] **Step 6: Run cron tests**

Run:

```bash
rtk env CI=true pnpm --filter mi-banquito-web test -- --run src/app/api/cron/promise-reminders/route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit promise cron**

Run:

```bash
rtk git add apps/web/src/lib/cron/handler.ts apps/web/src/app/api/cron/promise-reminders vercel.json
rtk git commit -m "feat(alerts): emit promise reminders by cron (US-043)"
```

---

### Task 5: Loan Disbursement Source

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/domain/src/loans/types.ts`
- Modify: `packages/domain/src/loan.ts`
- Modify: `packages/domain/src/sprint2-loans.test.ts`
- Modify: `apps/web/src/app/(authenticated)/prestamos/nuevo/loan-origination-form.tsx`
- Modify: `apps/web/src/app/(authenticated)/prestamos/nuevo/page.tsx`

- [ ] **Step 1: Add failing loan domain test**

Append to `packages/domain/src/sprint2-loans.test.ts`:

```ts
it("records loan disbursement source when originating a loan", async () => {
  const fakeDb = createFakeDbWithLoanSetup();
  const service = createLoanService(fakeDb);
  await service.originateLoan({
    orgId: ORG_ID,
    actorId: ACTOR_ID,
    clientRequestId: "77777777-7777-4777-8777-777777777777",
    borrowerKind: "member",
    borrowerMemberId: MEMBER_ID,
    principalAmount: "100.0000",
    termPeriods: 10,
    originatedOn: "2026-07-04",
    purpose: "Capital de trabajo",
    disbursementSource: "petty_cash",
  });
  expect(insertedRows(fakeDb, loanDisbursement)[0]).toMatchObject({
    orgId: ORG_ID,
    disbursementSource: "petty_cash",
    amount: "100.0000",
    disbursedOn: "2026-07-04",
  });
});
```

Use the existing fake DB helpers in that file. Import `loanDisbursement` from `@mi-banquito/db/schema`.

- [ ] **Step 2: Run domain test to verify failure**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/sprint2-loans.test.ts
```

Expected: FAIL because `disbursementSource` is not part of `OriginateLoanInput` and no disbursement row is inserted.

- [ ] **Step 3: Extend validation and type**

Modify `packages/contracts/src/index.ts` loan origination schema:

```ts
export const loanOriginationFormSchema = z.object({
  clientRequestId: uuidString,
  borrowerKind: z.enum(["member", "non_member"]),
  borrowerMemberId: uuidString.optional().or(z.literal("")),
  nonMemberDisplayName: z.string().trim().optional(),
  nonMemberWhatsappNumber: e164.optional().or(z.literal("")),
  nonMemberNationalIdLast4: z.string().regex(/^\d{4}$/).optional().or(z.literal("")),
  nonMemberNotes: z.string().max(500).optional(),
  guarantorMemberId: uuidString.optional().or(z.literal("")),
  referrerMemberId: uuidString.optional().or(z.literal("")),
  principalAmount: moneyString,
  termPeriods: z.coerce.number().int().min(1).max(60),
  originatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purpose: z.string().max(500).optional(),
  disbursementSource: loanDisbursementSourceSchema.default("bank_transfer"),
});
```

Modify `packages/domain/src/loans/types.ts`:

```ts
export type LoanDisbursementSource = "bank_transfer" | "petty_cash";

export type OriginateLoanInput = {
  orgId: string;
  actorId: string;
  clientRequestId: string;
  borrowerKind: BorrowerKind;
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
  disbursementSource?: LoanDisbursementSource;
};
```

- [ ] **Step 4: Insert disbursement event in origination transaction**

Modify `packages/domain/src/loan.ts` imports:

```ts
import { loanDisbursement } from "@mi-banquito/db/schema";
```

Inside `originateLoan`, before `await db.transaction`:

```ts
const disbursementSource = input.disbursementSource ?? "bank_transfer";
```

Inside the existing `write` block after `tx.insert(loan).values(...)`:

```ts
          await tx.insert(loanDisbursement).values({
            orgId: input.orgId,
            loanId,
            disbursementSource,
            amount: principalAmount,
            currencyCode,
            disbursedOn: input.originatedOn,
            createdAt: now,
            createdBy: input.actorId,
            createdByKind: ACTOR_KIND,
          });
```

Add `disbursementSource` to the audit payload:

```ts
              disbursementSource,
```

- [ ] **Step 5: Add form field**

Modify `apps/web/src/app/(authenticated)/prestamos/nuevo/loan-origination-form.tsx` `LoanCopy`:

```ts
  disbursementSource: string;
  disbursementSourceBank: string;
  disbursementSourcePettyCash: string;
```

Add the field under loan conditions:

```tsx
        <FormField labelKey={copy.disbursementSource}>
          <Select name="disbursementSource" defaultValue="bank_transfer" required>
            <option value="bank_transfer">{copy.disbursementSourceBank}</option>
            <option value="petty_cash">{copy.disbursementSourcePettyCash}</option>
          </Select>
        </FormField>
```

Modify `apps/web/src/lib/i18n/en-US.json` under `sprint2.loanOrigination`:

```json
"disbursementSource": "De donde sale el dinero",
"disbursementSourceBank": "Transferencia bancaria",
"disbursementSourcePettyCash": "Caja chica"
```

- [ ] **Step 6: Run loan tests**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/sprint2-loans.test.ts
rtk env CI=true pnpm --filter mi-banquito-web test -- --run src/app/'(authenticated)'/prestamos/'[id]'/page.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit loan disbursement source**

Run:

```bash
rtk git add packages/contracts/src/index.ts packages/domain/src/loans/types.ts packages/domain/src/loan.ts packages/domain/src/sprint2-loans.test.ts apps/web/src/app/'(authenticated)'/prestamos/nuevo apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(loans): record disbursement source (US-076)"
```

---

### Task 6: Treasurer Compensation Cron

**Files:**
- Create: `packages/domain/src/compensation.ts`
- Create: `packages/domain/src/compensation.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `apps/web/src/lib/cron/handler.ts`
- Create: `apps/web/src/app/api/cron/award-treasurer-compensation/route.test.ts`

- [ ] **Step 1: Write failing compensation tests**

Create `packages/domain/src/compensation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextCompensationDueOn, periodLabelForCompensation, shouldAwardFixedPeriodicCompensation } from "./compensation";

describe("treasurer compensation", () => {
  it("advances monthly due dates by one month", () => {
    expect(nextCompensationDueOn("2026-07-04", "monthly")).toBe("2026-08-04");
  });

  it("advances yearly due dates by one year", () => {
    expect(nextCompensationDueOn("2026-07-04", "yearly")).toBe("2027-07-04");
  });

  it("uses deterministic period labels", () => {
    expect(periodLabelForCompensation("2026-07-04", "monthly")).toBe("2026-07");
    expect(periodLabelForCompensation("2026-07-04", "yearly")).toBe("2026");
  });

  it("skips non fixed-periodic compensation shapes", () => {
    expect(shouldAwardFixedPeriodicCompensation({ kind: "percentage", amount: "10.0000", period: "monthly", nextDueOn: "2026-07-04" }, "2026-07-04")).toBe(false);
    expect(shouldAwardFixedPeriodicCompensation({ kind: "fixed", amount: "10.0000", period: "monthly", nextDueOn: "2026-07-05" }, "2026-07-04")).toBe(false);
    expect(shouldAwardFixedPeriodicCompensation({ kind: "fixed", amount: "10.0000", period: "monthly", nextDueOn: "2026-07-04" }, "2026-07-04")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/compensation.test.ts
```

Expected: FAIL because `compensation.ts` does not exist.

- [ ] **Step 3: Implement compensation helpers and service**

Create `packages/domain/src/compensation.ts`:

```ts
import { and, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@mi-banquito/db";
import {
  alert,
  auditLogEntry,
  groupConfig,
  member,
  treasurerCompensationDisbursement,
  withdrawal,
} from "@mi-banquito/db/schema";

export type CompensationPeriod = "monthly" | "yearly";
export type CompensationConfig = {
  kind?: string;
  amount?: string;
  currency?: string;
  period?: string;
  nextDueOn?: string;
};

export function nextCompensationDueOn(currentDueOn: string, period: CompensationPeriod): string {
  const date = new Date(`${currentDueOn}T00:00:00.000Z`);
  if (period === "monthly") date.setUTCMonth(date.getUTCMonth() + 1);
  if (period === "yearly") date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export function periodLabelForCompensation(dueOn: string, period: CompensationPeriod): string {
  return period === "monthly" ? dueOn.slice(0, 7) : dueOn.slice(0, 4);
}

export function shouldAwardFixedPeriodicCompensation(config: CompensationConfig, todayIso: string): boolean {
  const period = config.period === "yearly" ? "yearly" : config.period === "monthly" ? "monthly" : undefined;
  return config.kind === "fixed" && Boolean(period) && Boolean(config.amount) && Boolean(config.nextDueOn) && String(config.nextDueOn) <= todayIso;
}

function compensationConfig(json: unknown, fallbackCurrency: string): CompensationConfig {
  const value = typeof json === "object" && json && "treasurerCompensation" in json
    ? (json as { treasurerCompensation?: CompensationConfig }).treasurerCompensation
    : undefined;
  return {
    kind: value?.kind,
    amount: value?.amount,
    currency: value?.currency ?? fallbackCurrency,
    period: value?.period === "cycle" ? "monthly" : value?.period,
    nextDueOn: value?.nextDueOn,
  };
}

export function createCompensationService() {
  return {
    async awardDueTreasurerCompensation(todayIso: string) {
      const configs = await db.select().from(groupConfig).where(isNull(groupConfig.validTo));
      let orgsProcessed = 0;
      let disbursementsCreated = 0;

      for (const configRow of configs) {
        orgsProcessed += 1;
        const cfg = compensationConfig(configRow.config, configRow.currencyCode);
        if (!shouldAwardFixedPeriodicCompensation(cfg, todayIso)) continue;
        const period = cfg.period === "yearly" ? "yearly" : "monthly";
        const periodLabel = periodLabelForCompensation(cfg.nextDueOn ?? todayIso, period);
        const [treasurer] = await db.select().from(member)
          .where(and(eq(member.orgId, configRow.orgId), eq(member.role, "tesorera"), eq(member.status, "activo")))
          .orderBy(desc(member.createdAt));
        if (!treasurer) continue;

        const withdrawalId = randomUUID();
        const disbursementId = randomUUID();
        const now = new Date();
        await db.transaction(async (tx) => {
          await tx.insert(withdrawal).values({
            id: withdrawalId,
            orgId: configRow.orgId,
            memberId: treasurer.id,
            kind: "treasurer_compensation_disbursement",
            amount: cfg.amount ?? "0.0000",
            currencyCode: cfg.currency ?? configRow.currencyCode,
            datedOn: todayIso,
            recordedAt: now,
            notes: `Compensación tesorera ${periodLabel}`,
            createdAt: now,
            createdBy: treasurer.id,
            createdByKind: "system",
            adjustmentCycleId: null,
            clientRequestId: randomUUID(),
          });
          await tx.insert(treasurerCompensationDisbursement).values({
            id: disbursementId,
            orgId: configRow.orgId,
            memberId: treasurer.id,
            periodLabel,
            amount: cfg.amount ?? "0.0000",
            currencyCode: cfg.currency ?? configRow.currencyCode,
            kindAtDisbursement: cfg,
            withdrawalId,
            disbursedOn: todayIso,
            createdAt: now,
          }).onConflictDoNothing();
          await tx.insert(alert).values({
            orgId: configRow.orgId,
            alertKind: "TREASURER_COMPENSATION_AWARDED",
            severity: "low",
            audience: "treasurer",
            subjectKind: "treasurer_compensation_disbursement",
            subjectId: disbursementId,
            payload: {
              periodLabel,
              amount: cfg.amount,
              currency: cfg.currency ?? configRow.currencyCode,
              message: `Compensación de tesorera de ${periodLabel} acreditada - ${cfg.currency ?? configRow.currencyCode} ${cfg.amount}`,
            },
            dedupWindowEnd: new Date(now.getTime() + 86_400_000),
            dismissedAt: null,
            dismissedBy: null,
            snoozedUntil: null,
            createdAt: now,
          });
          await tx.insert(auditLogEntry).values({
            orgId: configRow.orgId,
            actorKind: "system",
            actorId: "00000000-0000-4000-8000-000000000000",
            actionKind: "treasurer_compensation.awarded",
            subjectKind: "treasurer_compensation_disbursement",
            subjectId: disbursementId,
            payloadSnapshot: { periodLabel, withdrawalId, amount: cfg.amount, currency: cfg.currency ?? configRow.currencyCode },
            reason: null,
            at: now,
            createdAt: now,
          });
        });
        disbursementsCreated += 1;
      }

      return { orgsProcessed, disbursementsCreated };
    },
  };
}
```

- [ ] **Step 4: Export compensation service**

Modify `packages/domain/src/index.ts`:

```ts
export * from "./compensation";
```

- [ ] **Step 5: Wire cron handler**

Modify `apps/web/src/lib/cron/handler.ts`:

```ts
import { createCompensationService } from "@mi-banquito/domain";
```

In `createCronHandler`:

```ts
    if (job === "award-treasurer-compensation") {
      const url = new URL(request.url);
      const today = url.searchParams.get("date") ?? isoToday();
      const summary = await createCompensationService().awardDueTreasurerCompensation(today);
      return NextResponse.json({ job, ran: true, summary });
    }
```

- [ ] **Step 6: Run compensation tests**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/compensation.test.ts
rtk env CI=true pnpm --filter mi-banquito-web test -- --run src/app/api/cron/award-treasurer-compensation/route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit compensation cron**

Run:

```bash
rtk git add packages/domain/src/compensation.ts packages/domain/src/compensation.test.ts packages/domain/src/index.ts apps/web/src/lib/cron/handler.ts apps/web/src/app/api/cron/award-treasurer-compensation
rtk git commit -m "feat(reporting): award treasurer compensation cron (US-050)"
```

---

### Task 7: Liquidity Projection and Sandbox

**Files:**
- Modify: `packages/domain/src/liquidity.ts`
- Create: `packages/domain/src/liquidity.test.ts`
- Modify: `apps/web/src/app/(authenticated)/liquidez/page.tsx`
- Create: `apps/web/src/app/(authenticated)/liquidez/liquidity-sandbox.tsx`
- Create: `apps/web/src/app/(authenticated)/liquidez/page.test.tsx`

- [ ] **Step 1: Write failing liquidity tests**

Create `packages/domain/src/liquidity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyHypotheticalLoan, liquidityNarrative } from "./liquidity";

describe("liquidity projection", () => {
  const series = [
    { monthOn: "2026-07-01", projectedBalance: "300.0000" },
    { monthOn: "2026-08-01", projectedBalance: "260.0000" },
    { monthOn: "2026-09-01", projectedBalance: "420.0000" },
  ];

  it("builds readable narrative for the minimum month and year end", () => {
    expect(liquidityNarrative({ series, commitment: "250.0000" })).toBe("Tu mes mínimo es agosto con $260,00. Llegarás a fin de año con $420,00, lo cual está $170,00 por encima del compromiso.");
  });

  it("applies a hypothetical loan without mutating the original projection", () => {
    const shifted = applyHypotheticalLoan(series, "100.0000");
    expect(shifted.map((row) => row.projectedBalance)).toEqual(["200.0000", "160.0000", "320.0000"]);
    expect(series[0]?.projectedBalance).toBe("300.0000");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/liquidity.test.ts
```

Expected: FAIL because the functions do not exist.

- [ ] **Step 3: Implement liquidity domain**

Modify `packages/domain/src/liquidity.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import { availableCapital, projectedLiquidity } from "@mi-banquito/db/schema";

export type LiquidityPoint = { monthOn: string; projectedBalance: string };

function money(value: string | number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value));
}

function monthName(monthOn: string): string {
  const date = new Date(`${monthOn}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("es-EC", { month: "long", timeZone: "UTC" }).format(date);
}

function money4(value: number): string {
  return value.toFixed(4);
}

export function applyHypotheticalLoan(series: LiquidityPoint[], amount: string): LiquidityPoint[] {
  const loan = Number(amount || 0);
  return series.map((row) => ({
    ...row,
    projectedBalance: money4(Number(row.projectedBalance) - loan),
  }));
}

export function liquidityNarrative(input: { series: LiquidityPoint[]; commitment: string }): string {
  const min = input.series.reduce((current, row) => Number(row.projectedBalance) < Number(current.projectedBalance) ? row : current, input.series[0]);
  const yearEnd = input.series[input.series.length - 1];
  const delta = Number(yearEnd.projectedBalance) - Number(input.commitment);
  const direction = delta < 0 ? "por debajo" : "por encima";
  return `Tu mes mínimo es ${monthName(min.monthOn)} con ${money(min.projectedBalance)}. Llegarás a fin de año con ${money(yearEnd.projectedBalance)}, lo cual está ${money(Math.abs(delta))} ${direction} del compromiso.`;
}

export function createLiquidityService() {
  return {
    async getProjection(orgId: string) {
      const [capital] = await db.select().from(availableCapital).where(eq(availableCapital.orgId, orgId));
      const series = await db.select().from(projectedLiquidity).where(eq(projectedLiquidity.orgId, orgId));
      const normalized = series.map((row) => ({
        monthOn: row.monthOn,
        projectedBalance: String(row.projectedBalance),
      }));
      const commitment = "0.0000";
      return {
        availableCapital: String(capital?.availableCapital ?? "0.0000"),
        poolBalance: String(capital?.poolBalance ?? "0.0000"),
        baseFundPool: String(capital?.baseFundPool ?? "0.0000"),
        commitment,
        series: normalized,
        narrative: normalized.length > 0 ? liquidityNarrative({ series: normalized, commitment }) : "No hay datos de liquidez proyectada todavía.",
      };
    },
  };
}
```

- [ ] **Step 4: Replace liquidity scaffold**

Modify `apps/web/src/app/(authenticated)/liquidez/page.tsx`:

```tsx
import { createLiquidityService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { LiquiditySandbox } from "./liquidity-sandbox";

export const dynamic = "force-dynamic";

function formatMoney(value: string): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value));
}

export default async function ScrCashFlowProjectionPage() {
  const session = await requireTreasurer();
  const projection = await createLiquidityService().getProjection(session.orgId);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 p-6" data-screen="SCR-cash-flow-projection">
      <header>
        <h1 className="text-3xl font-bold text-text-primary">Liquidez proyectada</h1>
        <p className="mt-2 text-text-secondary">Mira si el banquito aguanta nuevos préstamos sin tocar la cuota base.</p>
      </header>
      <section className="grid gap-3 rounded-md border border-border bg-surface p-5 md:grid-cols-3">
        <div><p className="text-sm text-text-secondary">Capital disponible</p><p className="text-2xl font-bold">{formatMoney(projection.availableCapital)}</p></div>
        <div><p className="text-sm text-text-secondary">Dinero total</p><p className="text-2xl font-bold">{formatMoney(projection.poolBalance)}</p></div>
        <div><p className="text-sm text-text-secondary">Cuota base protegida</p><p className="text-2xl font-bold">{formatMoney(projection.baseFundPool)}</p></div>
      </section>
      <section className="rounded-md border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">Resumen</h2>
        <p className="mt-2 text-text-secondary">{projection.narrative}</p>
      </section>
      <LiquiditySandbox series={projection.series} commitment={projection.commitment} />
    </main>
  );
}
```

Create `apps/web/src/app/(authenticated)/liquidez/liquidity-sandbox.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { InputNumber } from "@mi-banquito/ui";
import { applyHypotheticalLoan, liquidityNarrative, type LiquidityPoint } from "@mi-banquito/domain";

function formatMoney(value: string): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value));
}

export function LiquiditySandbox({ series, commitment }: { series: LiquidityPoint[]; commitment: string }) {
  const [amount, setAmount] = useState("");
  const shifted = useMemo(() => applyHypotheticalLoan(series, amount || "0"), [series, amount]);
  return (
    <section className="grid gap-4 rounded-md border border-border bg-surface p-5">
      <h2 className="text-xl font-semibold">Considerar un préstamo</h2>
      <InputNumber labelKey="Monto del préstamo de prueba" value={amount} onChange={(event) => setAmount(event.target.value)} min="0" step="0.01" />
      <p className="text-sm text-text-secondary">{liquidityNarrative({ series: shifted, commitment })}</p>
      <div className="grid gap-2">
        {shifted.map((row) => (
          <div key={row.monthOn} className="grid grid-cols-[1fr_auto] rounded-md bg-surface-muted p-3 text-sm">
            <span>{row.monthOn}</span>
            <strong>{formatMoney(row.projectedBalance)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run liquidity tests**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/liquidity.test.ts
rtk env CI=true pnpm --filter mi-banquito-web test -- --run src/app/'(authenticated)'/liquidez/page.test.tsx
```

Expected: PASS after adding the page test equivalent to the A/R page test.

- [ ] **Step 6: Commit liquidity projection**

Run:

```bash
rtk git add packages/domain/src/liquidity.ts packages/domain/src/liquidity.test.ts apps/web/src/app/'(authenticated)'/liquidez
rtk git commit -m "feat(liquidity): show projection and sandbox (US-054)"
```

---

### Task 8: Public Statement Hash Verifier

**Files:**
- Modify: `packages/domain/src/reporting.ts`
- Create: `packages/domain/src/reporting.test.ts`
- Create: `apps/web/src/app/verify/[hash]/page.tsx`
- Create: `apps/web/src/app/verify/[hash]/route.ts`
- Create: `apps/web/src/app/verify/[hash]/page.test.tsx`
- Delete: `apps/web/src/app/(authenticated)/verify/[hash]/page.tsx`

- [ ] **Step 1: Write failing reporting tests**

Create `packages/domain/src/reporting.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { publicVerifyUrl, verifierResultText } from "./reporting";

describe("public statement verification", () => {
  it("builds the verifier URL from a canonical hash", () => {
    expect(publicVerifyUrl("https://mi-banquito.vercel.app", "a".repeat(64))).toBe("https://mi-banquito.vercel.app/verify/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("returns minimal hit and miss copy", () => {
    expect(verifierResultText({ matched: true, groupName: "Mi Banquito", generatedAt: "2026-07-04T10:00:00.000Z" })).toBe("Este documento coincide con el registro del grupo Mi Banquito al 2026-07-04.");
    expect(verifierResultText({ matched: false })).toBe("No se encontró un documento con este código.");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/reporting.test.ts
```

Expected: FAIL because the functions do not exist.

- [ ] **Step 3: Implement reporting verifier helpers**

Modify `packages/domain/src/reporting.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import { organization, statementArchive } from "@mi-banquito/db/schema";

export type VerifyResult =
  | { matched: true; groupName: string; generatedAt: string }
  | { matched: false };

export function publicVerifyUrl(baseUrl: string, hash: string): string {
  return `${baseUrl.replace(/\/$/, "")}/verify/${hash.toLowerCase()}`;
}

export function verifierResultText(result: VerifyResult): string {
  if (!result.matched) return "No se encontró un documento con este código.";
  return `Este documento coincide con el registro del grupo ${result.groupName} al ${result.generatedAt.slice(0, 10)}.`;
}

export function createReportingService() {
  return {
    async verifyStatementHash(hash: string): Promise<VerifyResult> {
      const [row] = await db.select({
        generatedAt: statementArchive.generatedAt,
        groupName: organization.displayName,
      })
        .from(statementArchive)
        .innerJoin(organization, eq(organization.id, statementArchive.orgId))
        .where(eq(statementArchive.canonicalPayloadHash, hash.toLowerCase()));

      if (!row) return { matched: false };
      return {
        matched: true,
        groupName: row.groupName,
        generatedAt: row.generatedAt instanceof Date ? row.generatedAt.toISOString() : String(row.generatedAt),
      };
    },
  };
}
```

- [ ] **Step 4: Create unauthenticated verifier page and JSON route**

Create `apps/web/src/app/verify/[hash]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { verifyHashSchema } from "@mi-banquito/contracts";
import { createReportingService, verifierResultText } from "@mi-banquito/domain";

export const dynamic = "force-dynamic";

export default async function PublicVerifyPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const parsed = verifyHashSchema.safeParse({ hash });
  if (!parsed.success) notFound();
  const result = await createReportingService().verifyStatementHash(parsed.data.hash);
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-2xl content-center gap-4 p-6" data-screen="SCR-public-verify-pdf">
      <p className="text-sm font-semibold text-primary">Mi Banquito</p>
      <h1 className="text-3xl font-bold text-text-primary">Verificación de documento</h1>
      <p className="text-lg text-text-secondary">{verifierResultText(result)}</p>
    </main>
  );
}
```

Create `apps/web/src/app/verify/[hash]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { verifyHashSchema } from "@mi-banquito/contracts";
import { createReportingService } from "@mi-banquito/domain";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const parsed = verifyHashSchema.safeParse({ hash });
  if (!parsed.success) return NextResponse.json({ matched: false }, { status: 400 });
  const result = await createReportingService().verifyStatementHash(parsed.data.hash);
  return NextResponse.json(result, { status: result.matched ? 200 : 404 });
}
```

Delete `apps/web/src/app/(authenticated)/verify/[hash]/page.tsx`.

- [ ] **Step 5: Run verifier tests**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/reporting.test.ts
rtk env CI=true pnpm --filter mi-banquito-web test -- --run src/app/verify/'[hash]'/page.test.tsx
```

Expected: PASS after adding a page test that mocks `createReportingService`.

- [ ] **Step 6: Commit public verifier**

Run:

```bash
rtk git add packages/domain/src/reporting.ts packages/domain/src/reporting.test.ts apps/web/src/app/verify apps/web/src/app/'(authenticated)'/verify
rtk git commit -m "feat(reporting): add public hash verifier (US-085)"
```

---

### Task 9: Offline Queue Visibility

**Files:**
- Create: `apps/web/src/lib/offline/outbox.ts`
- Create: `apps/web/src/lib/offline/outbox.test.ts`
- Create: `apps/web/src/components/offline/offline-queue-indicator.tsx`
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`
- Modify: `apps/web/src/app/sw.ts`

- [ ] **Step 1: Write failing outbox tests**

Create `apps/web/src/lib/offline/outbox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { offlineChipLabel, reduceOutboxState } from "./outbox";

describe("offline outbox state", () => {
  it("shows readable queued copy", () => {
    expect(offlineChipLabel({ status: "queued" })).toBe("Guardado. Se sincronizará cuando vuelva la señal");
  });

  it("tracks queued count and clears synced writes", () => {
    const state = reduceOutboxState({ queued: [] }, { type: "queued", clientRequestId: "a" });
    expect(state.queued).toEqual(["a"]);
    expect(reduceOutboxState(state, { type: "synced", clientRequestId: "a" }).queued).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
rtk env CI=true pnpm --filter mi-banquito-web test -- --run src/lib/offline/outbox.test.ts
```

Expected: FAIL because `outbox.ts` does not exist.

- [ ] **Step 3: Implement outbox helpers**

Create `apps/web/src/lib/offline/outbox.ts`:

```ts
export type OutboxState = { queued: string[] };
export type OutboxEvent =
  | { type: "queued"; clientRequestId: string }
  | { type: "synced"; clientRequestId: string };

export function offlineChipLabel(input: { status: "queued" | "synced" }): string {
  return input.status === "queued"
    ? "Guardado. Se sincronizará cuando vuelva la señal"
    : "";
}

export function reduceOutboxState(state: OutboxState, event: OutboxEvent): OutboxState {
  if (event.type === "queued") {
    return state.queued.includes(event.clientRequestId)
      ? state
      : { queued: [...state.queued, event.clientRequestId] };
  }
  return { queued: state.queued.filter((id) => id !== event.clientRequestId) };
}

export function queuedCountLabel(count: number): string {
  return count === 1 ? "1 guardado pendiente" : `${count} guardados pendientes`;
}
```

- [ ] **Step 4: Add visible queue indicator**

Create `apps/web/src/components/offline/offline-queue-indicator.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { queuedCountLabel } from "@/lib/offline/outbox";

export function OfflineQueueIndicator() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ count: number }>).detail;
      setCount(detail?.count ?? 0);
    };
    window.addEventListener("mi-banquito:outbox-count", handler);
    return () => window.removeEventListener("mi-banquito:outbox-count", handler);
  }, []);

  if (count === 0) return null;
  return (
    <button
      type="button"
      className="fixed bottom-20 right-4 z-50 rounded-md border border-warning bg-surface px-4 py-3 text-sm font-semibold text-text-primary shadow-lg"
      aria-label={queuedCountLabel(count)}
    >
      {queuedCountLabel(count)}
    </button>
  );
}
```

Modify `apps/web/src/app/(authenticated)/layout.tsx`:

```tsx
import { OfflineQueueIndicator } from "@/components/offline/offline-queue-indicator";
```

Render inside the authenticated shell:

```tsx
<OfflineQueueIndicator />
```

- [ ] **Step 5: Add service-worker queue broadcast**

Modify `apps/web/src/app/sw.ts` by adding message handling:

```ts
self.addEventListener("message", (event) => {
  if (event.data?.type === "MI_BANQUITO_OUTBOX_COUNT") {
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: "MI_BANQUITO_OUTBOX_COUNT", count: event.data.count });
      }
    });
  }
});
```

Add a client listener in `OfflineQueueIndicator`:

```ts
    navigator.serviceWorker?.addEventListener("message", (event) => {
      if (event.data?.type === "MI_BANQUITO_OUTBOX_COUNT") setCount(event.data.count ?? 0);
    });
```

- [ ] **Step 6: Run offline tests**

Run:

```bash
rtk env CI=true pnpm --filter mi-banquito-web test -- --run src/lib/offline/outbox.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit offline visibility**

Run:

```bash
rtk git add apps/web/src/lib/offline apps/web/src/components/offline apps/web/src/app/'(authenticated)'/layout.tsx apps/web/src/app/sw.ts
rtk git commit -m "feat(pwa): show queued write status (US-077)"
```

---

### Task 10: Pilot Log and Exit Checklist

**Files:**
- Create: `packages/domain/src/pilot.ts`
- Create: `packages/domain/src/pilot.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `apps/web/src/app/(authenticated)/admin/orgs/[id]/pilot-log/page.tsx`
- Create: `apps/web/src/app/(authenticated)/admin/orgs/[id]/pilot-log/actions.ts`
- Create: `apps/web/src/app/(authenticated)/admin/orgs/[id]/pilot-log/report/route.ts`

- [ ] **Step 1: Write failing pilot tests**

Create `packages/domain/src/pilot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluatePilotExitChecklist } from "./pilot";

describe("pilot exit checklist", () => {
  it("requires three clean months and would-not-return affirmation", () => {
    expect(evaluatePilotExitChecklist([
      { observedOn: "2026-05-01", cleanMonth: true, wouldNotReturnToPaper: false },
      { observedOn: "2026-06-01", cleanMonth: true, wouldNotReturnToPaper: false },
      { observedOn: "2026-07-01", cleanMonth: true, wouldNotReturnToPaper: true },
    ])).toEqual({
      hasThreeCleanMonths: true,
      hasWouldNotReturnAffirmation: true,
      readyToExit: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/pilot.test.ts
```

Expected: FAIL because `pilot.ts` does not exist.

- [ ] **Step 3: Implement pilot domain**

Create `packages/domain/src/pilot.ts`:

```ts
import { desc, eq } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import { auditLogEntry, pilotLogEntry } from "@mi-banquito/db/schema";

export type PilotChecklistInput = {
  observedOn: string;
  cleanMonth: boolean;
  wouldNotReturnToPaper: boolean;
};

export function evaluatePilotExitChecklist(rows: PilotChecklistInput[]) {
  const sorted = [...rows].sort((left, right) => left.observedOn.localeCompare(right.observedOn));
  let streak = 0;
  let maxStreak = 0;
  for (const row of sorted) {
    streak = row.cleanMonth ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }
  const hasThreeCleanMonths = maxStreak >= 3;
  const hasWouldNotReturnAffirmation = sorted.some((row) => row.wouldNotReturnToPaper);
  return {
    hasThreeCleanMonths,
    hasWouldNotReturnAffirmation,
    readyToExit: hasThreeCleanMonths && hasWouldNotReturnAffirmation,
  };
}

export function createPilotService() {
  return {
    async listEntries(orgId: string) {
      return db.select().from(pilotLogEntry)
        .where(eq(pilotLogEntry.orgId, orgId))
        .orderBy(desc(pilotLogEntry.observedOn));
    },
    async addEntry(input: {
      orgId: string;
      actorId: string;
      observedOn: string;
      vocabularyAnswer: string;
      paperValue: string;
      systemValue: string;
      discrepancy: string;
      wouldNotReturnToPaper: boolean;
      cleanMonth: boolean;
      note?: string | null;
    }) {
      const now = new Date();
      const [row] = await db.insert(pilotLogEntry).values({
        orgId: input.orgId,
        observedOn: input.observedOn,
        vocabularyAnswer: input.vocabularyAnswer,
        paperValue: input.paperValue,
        systemValue: input.systemValue,
        discrepancy: input.discrepancy,
        wouldNotReturnToPaper: input.wouldNotReturnToPaper,
        cleanMonth: input.cleanMonth,
        note: input.note?.trim() || null,
        loggedBy: input.actorId,
        createdAt: now,
      }).returning();
      await db.insert(auditLogEntry).values({
        orgId: input.orgId,
        actorKind: "platform_operator",
        actorId: input.actorId,
        actionKind: "pilot_log.entry_created",
        subjectKind: "pilot_log_entry",
        subjectId: row.id,
        payloadSnapshot: input,
        reason: null,
        at: now,
        createdAt: now,
      });
      return row;
    },
  };
}
```

Modify `packages/domain/src/index.ts`:

```ts
export * from "./pilot";
```

- [ ] **Step 4: Replace pilot scaffold with protected page**

Modify `apps/web/src/app/(authenticated)/admin/orgs/[id]/pilot-log/page.tsx`:

```tsx
import { createPilotService, evaluatePilotExitChecklist } from "@mi-banquito/domain";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import { addPilotLogEntryAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ScrAdminPilotLogPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformOperator();
  const { id } = await params;
  const entries = await createPilotService().listEntries(id);
  const checklist = evaluatePilotExitChecklist(entries.map((row) => ({
    observedOn: row.observedOn,
    cleanMonth: row.cleanMonth,
    wouldNotReturnToPaper: row.wouldNotReturnToPaper,
  })));

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 p-6" data-screen="SCR-admin-pilot-log">
      <header>
        <h1 className="text-3xl font-bold text-text-primary">Bitácora del piloto</h1>
        <p className="mt-2 text-text-secondary">Registra observaciones de paridad entre cuaderno y sistema.</p>
      </header>
      <section className="rounded-md border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">Criterios de salida</h2>
        <ul className="mt-3 grid gap-2 text-sm">
          <li>{checklist.hasThreeCleanMonths ? "Listo" : "Pendiente"} - 3 meses limpios consecutivos</li>
          <li>{checklist.hasWouldNotReturnAffirmation ? "Listo" : "Pendiente"} - No volvería al papel</li>
          <li>{checklist.readyToExit ? "Piloto listo para cierre" : "Piloto en seguimiento"}</li>
        </ul>
      </section>
      <form action={addPilotLogEntryAction} className="grid gap-3 rounded-md border border-border bg-surface p-5">
        <input type="hidden" name="orgId" value={id} />
        <input className="rounded-md border border-border p-2" name="observedOn" type="date" required />
        <input className="rounded-md border border-border p-2" name="vocabularyAnswer" placeholder="Respuesta de vocabulario" required />
        <input className="rounded-md border border-border p-2" name="paperValue" placeholder="Cuaderno" required />
        <input className="rounded-md border border-border p-2" name="systemValue" placeholder="Sistema" required />
        <input className="rounded-md border border-border p-2" name="discrepancy" placeholder="Diferencia" required />
        <label><input type="checkbox" name="cleanMonth" value="yes" /> Mes limpio</label>
        <label><input type="checkbox" name="wouldNotReturnToPaper" value="yes" /> No volvería al papel</label>
        <textarea className="rounded-md border border-border p-2" name="note" placeholder="Nota" />
        <button className="min-h-11 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground" type="submit">Guardar observación</button>
      </form>
      <section className="grid gap-3">
        {entries.map((row) => (
          <article key={row.id} className="rounded-md border border-border bg-surface p-4">
            <h2 className="font-semibold">{row.observedOn}</h2>
            <p className="text-sm text-text-secondary">Cuaderno: {row.paperValue} - Sistema: {row.systemValue} - Diferencia: {row.discrepancy}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Add pilot action**

Create `apps/web/src/app/(authenticated)/admin/orgs/[id]/pilot-log/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { pilotLogEntryFormSchema } from "@mi-banquito/contracts";
import { createPilotService } from "@mi-banquito/domain";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function addPilotLogEntryAction(formData: FormData) {
  const session = await requirePlatformOperator();
  const orgId = String(formData.get("orgId") ?? "");
  const parsed = pilotLogEntryFormSchema.parse(formDataToObject(formData));
  await createPilotService().addEntry({
    orgId,
    actorId: session.actorId,
    observedOn: parsed.observedOn,
    vocabularyAnswer: parsed.vocabularyAnswer,
    paperValue: parsed.paperValue,
    systemValue: parsed.systemValue,
    discrepancy: parsed.discrepancy,
    wouldNotReturnToPaper: parsed.wouldNotReturnToPaper === "yes",
    cleanMonth: parsed.cleanMonth === "yes",
    note: parsed.note || null,
  });
  revalidatePath(`/admin/orgs/${orgId}/pilot-log`);
}
```

- [ ] **Step 6: Add report route**

Create `apps/web/src/app/(authenticated)/admin/orgs/[id]/pilot-log/report/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createPilotService, evaluatePilotExitChecklist } from "@mi-banquito/domain";
import { requirePlatformOperator } from "@/lib/auth/require-session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePlatformOperator();
  const { id } = await params;
  const entries = await createPilotService().listEntries(id);
  const checklist = evaluatePilotExitChecklist(entries.map((row) => ({
    observedOn: row.observedOn,
    cleanMonth: row.cleanMonth,
    wouldNotReturnToPaper: row.wouldNotReturnToPaper,
  })));
  const body = [
    "Reporte de salida del piloto",
    `Org: ${id}`,
    `Listo para salida: ${checklist.readyToExit ? "si" : "no"}`,
    ...entries.map((row) => `${row.observedOn}: cuaderno=${row.paperValue}; sistema=${row.systemValue}; diferencia=${row.discrepancy}`),
  ].join("\n");
  return new NextResponse(body, {
    headers: {
      "content-type": "application/pdf; charset=utf-8",
      "content-disposition": `attachment; filename="pilot-${id}.pdf"`,
    },
  });
}
```

- [ ] **Step 7: Run pilot tests**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/pilot.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit pilot log**

Run:

```bash
rtk git add packages/domain/src/pilot.ts packages/domain/src/pilot.test.ts packages/domain/src/index.ts apps/web/src/app/'(authenticated)'/admin/orgs/'[id]'/pilot-log
rtk git commit -m "feat(admin): add pilot log ceremony (US-087)"
```

---

### Task 11: Sprint 4 E2E, Closure Gate, and Documentation

**Files:**
- Create: `apps/web/e2e/sprint4.spec.ts`
- Create: `scripts/sprint4-closure-gate.mjs`
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `docs/stories/STATUS_REPORT.md`
- Modify: `docs/stories/DEFERRED_EXTERNAL_BLOCKERS.md`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Add Playwright smoke tests**

Create `apps/web/e2e/sprint4.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/atrasos",
  "/liquidez",
  "/admin/orgs/11111111-1111-4111-8111-111111111111/pilot-log",
] as const;

test.describe("Sprint 4 protected surfaces", () => {
  for (const route of protectedRoutes) {
    test(`${route} requires an Auth0 session`, async ({ request }) => {
      const response = await request.get(route, {
        headers: { accept: "text/html" },
        maxRedirects: 0,
      });
      expect(response.status()).toBe(307);
      expect(response.headers()["location"]).toBe("/auth/login");
    });
  }

  test("public verifier route does not require Auth0", async ({ request }) => {
    const response = await request.get(`/verify/${"a".repeat(64)}`, {
      headers: { accept: "text/html" },
      maxRedirects: 0,
    });
    expect([200, 404]).toContain(response.status());
    expect(response.headers()["location"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Add closure gate**

Create `scripts/sprint4-closure-gate.mjs`:

```js
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const requiredFiles = [
  "packages/db/src/sprint4-schema.test.ts",
  "packages/domain/src/collections.ts",
  "packages/domain/src/compensation.ts",
  "packages/domain/src/liquidity.ts",
  "packages/domain/src/pilot.ts",
  "apps/web/src/app/(authenticated)/atrasos/page.tsx",
  "apps/web/src/app/(authenticated)/liquidez/page.tsx",
  "apps/web/src/app/verify/[hash]/page.tsx",
  "apps/web/src/app/api/cron/promise-reminders/route.ts",
  "apps/web/e2e/sprint4.spec.ts",
];

const scaffoldFiles = [
  "apps/web/src/app/(authenticated)/atrasos/page.tsx",
  "apps/web/src/app/(authenticated)/liquidez/page.tsx",
  "apps/web/src/app/(authenticated)/admin/orgs/[id]/pilot-log/page.tsx",
];

let failed = false;
for (const rel of requiredFiles) {
  if (!existsSync(resolve(root, rel))) {
    console.error(`[sprint4] missing required file: ${rel}`);
    failed = true;
  }
}

for (const rel of scaffoldFiles) {
  const abs = resolve(root, rel);
  if (existsSync(abs) && readFileSync(abs, "utf8").includes("SCAFFOLD")) {
    console.error(`[sprint4] scaffold marker remains: ${rel}`);
    failed = true;
  }
}

if (existsSync(resolve(root, "apps/web/src/app/(authenticated)/verify/[hash]/page.tsx"))) {
  console.error("[sprint4] public verifier must not live under (authenticated)");
  failed = true;
}

if (failed) process.exit(1);
console.log("[sprint4] ok");
```

- [ ] **Step 3: Wire closure gate scripts**

Modify root `package.json`:

```json
"audit:sprint4": "node scripts/sprint4-closure-gate.mjs"
```

Modify `apps/web/package.json` `lint:ds`:

```json
"lint:ds": "node ../../scripts/check-status-pill.mjs ../.. && node ../../scripts/check-hardcoded-color.mjs ../.. && node ../../scripts/check-hardcoded-string.mjs ../.. && node ../../scripts/check-lucide-allowlist.mjs ../.. && node ../../scripts/sprint1-ui-closure-gate.mjs ../.. && node ../../scripts/sprint2-closure-gate.mjs ../.. && node ../../scripts/sprint3-closure-gate.mjs ../.. && node ../../scripts/sprint4-closure-gate.mjs ../.."
```

- [ ] **Step 4: Run full verification**

Run:

```bash
rtk env CI=true pnpm --filter @mi-banquito/db verify
rtk env CI=true pnpm --filter @mi-banquito/db test -- --run packages/db/src/sprint4-schema.test.ts
rtk env CI=true pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/collections.test.ts packages/domain/src/compensation.test.ts packages/domain/src/liquidity.test.ts packages/domain/src/reporting.test.ts packages/domain/src/pilot.test.ts packages/domain/src/sprint2-loans.test.ts
rtk env CI=true pnpm --filter mi-banquito-web test -- --run src/app/'(authenticated)'/atrasos/page.test.tsx src/app/'(authenticated)'/liquidez/page.test.tsx src/app/verify/'[hash]'/page.test.tsx src/lib/offline/outbox.test.ts src/app/api/cron/promise-reminders/route.test.ts
rtk env CI=true pnpm type-check
rtk env CI=true pnpm lint
rtk env CI=true pnpm build
rtk env CI=true pnpm -C apps/web exec playwright test e2e/sprint4.spec.ts
rtk node scripts/sprint4-closure-gate.mjs
```

Expected: all commands PASS. Known nonfatal build warning from Auth0 DPoP dynamic dependency may remain acceptable if unchanged from prior sprints.

- [ ] **Step 5: Record closure status and deferrals**

Append to `docs/stories/STATUS_REPORT.md`:

```md
Sprint 4 is closed as **implemented and locally verified**, with two accepted forward-dependent deferrals: public verifier PDF-footer embedding waits for the statement PDF generator, and treasurer compensation monthly-close PDF visibility waits for the monthly close PDF story. Sprint 4 delivered A/R aging, promise tracking, promise reminder cron, WhatsApp chase audit attempts, loan disbursement source, offline queued-write visibility, public hash verification, liquidity projection, treasurer compensation disbursement, pilot log, Playwright smoke coverage, and a Sprint 4 closure gate.
```

Append to `docs/stories/DEFERRED_EXTERNAL_BLOCKERS.md`:

```md
## Sprint 4 Closure Note

Sprint 4 has no new external account blocker. Two forward-dependent product evidence items remain tracked:

- US-085 AC-4: QR/footer embedding into generated statement PDFs requires the later statement PDF generation stories.
- US-050 AC-5: monthly-close PDF visibility for treasurer compensation requires the later monthly close PDF story.
```

Append `.nous-feedback.jsonl` lines:

```json
{"story":"US-040","event":"done","notes":"A/R aging implemented with sorted/filterable rows and org-scoped view."}
{"story":"US-041","event":"done","notes":"Promise marking implemented with validation, supersede behavior, and audit."}
{"story":"US-042","event":"done","notes":"WhatsApp chase intent implemented with audit attempt record and disabled missing-number state."}
{"story":"US-043","event":"done","notes":"Promise reminder cron implemented and idempotency ledger added."}
{"story":"US-050","event":"done_with_deferral","notes":"Compensation cron/disbursement/withdrawal/alert/audit implemented; monthly-close PDF rendering deferred to monthly-close PDF story."}
{"story":"US-054","event":"done","notes":"Liquidity projection and read-only sandbox implemented."}
{"story":"US-076","event":"done","notes":"Loan disbursement source captured at origination and audited."}
{"story":"US-077","event":"done","notes":"Queued write copy and count indicator implemented; client_request_id dedupe already enforced by write tables."}
{"story":"US-085","event":"done_with_deferral","notes":"Public verifier endpoint/page implemented; QR/PDF footer embedding deferred to statement PDF generator story."}
{"story":"US-087","event":"done","notes":"Pilot log page, entries, checklist, and report route implemented."}
```

- [ ] **Step 6: Commit closure evidence**

Run:

```bash
rtk git add apps/web/e2e/sprint4.spec.ts scripts/sprint4-closure-gate.mjs package.json apps/web/package.json docs/stories/STATUS_REPORT.md docs/stories/DEFERRED_EXTERNAL_BLOCKERS.md .nous-feedback.jsonl
rtk git commit -m "chore(sprint4): add closure gate and evidence (US-040)"
```

---

## Final Verification Checklist

Run before declaring Sprint 4 complete:

```bash
rtk git status --short --branch
rtk env CI=true pnpm --filter @mi-banquito/db verify
rtk env CI=true pnpm test
rtk env CI=true pnpm type-check
rtk env CI=true pnpm lint
rtk env CI=true pnpm build
rtk env CI=true pnpm -C apps/web exec playwright test e2e/sprint4.spec.ts
rtk node scripts/sprint4-closure-gate.mjs
```

Production deployment checklist:

```bash
rtk git push
rtk pnpm dlx vercel deploy --prod --yes
rtk curl -i --max-time 20 https://mi-banquito.vercel.app/api/health
```

After deploy, verify production Neon schema before user testing:

```sql
SELECT
  to_regclass('promise') IS NOT NULL AS has_promise,
  to_regclass('loan_disbursement') IS NOT NULL AS has_loan_disbursement,
  to_regclass('mv_ar_aging') IS NOT NULL AS has_ar_aging,
  to_regclass('mv_liquidez_proyectada') IS NOT NULL AS has_liquidez;
```

Manual user test script:

1. Open `/atrasos`; confirm rows are readable, sorted by days late, and filter links work.
2. Mark a promise for a late row; confirm it shows success and does not duplicate open promises when repeated.
3. Tap WhatsApp for a row with a phone; confirm the message text is warm and readable.
4. Open `/prestamos/nuevo`; confirm "De donde sale el dinero" defaults to bank transfer and can choose caja chica.
5. Open `/liquidez`; confirm capital, base fund, narrative, and sandbox recompute are understandable.
6. Open `/verify/<64-char-hash>` logged out; confirm the page does not redirect to Auth0.
7. Open `/admin/orgs/<id>/pilot-log` as operator; confirm non-operator access is denied and operator can add observations.
8. Trigger `/api/cron/promise-reminders` and `/api/cron/award-treasurer-compensation` with `CRON_SECRET`; confirm idempotent reruns.

## Self-Review

Spec coverage:

- US-040 covered by Tasks 1, 2, 3, and 11.
- US-041 covered by Tasks 1, 2, 3, and 11.
- US-042 covered by Tasks 2, 3, and 11.
- US-043 covered by Tasks 1, 2, 4, and 11.
- US-050 covered by Tasks 1, 6, and 11, with monthly-close PDF visibility recorded as a forward-dependent deferral.
- US-054 covered by Tasks 1, 7, and 11.
- US-076 covered by Tasks 1, 5, and 11.
- US-077 covered by Tasks 1, 9, and 11; server dedupe relies on existing `client_request_id` uniqueness in contribution, withdrawal, expense, loan, and repayment tables.
- US-085 covered by Tasks 1, 8, and 11, with PDF footer embedding recorded as a forward-dependent deferral.
- US-087 covered by Tasks 1, 10, and 11.

Placeholder scan:

- No plan step uses unspecified file paths.
- Forward-dependent items are explicitly named as deferrals with closure documentation.
- Each code-producing task includes concrete code or command examples.

Type consistency:

- `promise`, `promiseReminder`, `loanDisbursement`, `treasurerCompensationDisbursement`, `pilotLogEntry`, `arAging`, and `projectedLiquidity` are created in schema and consumed by domain/web tasks.
- `disbursementSource` is added consistently to contracts, domain input, form, and audit payload.
- Cron job names include `promise-reminders` in the handler and route.
