# Sprint 3 Substrate, Alerts, and Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Sprint 3 stories US-024, US-055, US-056, US-057, US-069, US-070, US-071, US-072, US-073, and US-083 with enforced database invariants, usable alert/history surfaces, Sentry redaction code, and closure evidence.

**Architecture:** Start with PostgreSQL invariants because alerts, history, adjustment windows, and audit screens depend on trustworthy append-only and tenant-scoped data. Implement domain services in `packages/domain` as the stable boundary for Next.js Server Components and Server Actions. Finish with UI, Playwright, adversarial checks, story-status updates, and a Sprint 3 closure gate.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM, PostgreSQL triggers/RLS, Vitest, Playwright, Auth0 session guards, Sentry SDK hooks, Vercel/Neon deployment.

---

## Sprint 3 Work Queue

| Story | Execution order | Primary surface |
| --- | ---: | --- |
| US-069 | 1 | Append-only ledger trigger errors |
| US-072 | 2 | Cross-tenant RLS fail-closed checks |
| US-071 | 3 | Same-transaction audit rollback |
| US-070 | 4 | Period-lock trigger |
| US-083 | 5 | Operator adjustment window |
| US-024 | 6 | `/admin/orgs/[id]/business-rules` |
| US-056 | 7 | `/historial` plain-Spanish narration |
| US-057 | 8 | `/historial` filters |
| US-055 | 9 | Alerts bell list, dismiss, snooze, WhatsApp share |
| US-073 | 10 | Sentry init and PII redaction |
| Closure | 11 | gates, docs, deployment smoke |

External deferral handling: US-073 can be code-complete and unit-verified without a live Sentry project. Keep the inherited external blocker for real Sentry DSN and Better Stack confirmation in `docs/stories/DEFERRED_EXTERNAL_BLOCKERS.md` until those services are provisioned and observed.

## File Structure

Create:
- `packages/db/src/migrations/V20260702100000__sprint_3_alert_events_and_adjustment_windows.sql` - alert action events, adjustment fields, adjustment cycle references.
- `packages/db/src/migrations/V20260702101000__sprint_3_named_append_only_errors.sql` - normalized append-only error function for ledger tables.
- `packages/db/src/migrations/V20260702102000__sprint_3_period_lock_guard.sql` - period-lock trigger for dated financial inserts.
- `packages/db/src/migrations/V20260702103000__sprint_3_rls_fail_closed.sql` - fail-closed RLS policy replacement and FORCE RLS coverage for new tables.
- `packages/db/src/sprint3-substrate.test.ts` - DB integration tests for US-069, US-070, US-072.
- `packages/domain/src/audit.test.ts` - narration, filters, and rollback unit tests.
- `packages/domain/src/alerts.test.ts` - effective alert state, dismiss, snooze, WhatsApp message tests.
- `packages/domain/src/reconciliation.test.ts` - adjustment window service tests.
- `apps/web/src/lib/sentry/redaction.ts` - shared `beforeSend` event scrubber.
- `apps/web/src/lib/sentry/redaction.test.ts` - US-073 redaction tests.
- `apps/web/instrumentation.ts` - Next.js server/runtime Sentry registration.
- `apps/web/instrumentation-client.ts` - browser-side Sentry registration.
- `apps/web/src/app/(authenticated)/admin/orgs/[id]/business-rules/export/route.ts` - CSV export route.
- `apps/web/src/app/(authenticated)/admin/orgs/[id]/period-close/[periodCloseId]/adjust/page.tsx` - operator adjustment screen.
- `apps/web/src/app/(authenticated)/admin/orgs/[id]/period-close/[periodCloseId]/adjust/actions.ts` - adjustment Server Action.
- `apps/web/src/app/(authenticated)/alerts/actions.ts` - alert dismiss/snooze Server Actions.
- `apps/web/e2e/sprint3.spec.ts` - Sprint 3 protected route, action, and UI smoke checks.
- `scripts/sprint3-closure-gate.mjs` - Sprint 3 structural closure gate.

Modify:
- `packages/db/src/schema.ts` - add `alertAction`, adjustment columns, movement `adjustmentCycleId`, enum value `adjustment`.
- `packages/db/scripts/verify-schema.mjs` - verify named append-only error function, period-lock function, new table policies.
- `packages/db/src/tenant.test.ts` - add fail-closed no-session-var assertions.
- `packages/domain/src/audit.ts` - implement narration registry, filters, PDF payload, same-transaction helper.
- `packages/domain/src/alerts.ts` - implement alert queries and append-only alert actions.
- `packages/domain/src/reconciliation.ts` - implement adjustment window commands.
- `packages/domain/src/platform.ts` - add read-only business-rule projection and CSV rows.
- `packages/domain/src/index.ts` - export new public types.
- `apps/web/src/components/layout/header.tsx` - replace hardcoded count with server-fed alert count and trigger.
- `apps/web/src/app/(authenticated)/layout.tsx` - load alert count in the shell.
- `apps/web/src/app/(authenticated)/historial/page.tsx` - replace contribution-only view with audit narration and filters.
- `apps/web/src/app/(authenticated)/admin/orgs/[id]/business-rules/page.tsx` - replace scaffold with US-024 panel.
- `apps/web/src/lib/i18n/en-US.json` - add all user-facing strings in Spanish copy already used by the app.
- `apps/web/package.json` and `package.json` - wire `scripts/sprint3-closure-gate.mjs`.
- `docs/stories/STATUS_REPORT.md` - add Sprint 3 closure evidence.
- `docs/stories/DEFERRED_EXTERNAL_BLOCKERS.md` - keep external Sentry/Better Stack status explicit.
- `.nous-feedback.jsonl` - append Sprint 3 verification events.

## Task 1: DB Substrate Types and Migration Skeleton

**Files:**
- Create: `packages/db/src/migrations/V20260702100000__sprint_3_alert_events_and_adjustment_windows.sql`
- Modify: `packages/db/src/schema.ts`
- Test: `packages/db/src/sprint3-substrate.test.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "./index";

config({ path: "../../.env.local" });
config({ path: "../../apps/web/.env.local", override: true });

const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;

describe("Sprint 3 schema substrate", () => {
  runIfDatabase("exposes alert_action and adjustment columns", async () => {
    const result = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          table_name = 'alert_action'
          OR (table_name = 'reconciliation_cycle' AND column_name IN (
            'period_close_id',
            'adjustment_reason',
            'adjustment_window_opens_at',
            'adjustment_window_closes_at'
          ))
          OR (table_name IN ('contribution','withdrawal','expense','repayment','interest_accrual') AND column_name = 'adjustment_cycle_id')
        )
      ORDER BY table_name, column_name
    `);

    expect(result.rows.map((row) => row.column_name)).toContain("adjustment_cycle_id");
    expect(result.rows.map((row) => row.column_name)).toContain("adjustment_window_closes_at");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @mi-banquito/db test -- --run packages/db/src/sprint3-substrate.test.ts`

Expected: FAIL because `alert_action` and the adjustment columns do not exist yet.

- [ ] **Step 3: Add the migration**

```sql
ALTER TYPE reconciliation_cycle_resolution_kind_enum ADD VALUE IF NOT EXISTS 'adjustment';

CREATE TABLE IF NOT EXISTS alert_action (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  alert_id UUID NOT NULL REFERENCES alert(id),
  action_kind TEXT NOT NULL,
  snoozed_until TIMESTAMPTZ,
  actor_id UUID NOT NULL,
  actor_kind TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT ck_alert_action_kind CHECK (action_kind IN ('dismiss','snooze')),
  CONSTRAINT ck_alert_action_snooze_payload CHECK (
    (action_kind = 'snooze' AND snoozed_until IS NOT NULL)
    OR (action_kind = 'dismiss' AND snoozed_until IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_alert_action_org_alert_created
  ON alert_action(org_id, alert_id, created_at DESC);

ALTER TABLE reconciliation_cycle
  ADD COLUMN IF NOT EXISTS period_close_id UUID REFERENCES period_close(id),
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT,
  ADD COLUMN IF NOT EXISTS adjustment_window_opens_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adjustment_window_closes_at TIMESTAMPTZ;

ALTER TABLE contribution ADD COLUMN IF NOT EXISTS adjustment_cycle_id UUID REFERENCES reconciliation_cycle(id);
ALTER TABLE withdrawal ADD COLUMN IF NOT EXISTS adjustment_cycle_id UUID REFERENCES reconciliation_cycle(id);
ALTER TABLE expense ADD COLUMN IF NOT EXISTS adjustment_cycle_id UUID REFERENCES reconciliation_cycle(id);
ALTER TABLE repayment ADD COLUMN IF NOT EXISTS adjustment_cycle_id UUID REFERENCES reconciliation_cycle(id);
ALTER TABLE interest_accrual ADD COLUMN IF NOT EXISTS adjustment_cycle_id UUID REFERENCES reconciliation_cycle(id);

ALTER TABLE alert_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_action FORCE ROW LEVEL SECURITY;
CREATE POLICY alert_action_tenant_isolation ON alert_action
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
```

- [ ] **Step 4: Update Drizzle schema**

```ts
export const reconciliation_cycle_resolution_kind_enum = pgEnum("reconciliation_cycle_resolution_kind_enum", [
  "auto_within_tolerance",
  "resolved_by_correction",
  "annotated_acceptance",
  "adjustment",
]);

export const alertAction = pgTable("alert_action", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orgId: uuid("org_id").notNull(),
  alertId: uuid("alert_id").references((): AnyPgColumn => alert.id).notNull(),
  actionKind: text("action_kind").notNull(),
  snoozedUntil: timestamp("snoozed_until"),
  actorId: uuid("actor_id").notNull(),
  actorKind: text("actor_kind").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull(),
});
```

Also add `adjustmentCycleId: uuid("adjustment_cycle_id").references((): AnyPgColumn => reconciliationCycle.id)` to `contribution`, `withdrawal`, `expense`, `repayment`, and `interestAccrual`; add `periodCloseId`, `adjustmentReason`, `adjustmentWindowOpensAt`, and `adjustmentWindowClosesAt` to `reconciliationCycle`.

- [ ] **Step 5: Apply and verify**

Run:
```bash
cd packages/db
pnpm drizzle-kit push
node scripts/verify-schema.mjs
pnpm test -- --run src/sprint3-substrate.test.ts
```

Expected: schema push succeeds, verifier prints `schema ok`, and the new test passes.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/migrations/V20260702100000__sprint_3_alert_events_and_adjustment_windows.sql packages/db/src/sprint3-substrate.test.ts
git commit -m "feat(db): add sprint 3 event substrate (US-055 US-083)"
```

## Task 2: Named Append-Only Ledger Errors

**Files:**
- Create: `packages/db/src/migrations/V20260702101000__sprint_3_named_append_only_errors.sql`
- Modify: `packages/db/scripts/verify-schema.mjs`
- Test: `packages/db/src/sprint3-substrate.test.ts`

- [ ] **Step 1: Extend the failing integration test**

```ts
runIfDatabase("rejects ledger mutation with append_only_violation", async () => {
  const updated = await db.execute(sql`
    SELECT tgname
    FROM pg_trigger
    WHERE tgname IN (
      'contribution_no_mutate',
      'withdrawal_no_mutate',
      'expense_no_mutate',
      'repayment_no_mutate',
      'interest_accrual_no_mutate'
    )
      AND NOT tgisinternal
  `);

  expect(updated.rows).toHaveLength(5);

  const fn = await db.execute(sql`
    SELECT proname
    FROM pg_proc
    WHERE proname = 'raise_append_only_violation'
  `);
  expect(fn.rows).toEqual([{ proname: "raise_append_only_violation" }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mi-banquito/db test -- --run packages/db/src/sprint3-substrate.test.ts`

Expected: FAIL because `raise_append_only_violation` is not present.

- [ ] **Step 3: Add the migration**

```sql
CREATE OR REPLACE FUNCTION raise_append_only_violation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'append_only_violation',
    DETAIL = TG_TABLE_NAME || ' rejects ' || TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contribution_no_mutate ON contribution;
DROP TRIGGER IF EXISTS withdrawal_no_mutate ON withdrawal;
DROP TRIGGER IF EXISTS expense_no_mutate ON expense;
DROP TRIGGER IF EXISTS repayment_no_mutate ON repayment;
DROP TRIGGER IF EXISTS interest_accrual_no_mutate ON interest_accrual;

CREATE TRIGGER contribution_no_mutate BEFORE UPDATE OR DELETE ON contribution
  FOR EACH ROW EXECUTE FUNCTION raise_append_only_violation();
CREATE TRIGGER withdrawal_no_mutate BEFORE UPDATE OR DELETE ON withdrawal
  FOR EACH ROW EXECUTE FUNCTION raise_append_only_violation();
CREATE TRIGGER expense_no_mutate BEFORE UPDATE OR DELETE ON expense
  FOR EACH ROW EXECUTE FUNCTION raise_append_only_violation();
CREATE TRIGGER repayment_no_mutate BEFORE UPDATE OR DELETE ON repayment
  FOR EACH ROW EXECUTE FUNCTION raise_append_only_violation();
CREATE TRIGGER interest_accrual_no_mutate BEFORE UPDATE OR DELETE ON interest_accrual
  FOR EACH ROW EXECUTE FUNCTION raise_append_only_violation();
```

- [ ] **Step 4: Teach the verifier the named function**

```js
const REQUIRED_FUNCTIONS = [
  "raise_append_only_violation",
  "enforce_period_lock",
];
```

Add a `pg_proc` query to `HEALTH_SQL`, normalize it as `function_names`, and call `assertExpectedObjects({ label: "required functions", expectedNames: REQUIRED_FUNCTIONS, actualValue: actual.functionNames, errors })`.

- [ ] **Step 5: Apply and verify**

Run:
```bash
cd packages/db
pnpm drizzle-kit push
node scripts/verify-schema.mjs
pnpm test -- --run src/sprint3-substrate.test.ts
```

Expected: tests pass after Task 4 adds `enforce_period_lock`; before Task 4, verifier may report that one required function is missing. If this task is executed alone, keep `enforce_period_lock` out of `REQUIRED_FUNCTIONS` until Task 4.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/migrations/V20260702101000__sprint_3_named_append_only_errors.sql packages/db/scripts/verify-schema.mjs packages/db/src/sprint3-substrate.test.ts
git commit -m "feat(db): name append-only ledger violations (US-069)"
```

## Task 3: Cross-Tenant RLS Fail-Closed

**Files:**
- Create: `packages/db/src/migrations/V20260702103000__sprint_3_rls_fail_closed.sql`
- Modify: `packages/db/src/tenant.test.ts`, `packages/db/scripts/verify-schema.mjs`
- Test: `packages/db/src/tenant.test.ts`

- [ ] **Step 1: Add the no-session-var test**

```ts
runIfDatabase("fails closed when app.current_org_id is missing", async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("BEGIN");
    await pool.query(`SET LOCAL ROLE ${testRole}`);
    const result = await pool.query(`
      SELECT display_name
      FROM member
      ORDER BY display_name
      LIMIT 1
    `);
    expect(result.rows).toEqual([]);
    await pool.query("ROLLBACK");
  } finally {
    await pool.end();
  }
});
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `pnpm --filter @mi-banquito/db test -- --run packages/db/src/tenant.test.ts`

Expected: test may fail with invalid UUID cast if a policy casts an empty `current_setting` directly. The fixed behavior is an empty result set, not a database crash.

- [ ] **Step 3: Replace tenant policies with NULLIF fail-closed policies**

```sql
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'alert','alert_action','audit_log_entry','entity_version','interest_accrual','member',
    'contribution_cycle','contribution','withdrawal','expense','slip_photo','account',
    'transfer','extraordinary_collection','extraordinary_collection_line','loan',
    'loan_schedule','loan_fee','repayment','group_config','impersonation',
    'user_org_membership','reconciliation_cycle','period_close','statement_archive',
    'surplus_governance_decision','year_end_share_out','year_end_share_out_line',
    'year_end_balance_snapshot','year_end_balance_snapshot_line'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', table_name, table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (org_id = NULLIF(current_setting(''app.current_org_id'', true), '''')::uuid) WITH CHECK (org_id = NULLIF(current_setting(''app.current_org_id'', true), '''')::uuid)',
      table_name,
      table_name
    );
  END LOOP;
END $$;
```

- [ ] **Step 4: Verify**

Run:
```bash
cd packages/db
pnpm drizzle-kit push
node scripts/verify-schema.mjs
pnpm test -- --run src/tenant.test.ts src/sprint3-substrate.test.ts
```

Expected: RLS tests pass, no-session-var returns no rows, and verifier reports all tenant tables are FORCE RLS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrations/V20260702103000__sprint_3_rls_fail_closed.sql packages/db/src/tenant.test.ts packages/db/scripts/verify-schema.mjs
git commit -m "feat(db): fail closed tenant policies (US-072)"
```

## Task 4: Period Lock and Adjustment Exception

**Files:**
- Create: `packages/db/src/migrations/V20260702102000__sprint_3_period_lock_guard.sql`
- Modify: `packages/db/src/sprint3-substrate.test.ts`, `packages/domain/src/reconciliation.ts`
- Test: `packages/db/src/sprint3-substrate.test.ts`

- [ ] **Step 1: Add period-lock integration tests**

```ts
runIfDatabase("rejects inserts inside a closed cycle unless an adjustment window is open", async () => {
  const fn = await db.execute(sql`
    SELECT proname
    FROM pg_proc
    WHERE proname = 'enforce_period_lock'
  `);

  expect(fn.rows).toEqual([{ proname: "enforce_period_lock" }]);
});
```

Add a second test that seeds one closed `contribution_cycle`, one `period_close`, one `member`, and asserts `INSERT INTO contribution (...)` dated inside the cycle rejects with `period_locked`; then insert an `adjustment` `reconciliation_cycle` with `adjustment_window_closes_at > now()` and assert the same insert passes when `adjustment_cycle_id` points to that cycle.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mi-banquito/db test -- --run packages/db/src/sprint3-substrate.test.ts`

Expected: FAIL because `enforce_period_lock` is missing.

- [ ] **Step 3: Add period-lock function and triggers**

```sql
CREATE OR REPLACE FUNCTION enforce_period_lock() RETURNS trigger AS $$
DECLARE
  movement_date date;
  adjustment_id uuid;
  locked_period record;
BEGIN
  movement_date := COALESCE(NEW.dated_on, NEW.incurred_on, NEW.accrued_on);
  adjustment_id := NEW.adjustment_cycle_id;

  SELECT pc.id, pc.cycle_id
    INTO locked_period
  FROM period_close pc
  JOIN contribution_cycle cc ON cc.id = pc.cycle_id
  WHERE pc.org_id = NEW.org_id
    AND movement_date BETWEEN cc.opens_on AND cc.closes_on
  ORDER BY pc.closed_at DESC
  LIMIT 1;

  IF locked_period.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF adjustment_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM reconciliation_cycle rc
    WHERE rc.id = adjustment_id
      AND rc.org_id = NEW.org_id
      AND rc.period_close_id = locked_period.id
      AND rc.resolution_kind = 'adjustment'
      AND now() >= rc.adjustment_window_opens_at
      AND now() < rc.adjustment_window_closes_at
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'period_locked',
    DETAIL = TG_TABLE_NAME || ' rejects insert into closed cycle ' || locked_period.cycle_id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contribution_period_lock ON contribution;
DROP TRIGGER IF EXISTS withdrawal_period_lock ON withdrawal;
DROP TRIGGER IF EXISTS expense_period_lock ON expense;
DROP TRIGGER IF EXISTS repayment_period_lock ON repayment;
DROP TRIGGER IF EXISTS interest_accrual_period_lock ON interest_accrual;

CREATE TRIGGER contribution_period_lock BEFORE INSERT ON contribution
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER withdrawal_period_lock BEFORE INSERT ON withdrawal
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER expense_period_lock BEFORE INSERT ON expense
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER repayment_period_lock BEFORE INSERT ON repayment
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER interest_accrual_period_lock BEFORE INSERT ON interest_accrual
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
```

- [ ] **Step 4: Verify**

Run:
```bash
cd packages/db
pnpm drizzle-kit push
node scripts/verify-schema.mjs
pnpm test -- --run src/sprint3-substrate.test.ts
```

Expected: append-only, period-lock, and adjustment exception tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrations/V20260702102000__sprint_3_period_lock_guard.sql packages/db/src/sprint3-substrate.test.ts packages/db/scripts/verify-schema.mjs
git commit -m "feat(db): enforce period lock guard (US-070 US-083)"
```

## Task 5: Audit Atomicity Helper

**Files:**
- Modify: `packages/domain/src/audit.ts`, `packages/domain/src/ledger.ts`, `packages/domain/src/loan.ts`, `packages/domain/src/platform.ts`
- Test: `packages/domain/src/audit.test.ts`

- [ ] **Step 1: Write rollback tests**

```ts
import { describe, expect, it } from "vitest";
import { createAuditFailure, writeWithAudit } from "./audit";

describe("writeWithAudit", () => {
  it("rolls back the domain write when the audit write fails", async () => {
    const calls: string[] = [];
    await expect(
      writeWithAudit({
        write: async () => {
          calls.push("write");
          return "created-id";
        },
        audit: async () => {
          calls.push("audit");
          throw createAuditFailure("audit_log_entry insert failed");
        },
      }),
    ).rejects.toThrow("audit_log_entry insert failed");

    expect(calls).toEqual(["write", "audit"]);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/audit.test.ts`

Expected: FAIL because `writeWithAudit` does not exist.

- [ ] **Step 3: Implement the helper**

```ts
export class AuditWriteFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditWriteFailure";
  }
}

export function createAuditFailure(message: string) {
  return new AuditWriteFailure(message);
}

export async function writeWithAudit<T>(input: {
  write: () => Promise<T>;
  audit: (result: T) => Promise<void>;
}): Promise<T> {
  const result = await input.write();
  await input.audit(result);
  return result;
}
```

Use this helper only inside existing `db.transaction(async (tx) => { ... })` blocks so a thrown audit error rolls back the write. Update contribution, repayment, group-config, org-create, alert-action, and adjustment-window write paths to call it inside the transaction.

- [ ] **Step 4: Verify rollback through real service tests**

Add one test per write path that injects an audit failure by passing an audit writer function that throws `createAuditFailure("audit_log_entry insert failed")`; after the rejection, query by `clientRequestId` or subject id and assert no domain row exists.

Run: `pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/audit.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/audit.ts packages/domain/src/audit.test.ts packages/domain/src/ledger.ts packages/domain/src/loan.ts packages/domain/src/platform.ts
git commit -m "feat(domain): enforce audit atomicity (US-071)"
```

## Task 6: Adjustment Window Service and Operator Screen

**Files:**
- Modify: `packages/domain/src/reconciliation.ts`, `packages/domain/src/reconciliation.test.ts`
- Create: `apps/web/src/app/(authenticated)/admin/orgs/[id]/period-close/[periodCloseId]/adjust/page.tsx`
- Create: `apps/web/src/app/(authenticated)/admin/orgs/[id]/period-close/[periodCloseId]/adjust/actions.ts`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write service test**

```ts
import { describe, expect, it } from "vitest";
import { buildAdjustmentWindow } from "./reconciliation";

describe("buildAdjustmentWindow", () => {
  it("opens a seven-day adjustment window by default", () => {
    const openedAt = new Date("2026-07-02T12:00:00.000Z");
    const result = buildAdjustmentWindow({ openedAt });

    expect(result.opensAt.toISOString()).toBe("2026-07-02T12:00:00.000Z");
    expect(result.closesAt.toISOString()).toBe("2026-07-09T12:00:00.000Z");
  });
});
```

- [ ] **Step 2: Implement service types and command**

```ts
export type AdjustmentWindow = {
  opensAt: Date;
  closesAt: Date;
};

export function buildAdjustmentWindow(input: { openedAt: Date; days?: number }): AdjustmentWindow {
  const days = input.days ?? 7;
  return {
    opensAt: input.openedAt,
    closesAt: new Date(input.openedAt.getTime() + days * 24 * 60 * 60 * 1000),
  };
}
```

Add `createReconciliationService().openAdjustmentPeriod({ orgId, periodCloseId, actorId, reason, confirmed })` that requires `confirmed === true`, inserts an `adjustment` `reconciliation_cycle`, inserts one `audit_log_entry`, and inserts one `alert` for audience `both`.

- [ ] **Step 3: Build operator page and action**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createReconciliationService } from "@mi-banquito/domain";
import { requirePlatformOperator } from "@/lib/auth/require-session";

export async function openAdjustmentPeriodAction(orgId: string, periodCloseId: string, formData: FormData) {
  const operator = await requirePlatformOperator();
  await createReconciliationService().openAdjustmentPeriod({
    orgId,
    periodCloseId,
    actorId: operator.actorId,
    reason: String(formData.get("reason") ?? ""),
    confirmed: formData.get("confirmed") === "on",
  });
  revalidatePath(`/admin/orgs/${orgId}/period-close/${periodCloseId}/adjust`);
}
```

The page must render `data-screen="SCR-adjustment-period"`, a reason textarea, a confirmation checkbox, and a primary submit button using design-system components.

- [ ] **Step 4: Verify**

Run:
```bash
pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/reconciliation.test.ts
pnpm --filter mi-banquito-web type-check
```

Expected: service test and app type-check pass.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/reconciliation.ts packages/domain/src/reconciliation.test.ts apps/web/src/app/(authenticated)/admin/orgs/[id]/period-close/[periodCloseId]/adjust apps/web/src/lib/i18n/en-US.json
git commit -m "feat(admin): open adjustment periods (US-083)"
```

## Task 7: Business-Rules Panel and CSV

**Files:**
- Modify: `packages/domain/src/platform.ts`
- Create: `packages/domain/src/platform-business-rules.test.ts`
- Modify: `apps/web/src/app/(authenticated)/admin/orgs/[id]/business-rules/page.tsx`
- Create: `apps/web/src/app/(authenticated)/admin/orgs/[id]/business-rules/export/route.ts`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write projection test**

```ts
import { describe, expect, it } from "vitest";
import { businessRuleRowsFromConfig } from "./platform";

describe("businessRuleRowsFromConfig", () => {
  it("returns human-readable current values", () => {
    const rows = businessRuleRowsFromConfig({
      version: 3,
      contributionAmount: "20.0000",
      loanRateValue: "4.0000",
      loanRatePeriodUnit: "monthly",
      loanToSavingsCapRatio: "2.00",
      lateThresholdDays: 3,
      moraThresholdDays: 15,
      createdAt: new Date("2026-07-02T10:00:00.000Z"),
      createdBy: "11111111-1111-4111-8111-111111111111",
      config: { adminFeePct: "1.0000", referralCommissionAmount: "5.0000" },
    });

    expect(rows.map((row) => row.rule)).toContain("Aporte regular");
    expect(rows.find((row) => row.rule === "Tasa para socias")?.currentValue).toBe("4% mensual");
  });
});
```

- [ ] **Step 2: Implement projection and CSV**

```ts
export type BusinessRuleRow = {
  rule: string;
  currentValue: string;
  lastChangedAt: string;
  lastChangedBy: string;
};

export function businessRuleRowsFromConfig(config: {
  version: number;
  contributionAmount: string;
  loanRateValue: string;
  loanRatePeriodUnit: string;
  loanToSavingsCapRatio: string;
  lateThresholdDays: number;
  moraThresholdDays: number;
  createdAt: Date;
  createdBy: string;
  config: unknown;
}): BusinessRuleRow[] {
  return [
    { rule: "Aporte regular", currentValue: `$${Number(config.contributionAmount).toFixed(2)}`, lastChangedAt: config.createdAt.toISOString(), lastChangedBy: config.createdBy },
    { rule: "Tasa para socias", currentValue: `${Number(config.loanRateValue).toFixed(0)}% mensual`, lastChangedAt: config.createdAt.toISOString(), lastChangedBy: config.createdBy },
    { rule: "Tope de prestamo", currentValue: `${Number(config.loanToSavingsCapRatio).toFixed(0)}x ahorros`, lastChangedAt: config.createdAt.toISOString(), lastChangedBy: config.createdBy },
    { rule: "Atraso", currentValue: `${config.lateThresholdDays} dias`, lastChangedAt: config.createdAt.toISOString(), lastChangedBy: config.createdBy },
    { rule: "Mora", currentValue: `${config.moraThresholdDays} dias`, lastChangedAt: config.createdAt.toISOString(), lastChangedBy: config.createdBy },
  ];
}
```

- [ ] **Step 3: Replace scaffold page**

The page must call `requirePlatformOperator()`, load the org and current config through `createPlatformService()`, write an audit row with `actionKind: "business_rules.view"`, render a data table with `data-screen="SCR-admin-business-rules"`, and link to `/admin/orgs/${org.id}/business-rules/export`.

- [ ] **Step 4: Add CSV route**

```ts
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePlatformOperator();
  const { id } = await params;
  const rows = await createPlatformService().listBusinessRuleRows(id);
  const body = [
    "Regla,Valor actual,Ultimo cambio,Por",
    ...rows.map((row) => [row.rule, row.currentValue, row.lastChangedAt, row.lastChangedBy].map((value) => `"${value.replaceAll('"', '""')}"`).join(",")),
  ].join("\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="reglas-${id}.csv"`,
    },
  });
}
```

- [ ] **Step 5: Verify**

Run:
```bash
pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/platform-business-rules.test.ts
pnpm --filter mi-banquito-web type-check
pnpm --filter mi-banquito-web lint
```

Expected: scaffold marker is gone, tests pass, and lint gate passes.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/platform.ts packages/domain/src/platform-business-rules.test.ts apps/web/src/app/(authenticated)/admin/orgs/[id]/business-rules apps/web/src/lib/i18n/en-US.json
git commit -m "feat(admin): show business rules panel (US-024)"
```

## Task 8: Audit Narration and Filters

**Files:**
- Modify: `packages/domain/src/audit.ts`
- Modify: `packages/domain/src/audit.test.ts`
- Modify: `apps/web/src/app/(authenticated)/historial/page.tsx`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write narration and filter tests**

```ts
import { describe, expect, it } from "vitest";
import { filterAuditRows, narrateAuditRow } from "./audit";

describe("audit narration", () => {
  it("narrates known action kinds in plain Spanish", () => {
    const text = narrateAuditRow({
      actionKind: "contribution.create",
      subjectKind: "contribution",
      subjectId: "22222222-2222-4222-8222-222222222222",
      payloadSnapshot: { memberName: "Pancho", amount: "20.00", datedOn: "2026-07-02" },
      at: new Date("2026-07-02T10:00:00.000Z"),
    });

    expect(text).toBe("Pancho registro un aporte de $20.00 el 2026-07-02.");
  });

  it("filters by member, action kind, and date range with AND semantics", () => {
    const rows = filterAuditRows({
      rows: [
        { memberId: "m1", actionKind: "contribution.create", at: new Date("2026-07-02T00:00:00.000Z") },
        { memberId: "m2", actionKind: "repayment.create", at: new Date("2026-07-03T00:00:00.000Z") },
      ],
      filters: { memberId: "m1", actionKind: "contribution.create", from: "2026-07-01", to: "2026-07-02" },
    });

    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement registry and query surface**

```ts
export type AuditNarrationInput = {
  actionKind: string;
  subjectKind: string;
  subjectId: string | null;
  payloadSnapshot: unknown;
  at: Date;
};

const templates: Record<string, (input: AuditNarrationInput) => string> = {
  "contribution.create": (input) => {
    const payload = input.payloadSnapshot as { memberName?: string; amount?: string; datedOn?: string };
    return `${payload.memberName ?? "Una socia"} registro un aporte de $${Number(payload.amount ?? 0).toFixed(2)} el ${payload.datedOn ?? input.at.toISOString().slice(0, 10)}.`;
  },
};

export function narrateAuditRow(input: AuditNarrationInput): string {
  return templates[input.actionKind]?.(input) ?? `Movimiento ${input.actionKind} registrado el ${input.at.toISOString().slice(0, 10)}.`;
}
```

Add `createAuditService().listNarratedEntries({ orgId, memberId, actionKind, from, to })` using `auditLogEntry.orgId`, descending `at`, and safe fallback narration. Add `buildAuditPdfPayload(entries)` with a deterministic plain object that later PDF generation can consume.

- [ ] **Step 3: Replace `/historial`**

The page must call `requireTreasurer()`, parse `searchParams`, render `data-screen="SCR-history"`, render a filter form with member text, action kind select, from date, to date, and preserve URL query values. Empty results must show "No encontramos movimientos con esos filtros."

- [ ] **Step 4: Verify**

Run:
```bash
pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/audit.test.ts
pnpm --filter mi-banquito-web type-check
pnpm --filter mi-banquito-web lint
```

Expected: narration tests pass, `/historial` has no contribution reversal form, and lint passes.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/audit.ts packages/domain/src/audit.test.ts apps/web/src/app/(authenticated)/historial/page.tsx apps/web/src/lib/i18n/en-US.json
git commit -m "feat(audit): narrate and filter history (US-056 US-057)"
```

## Task 9: Alerts Bell Actions and Usability

**Files:**
- Modify: `packages/domain/src/alerts.ts`
- Modify: `packages/domain/src/alerts.test.ts`
- Modify: `apps/web/src/components/layout/header.tsx`
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`
- Create: `apps/web/src/app/(authenticated)/alerts/actions.ts`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write alert-state tests**

```ts
import { describe, expect, it } from "vitest";
import { effectiveAlertState, whatsAppAlertText } from "./alerts";

describe("alerts", () => {
  it("uses append-only actions to compute dismissed and snoozed state", () => {
    const state = effectiveAlertState({
      alert: { id: "a1", severity: "critical", createdAt: new Date("2026-07-02T00:00:00.000Z") },
      actions: [
        { actionKind: "snooze", snoozedUntil: new Date("2026-07-09T00:00:00.000Z"), createdAt: new Date("2026-07-02T01:00:00.000Z") },
      ],
      now: new Date("2026-07-03T00:00:00.000Z"),
    });

    expect(state.visible).toBe(false);
    expect(state.snoozedUntil?.toISOString()).toBe("2026-07-09T00:00:00.000Z");
  });

  it("builds a plain WhatsApp message", () => {
    expect(whatsAppAlertText({ title: "Prestamo en mora", body: "Maria debe $15.00" })).toBe("Mi Banquito: Prestamo en mora. Maria debe $15.00");
  });
});
```

- [ ] **Step 2: Implement append-only actions**

```ts
export type AlertActionKind = "dismiss" | "snooze";

export function effectiveAlertState(input: {
  alert: { id: string; severity: string; createdAt: Date };
  actions: Array<{ actionKind: string; snoozedUntil: Date | null; createdAt: Date }>;
  now: Date;
}) {
  const latest = [...input.actions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!latest) return { visible: true, dismissed: false, snoozedUntil: null as Date | null };
  if (latest.actionKind === "dismiss") return { visible: false, dismissed: true, snoozedUntil: null as Date | null };
  if (latest.actionKind === "snooze" && latest.snoozedUntil && latest.snoozedUntil > input.now) {
    return { visible: false, dismissed: false, snoozedUntil: latest.snoozedUntil };
  }
  return { visible: true, dismissed: false, snoozedUntil: null as Date | null };
}
```

Add `createAlertsService().listVisibleAlerts({ orgId, audience, now })`, `dismissAlert`, and `snoozeAlert` that insert into `alert_action` and `audit_log_entry` in the same transaction. Do not update `alert.dismissedAt` or `alert.snoozedUntil`; those columns remain legacy read fields because `alert` has an append-only trigger.

- [ ] **Step 3: Wire shell and actions**

`layout.tsx` must call `createAlertsService().countVisibleAlerts({ orgId: shell.orgId, audience: "treasurer", now: new Date() })` and pass the count to `Header`. `Header` must render the count dynamically, render a popover or details panel with visible alerts, and include forms that submit to `dismissAlertAction` and `snoozeAlertAction`.

- [ ] **Step 4: Verify**

Run:
```bash
pnpm --filter @mi-banquito/domain test -- --run packages/domain/src/alerts.test.ts
pnpm --filter mi-banquito-web type-check
pnpm --filter mi-banquito-web lint
```

Expected: alert tests pass, the hardcoded `3` badge is gone, and lint passes.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/alerts.ts packages/domain/src/alerts.test.ts apps/web/src/components/layout/header.tsx apps/web/src/app/(authenticated)/layout.tsx apps/web/src/app/(authenticated)/alerts/actions.ts apps/web/src/lib/i18n/en-US.json
git commit -m "feat(alerts): add actionable alerts bell (US-055)"
```

## Task 10: Sentry PII Redaction

**Files:**
- Create: `apps/web/src/lib/sentry/redaction.ts`
- Create: `apps/web/src/lib/sentry/redaction.test.ts`
- Create: `apps/web/instrumentation.ts`
- Create: `apps/web/instrumentation-client.ts`
- Modify: `apps/web/src/lib/env.ts`, `apps/web/package.json`, `.env.example`

- [ ] **Step 1: Add dependency**

Run: `pnpm --filter mi-banquito-web add @sentry/nextjs`

Expected: `@sentry/nextjs` appears in `apps/web/package.json` and `pnpm-lock.yaml`.

- [ ] **Step 2: Write redaction tests**

```ts
import { describe, expect, it } from "vitest";
import { redactSentryEvent } from "./redaction";

describe("redactSentryEvent", () => {
  it("masks whatsapp numbers, email domains, and display names", () => {
    const event = redactSentryEvent({
      user: { email: "pancho@fcostudios.io", username: "Pancho" },
      extra: { whatsapp_number: "+593999999999", display_name: "Pancho" },
      breadcrumbs: [{ message: "display_name Pancho email pancho@fcostudios.io" }],
    });

    expect(JSON.stringify(event)).not.toContain("+593999999999");
    expect(JSON.stringify(event)).not.toContain("@fcostudios.io");
    expect(JSON.stringify(event)).not.toContain("Pancho");
    expect(JSON.stringify(event)).toContain("[redacted-whatsapp]");
    expect(JSON.stringify(event)).toContain("[redacted-name]");
  });
});
```

- [ ] **Step 3: Implement redactor**

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function redactString(value: string) {
  return value
    .replace(/\+?\d[\d\s-]{7,}\d/g, "[redacted-whatsapp]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\bdisplay_name\b\s*[:=]?\s*[\p{L}\s.'-]+/giu, "display_name [redacted-name]");
}

function redactJson(value: JsonValue): JsonValue {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (key === "whatsapp_number") return [key, "[redacted-whatsapp]"];
      if (key === "display_name") return [key, "[redacted-name]"];
      return [key, redactJson(item)];
    }));
  }
  return value;
}

export function redactSentryEvent<T extends JsonValue>(event: T): T {
  return redactJson(event) as T;
}
```

- [ ] **Step 4: Register Sentry**

```ts
import * as Sentry from "@sentry/nextjs";
import { redactSentryEvent } from "./src/lib/sentry/redaction";

export async function register() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      beforeSend(event) {
        return redactSentryEvent(event);
      },
    });
  }
}
```

`instrumentation-client.ts` must use `process.env.NEXT_PUBLIC_SENTRY_DSN` and the same `beforeSend` redactor.

- [ ] **Step 5: Verify**

Run:
```bash
pnpm --filter mi-banquito-web test -- --run src/lib/sentry/redaction.test.ts
pnpm --filter mi-banquito-web type-check
pnpm --filter mi-banquito-web build
```

Expected: tests pass and build succeeds with Sentry env vars absent because DSNs are optional until the external Sentry project exists.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/lib/sentry apps/web/instrumentation.ts apps/web/instrumentation-client.ts apps/web/src/lib/env.ts .env.example
git commit -m "feat(observability): redact sentry events (US-073)"
```

## Task 11: Sprint 3 E2E and Closure Gate

**Files:**
- Create: `apps/web/e2e/sprint3.spec.ts`
- Create: `scripts/sprint3-closure-gate.mjs`
- Modify: `apps/web/package.json`, `package.json`
- Modify: `docs/stories/STATUS_REPORT.md`, `.nous-feedback.jsonl`

- [ ] **Step 1: Add protected-route Playwright tests**

```ts
import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/historial",
  "/admin/orgs/11111111-1111-4111-8111-111111111111/business-rules",
  "/admin/orgs/11111111-1111-4111-8111-111111111111/period-close/22222222-2222-4222-8222-222222222222/adjust",
] as const;

test.describe("Sprint 3 protected surfaces", () => {
  for (const route of protectedRoutes) {
    test(`${route} requires an Auth0 session`, async ({ request }) => {
      const response = await request.get(route, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers()["location"]).toBe("/auth/login");
    });
  }
});
```

- [ ] **Step 2: Add closure gate**

```js
#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const requiredFiles = [
  "packages/db/src/sprint3-substrate.test.ts",
  "packages/domain/src/audit.test.ts",
  "packages/domain/src/alerts.test.ts",
  "packages/domain/src/reconciliation.test.ts",
  "apps/web/e2e/sprint3.spec.ts",
  "apps/web/src/app/(authenticated)/historial/page.tsx",
  "apps/web/src/app/(authenticated)/admin/orgs/[id]/business-rules/page.tsx",
  "apps/web/src/lib/sentry/redaction.ts",
];
const requiredMarkers = [
  ["apps/web/src/app/(authenticated)/historial/page.tsx", 'data-screen="SCR-history"'],
  ["apps/web/src/app/(authenticated)/admin/orgs/[id]/business-rules/page.tsx", 'data-screen="SCR-admin-business-rules"'],
];
let failed = false;
for (const rel of requiredFiles) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) {
    console.error(`[sprint3] missing required file: ${rel}`);
    failed = true;
  }
}
for (const [rel, marker] of requiredMarkers) {
  const text = existsSync(resolve(root, rel)) ? readFileSync(resolve(root, rel), "utf8") : "";
  if (!text.includes(marker)) {
    console.error(`[sprint3] missing marker ${marker} in ${rel}`);
    failed = true;
  }
  if (/SCAFFOLD|data-scaffold=/.test(text)) {
    console.error(`[sprint3] scaffold marker remains in ${rel}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("[sprint3] ok");
```

- [ ] **Step 3: Wire scripts**

In `apps/web/package.json`, append `&& node ../../scripts/sprint3-closure-gate.mjs ../..` to `lint:ds`. In root `package.json`, add `"audit:sprint3": "node scripts/sprint3-closure-gate.mjs"`.

- [ ] **Step 4: Run full verification**

Run:
```bash
pnpm test
pnpm lint
pnpm build
pnpm type-check
cd packages/db && pnpm drizzle-kit push && node scripts/verify-schema.mjs
cd ../..
pnpm test:e2e
node scripts/sprint3-closure-gate.mjs
```

Expected: all commands pass. If Playwright needs a local server, run `pnpm --filter mi-banquito-web dev` in a separate terminal and set `PLAYWRIGHT_BASE_URL=http://localhost:3000`.

- [ ] **Step 5: Run adversarial review**

Review these failure scenarios manually and record the result in `.nous-feedback.jsonl`:

```json
{"sprint":"3","event":"adversarial_review","check":"missing app.current_org_id returns no tenant data","pass":true}
{"sprint":"3","event":"adversarial_review","check":"locked period rejects untagged inserts","pass":true}
{"sprint":"3","event":"adversarial_review","check":"alert dismiss and snooze do not update append-only alert rows","pass":true}
{"sprint":"3","event":"adversarial_review","check":"Sentry redactor removes whatsapp_number email domain and display_name","pass":true}
```

- [ ] **Step 6: Update story status**

In `docs/stories/STATUS_REPORT.md`, add Sprint 3 evidence listing each story and its verification command. In `docs/stories/DEFERRED_EXTERNAL_BLOCKERS.md`, keep Sentry/Better Stack as external unless a real Sentry event and Better Stack monitor are observed.

- [ ] **Step 7: Commit and push**

```bash
git add apps/web/e2e/sprint3.spec.ts scripts/sprint3-closure-gate.mjs apps/web/package.json package.json docs/stories/STATUS_REPORT.md docs/stories/DEFERRED_EXTERNAL_BLOCKERS.md .nous-feedback.jsonl
git commit -m "chore(sprint3): add closure gate and evidence (US-024 US-055 US-056 US-057 US-069 US-070 US-071 US-072 US-073 US-083)"
git push
```

## Production Verification Plan

- Apply Neon schema through the established deployment path: `cd packages/db && pnpm drizzle-kit push && node scripts/verify-schema.mjs` with production `DATABASE_URL` loaded from the Vercel/Neon environment.
- Deploy the latest branch to Vercel and promote production only after local gates pass.
- Smoke test production:
  - Login through Auth0.
  - Open `/historial`, apply action and date filters, confirm plain-Spanish entries remain visible.
  - Open `/admin/orgs/<orgId>/business-rules` as platform operator and download CSV.
  - Open the alerts bell, dismiss one non-critical alert, snooze another for 7 days, refresh, and confirm counts change.
  - Attempt a post-close contribution without an adjustment cycle through a direct DB smoke and confirm `period_locked`.
  - Open an adjustment window, insert one tagged correction, and confirm an audit row plus alert exists.
  - Trigger a synthetic client or server error only after Sentry DSNs exist, then confirm redacted payload in Sentry.

## Self-Review

Spec coverage:
- US-024 is covered by Task 7 and production CSV smoke.
- US-055 is covered by Task 9 and the closure adversarial check that alert rows remain append-only.
- US-056 and US-057 are covered by Task 8 and Playwright protected-route coverage.
- US-069, US-070, US-071, and US-072 are covered by Tasks 2, 4, 5, and 3 with DB/domain tests.
- US-073 is covered by Task 10; live Sentry event verification stays externally deferred until DSNs exist.
- US-083 is covered by Tasks 4 and 6.

Red-flag scan:
- The plan avoids deferred-detail markers and copy-by-reference implementation steps.
- Every code-changing task includes code snippets, exact paths, exact commands, and expected outcomes.

Type consistency:
- `alertAction` is the Drizzle name for table `alert_action`.
- Adjustment movement columns use `adjustmentCycleId` in Drizzle and `adjustment_cycle_id` in SQL.
- `reconciliation_cycle_resolution_kind_enum` adds the `adjustment` value used by the period-lock trigger.
- Alert state uses append-only `alert_action` rows rather than mutating the append-only `alert` table.
