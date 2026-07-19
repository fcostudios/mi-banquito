# US-008 Neon Schema Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close US-008 AC-3, AC-7, and AC-8 with fail-closed tenant policies, the missing fiscal-year interest-gains materialized view, and isolated Neon verification for trusted pull requests.

**Architecture:** Two immutable additive migrations own the database changes: one creates the materialized view and unique index, and one reconciles every public `org_id` table to the canonical RLS policy. The schema verifier checks both object presence and policy semantics; the local schema applier recognizes this narrow repair on a production-derived branch. The existing local PostgreSQL CI gate remains intact and a trusted-PR-only Neon branch gate is added alongside it.

**Tech Stack:** PostgreSQL 17/18, Drizzle ORM 0.38, Node.js 22, Vitest 4, GitHub Actions, `neondatabase/create-branch-action@v6`, Neon Serverless Postgres.

---

## File map

- Create `packages/db/src/migrations/V20260719115010__interest_gains_fiscal_year_view.sql`: immutable view and unique-index migration.
- Create `packages/db/src/migrations/V20260719115020__fail_closed_tenant_policies.sql`: idempotent policy reconciliation for every public tenant table.
- Create `packages/db/src/interest-gains-schema.test.ts`: Drizzle contract plus real-Postgres fiscal-boundary, aggregation, currency, and tenant-isolation tests.
- Create `packages/db/src/fail-closed-rls.test.ts`: real-Postgres missing/empty/correct/wrong tenant policy tests.
- Create `packages/db/scripts/neon-ci-workflow.test.mjs`: static contract for trusted PR isolation, expiration, official action, double verification, and DB test commands.
- Modify `packages/db/src/schema.ts`: export the existing materialized-view declaration.
- Modify `packages/db/scripts/verify-schema.mjs`: collect and require canonical fail-closed policy definitions.
- Modify `packages/db/scripts/verify-schema.test.mjs`: unit contracts for valid and stale policy definitions and the required view/index.
- Modify `packages/db/scripts/apply-local-schema.mjs`: apply only the two US-008 repairs when an inherited schema is otherwise healthy.
- Modify `packages/db/src/tenant.test.ts`: grant the test role to the current Neon branch owner so `SET ROLE` is portable.
- Modify `.github/workflows/ci.yml`: add the expiring trusted-PR Neon branch and migration/test/idempotency gate.
- Modify `docs/superpowers/plans/2026-07-19-us008-neon-schema-closure.md`: mark each completed step during execution.

### Task 1: Make policy semantics part of schema health

**Files:**
- Modify: `packages/db/scripts/verify-schema.test.mjs`
- Modify: `packages/db/scripts/verify-schema.mjs`

- [x] **Step 1: Write the failing verifier tests**

Add `failClosedPolicyTables: EXPECTED_POLICY_TABLES` to healthy fixtures and add this stale-policy case:

```js
it("fails when tenant policies exist but are not fail closed", () => {
  const result = evaluateSchemaHealth({
    tableNames: EXPECTED_TABLE_NAMES,
    rlsTableNames: EXPECTED_RLS_TABLE_NAMES,
    forcedRlsTableNames: EXPECTED_FORCED_RLS_TABLE_NAMES,
    policyTables: EXPECTED_POLICY_TABLES,
    failClosedPolicyTables: EXPECTED_POLICY_TABLES.slice(1),
    triggerTables: EXPECTED_TRIGGER_TABLES,
    materializedViewNames: EXPECTED_MATERIALIZED_VIEW_NAMES,
    indexNames: EXPECTED_INDEX_NAMES,
    checkConstraintNames: EXPECTED_CHECK_CONSTRAINT_NAMES,
    uniqueConstraintNames: EXPECTED_UNIQUE_CONSTRAINT_NAMES,
    foreignKeyConstraintNames: EXPECTED_FOREIGN_KEY_CONSTRAINT_NAMES,
    functionNames: REQUIRED_FUNCTIONS,
    updatedAtTables: EXPECTED_UPDATED_AT_TABLES,
    updatedAtTriggerTables: EXPECTED_UPDATED_AT_TABLES,
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain(
    `missing fail-closed policies on tables: ${EXPECTED_POLICY_TABLES[0]}`,
  );
});
```

- [x] **Step 2: Run the verifier tests and confirm RED**

Run: `rtk pnpm --filter @mi-banquito/db exec vitest run scripts/verify-schema.test.mjs`

Expected: FAIL because `evaluateSchemaHealth` does not inspect `failClosedPolicyTables`.

- [x] **Step 3: Implement policy-definition collection and evaluation**

Extend `HEALTH_SQL` with `fail_closed_policy_tables`, selecting policies whose `qual` and `with_check` both contain `NULLIF`, `app.current_org_id`, and tenant equality. Normalize it as `failClosedPolicyTables`, then add:

```js
assertExpectedObjects({
  label: "fail-closed policies on tables",
  expectedNames: expected.policyTables,
  actualValue: actual.failClosedPolicyTables ?? [],
  errors,
});
```

The SQL predicate must require the canonical policy name and both expressions:

```sql
policyname = tablename || '_tenant_isolation'
AND qual ILIKE '%org_id%nullif%app.current_org_id%'
AND with_check ILIKE '%org_id%nullif%app.current_org_id%'
```

- [x] **Step 4: Run the verifier tests and confirm GREEN**

Run: `rtk pnpm --filter @mi-banquito/db exec vitest run scripts/verify-schema.test.mjs`

Expected: PASS.

- [x] **Step 5: Commit the verifier contract**

```bash
rtk git add packages/db/scripts/verify-schema.mjs packages/db/scripts/verify-schema.test.mjs
rtk git commit -m "test(db): verify fail-closed tenant policies (US-008)"
```

### Task 2: Add the fiscal-year interest-gains view

**Files:**
- Create: `packages/db/src/interest-gains-schema.test.ts`
- Create: `packages/db/src/migrations/V20260719115010__interest_gains_fiscal_year_view.sql`
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Write the failing Drizzle and migration contract**

Create a test importing `interestGainsPerFiscalYear` and assert this exact shape:

```ts
expect({
  orgId: interestGainsPerFiscalYear.orgId.name,
  fiscalYear: interestGainsPerFiscalYear.fiscalYear.name,
  interestGains: interestGainsPerFiscalYear.interestGains.name,
  currencyCode: interestGainsPerFiscalYear.currencyCode.name,
  refreshedAt: interestGainsPerFiscalYear.refreshedAt.name,
}).toEqual({
  orgId: "org_id",
  fiscalYear: "fiscal_year",
  interestGains: "interest_gains",
  currencyCode: "currency_code",
  refreshedAt: "refreshed_at",
});
expect(migration).toContain("CREATE MATERIALIZED VIEW IF NOT EXISTS mv_interest_gains_per_fiscal_year");
expect(migration).toContain("idx_mv_interest_gains_per_fiscal_year_org_year");
```

- [ ] **Step 2: Run the schema contract and confirm RED**

Run: `rtk pnpm --filter @mi-banquito/db exec vitest run src/interest-gains-schema.test.ts`

Expected: FAIL because the export and migration do not exist.

- [ ] **Step 3: Add the Drizzle existing-view declaration**

Add after the other fiscal read models in `schema.ts`:

```ts
export const interestGainsPerFiscalYear = pgMaterializedView("mv_interest_gains_per_fiscal_year", {
  orgId: uuid("org_id").notNull(),
  fiscalYear: integer("fiscal_year").notNull(),
  interestGains: numeric("interest_gains", { precision: 18, scale: 4 }).notNull(),
  currencyCode: text("currency_code").notNull(),
  refreshedAt: timestamp("refreshed_at").notNull(),
}).existing();
```

- [ ] **Step 4: Add the immutable view migration**

Use an active-config CTE (`valid_to IS NULL`, latest `valid_from`) and derive the fiscal label as the year in which the fiscal period starts:

```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_interest_gains_per_fiscal_year AS
WITH active_config AS (
  SELECT DISTINCT ON (gc.org_id)
    gc.org_id,
    gc.fiscal_year_start_month,
    gc.fiscal_year_start_day
  FROM group_config gc
  WHERE gc.valid_to IS NULL
  ORDER BY gc.org_id, gc.valid_from DESC
)
SELECT
  ia.org_id,
  CASE
    WHEN ia.accrued_on >= make_date(
      EXTRACT(YEAR FROM ia.accrued_on)::integer,
      COALESCE(ac.fiscal_year_start_month, 1),
      COALESCE(ac.fiscal_year_start_day, 1)
    ) THEN EXTRACT(YEAR FROM ia.accrued_on)::integer
    ELSE EXTRACT(YEAR FROM ia.accrued_on)::integer - 1
  END AS fiscal_year,
  SUM(ia.interest_amount)::NUMERIC(18, 4) AS interest_gains,
  o.currency_code,
  now() AS refreshed_at
FROM interest_accrual ia
JOIN organization o ON o.id = ia.org_id
LEFT JOIN active_config ac ON ac.org_id = ia.org_id
GROUP BY ia.org_id, fiscal_year, o.currency_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_interest_gains_per_fiscal_year_org_year
  ON mv_interest_gains_per_fiscal_year(org_id, fiscal_year);
```

- [ ] **Step 5: Run the schema contract and confirm GREEN**

Run: `rtk pnpm --filter @mi-banquito/db exec vitest run src/interest-gains-schema.test.ts`

Expected: the static contract passes; the DB case skips when no `DATABASE_URL` is present.

- [ ] **Step 6: Add the real-Postgres fiscal-boundary test**

Within one transaction create two organizations, active configs with an April 1 fiscal boundary, one member and loan per org, and accruals on `2026-03-31`, `2026-04-01`, `2026-04-15`, and another tenant. Refresh the view and assert:

```ts
expect(rows.rows).toEqual([
  { org_id: orgA, fiscal_year: 2025, interest_gains: "10.0000", currency_code: "USD" },
  { org_id: orgA, fiscal_year: 2026, interest_gains: "25.5000", currency_code: "USD" },
]);
expect(rows.rows.every((row) => row.org_id === orgA)).toBe(true);
```

- [ ] **Step 7: Run the real-Postgres test and confirm GREEN**

Run with the local CI database: `rtk pnpm --filter @mi-banquito/db exec vitest run src/interest-gains-schema.test.ts`

Expected: PASS with exact boundary, sum, currency, and tenant assertions.

- [ ] **Step 8: Commit the view**

```bash
rtk git add packages/db/src/schema.ts packages/db/src/interest-gains-schema.test.ts packages/db/src/migrations/V20260719115010__interest_gains_fiscal_year_view.sql
rtk git commit -m "feat(db): add fiscal-year interest gains view (US-008)"
```

### Task 3: Reconcile tenant policies and the inherited-schema repair path

**Files:**
- Create: `packages/db/src/fail-closed-rls.test.ts`
- Create: `packages/db/src/migrations/V20260719115020__fail_closed_tenant_policies.sql`
- Modify: `packages/db/scripts/apply-local-schema.mjs`
- Modify: `packages/db/src/tenant.test.ts`

- [ ] **Step 1: Write the failing real-Postgres RLS test**

Create the `mi_banquito_rls_test` NOLOGIN role, grant it to `current_user`, grant schema/table access, and in isolated transactions assert:

```ts
await client.query(`SET LOCAL ROLE ${testRole}`);
expect((await client.query("SELECT id FROM member")).rows).toEqual([]);
await client.query("SET LOCAL app.current_org_id = ''");
expect((await client.query("SELECT id FROM member")).rows).toEqual([]);
await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgA]);
expect((await client.query("SELECT org_id FROM member")).rows).toEqual([{ org_id: orgA }]);
await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgB]);
expect((await client.query("SELECT org_id FROM member")).rows).toEqual([{ org_id: orgB }]);
```

Also attempt an insert whose `org_id` differs from the current setting and assert PostgreSQL error `42501`, proving `WITH CHECK`.

- [ ] **Step 2: Run the RLS test against the stale inherited branch and confirm RED**

Run: `rtk pnpm --filter @mi-banquito/db exec vitest run src/fail-closed-rls.test.ts`

Expected: FAIL with `22P02` for missing/empty context or a policy-definition verifier failure.

- [ ] **Step 3: Add the idempotent reconciliation migration**

Iterate public base tables with `org_id`, validate identifiers through `format('%I', ...)`, and execute for each table:

```sql
ALTER TABLE %I ENABLE ROW LEVEL SECURITY;
ALTER TABLE %I FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS %I ON %I;
CREATE POLICY %I ON %I
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
```

- [ ] **Step 4: Add the narrow US-008 repair branch**

Define URLs for both new migrations and accept only these health errors:

```js
const US_008_REPAIR_OBJECTS = new Set([
  "mv_interest_gains_per_fiscal_year",
  "idx_mv_interest_gains_per_fiscal_year_org_year",
]);
```

The predicate must reject missing tables, functions, triggers, constraints, or any unexpected object. For an accepted inherited schema, execute the view migration, the policy migration, and `installLocalSubstrate(pool)`, then collect health again and fail unless `evaluateSchemaHealth` is green.

- [ ] **Step 5: Make the shared tenant test portable to Neon**

In `tenant.test.ts` add this after role creation:

```sql
GRANT ${testRole} TO CURRENT_USER;
```

This changes only test authority on disposable/local databases and does not alter application roles or policies.

- [ ] **Step 6: Apply locally and confirm GREEN**

Run:

```bash
rtk env ALLOW_NON_LOCAL_SCHEMA_APPLY=1 node packages/db/scripts/apply-local-schema.mjs
rtk node packages/db/scripts/verify-schema.mjs
rtk pnpm --filter @mi-banquito/db exec vitest run src/fail-closed-rls.test.ts src/tenant.test.ts src/sprint3-substrate.test.ts
```

Expected: schema apply and verification succeed; all selected tests pass.

- [ ] **Step 7: Re-run apply and verification to prove idempotency**

Run:

```bash
rtk env ALLOW_NON_LOCAL_SCHEMA_APPLY=1 node packages/db/scripts/apply-local-schema.mjs
rtk node packages/db/scripts/verify-schema.mjs
```

Expected: both commands exit 0 and report an already verified schema/reconciled policies.

- [ ] **Step 8: Commit the policy and repair path**

```bash
rtk git add packages/db/src/migrations/V20260719115020__fail_closed_tenant_policies.sql packages/db/scripts/apply-local-schema.mjs packages/db/src/fail-closed-rls.test.ts packages/db/src/tenant.test.ts
rtk git commit -m "fix(db): reconcile fail-closed tenant RLS (US-008)"
```

### Task 4: Add the trusted-PR Neon CI gate

**Files:**
- Create: `packages/db/scripts/neon-ci-workflow.test.mjs`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the failing workflow contract**

Read `.github/workflows/ci.yml` and assert it contains:

```js
expect(workflow).toContain("neondatabase/create-branch-action@v6");
expect(workflow).toContain("github.event.pull_request.head.repo.full_name == github.repository");
expect(workflow).toContain("expires_at:");
expect(workflow).toContain("${{ steps.create_neon_branch.outputs.db_url }}");
expect(workflow.match(/node scripts\/verify-schema\.mjs/g)).toHaveLength(3);
expect(workflow).toContain("src/tenant.test.ts");
expect(workflow).toContain("src/sprint3-substrate.test.ts");
expect(workflow).toContain("src/interest-gains-schema.test.ts");
expect(workflow).toContain("src/fail-closed-rls.test.ts");
```

The expected verifier count is one local run plus two Neon runs.

- [ ] **Step 2: Run the workflow contract and confirm RED**

Run: `rtk pnpm --filter @mi-banquito/db exec vitest run scripts/neon-ci-workflow.test.mjs`

Expected: FAIL because CI has no Neon branch action.

- [ ] **Step 3: Add the trusted-PR Neon workflow steps**

After dependency installation, calculate a 24-hour RFC3339 expiry and create a branch only for same-repository PRs:

```yaml
- name: Set Neon branch expiration
  if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository
  run: echo "NEON_EXPIRES_AT=$(date -u --date '+24 hours' +'%Y-%m-%dT%H:%M:%SZ')" >> "$GITHUB_ENV"
- name: Create Neon verification branch
  id: create_neon_branch
  if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository
  uses: neondatabase/create-branch-action@v6
  with:
    project_id: ${{ vars.NEON_PROJECT_ID }}
    branch_name: ci/pr-${{ github.event.pull_request.number }}-${{ github.event.pull_request.head.sha }}
    database: neondb
    role: neondb_owner
    expires_at: ${{ env.NEON_EXPIRES_AT }}
    api_key: ${{ secrets.NEON_API_KEY }}
- name: Verify schema on Neon PR branch
  if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository
  working-directory: packages/db
  env:
    DATABASE_URL: ${{ steps.create_neon_branch.outputs.db_url }}
    DB_DRIVER: pg
    ALLOW_NON_LOCAL_SCHEMA_APPLY: "1"
  run: |
    node scripts/apply-local-schema.mjs
    node scripts/verify-schema.mjs
    pnpm exec vitest run src/tenant.test.ts src/sprint3-substrate.test.ts src/interest-gains-schema.test.ts src/fail-closed-rls.test.ts
    node scripts/apply-local-schema.mjs
    node scripts/verify-schema.mjs
```

Do not print `db_url`. Forked PRs retain the existing local PostgreSQL gate and cannot access Neon credentials.

- [ ] **Step 4: Run the workflow contract and confirm GREEN**

Run: `rtk pnpm --filter @mi-banquito/db exec vitest run scripts/neon-ci-workflow.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the CI path**

```bash
rtk git add .github/workflows/ci.yml packages/db/scripts/neon-ci-workflow.test.mjs
rtk git commit -m "ci(db): verify trusted PRs on Neon branches (US-008)"
```

### Task 5: Rehearse on Neon and run the full completion gate

**Files:**
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Configure the non-secret GitHub repository variable**

Run: `rtk gh variable set NEON_PROJECT_ID --body cool-shape-96550274`

Expected: `rtk gh variable list` shows `NEON_PROJECT_ID`; no secret is printed.

- [ ] **Step 2: Confirm the required GitHub secret is present**

Run: `rtk gh secret list --app actions`

Expected: `NEON_API_KEY` is listed. If absent, report live PR execution as externally blocked without weakening or skipping the CI path.

- [ ] **Step 3: Create or reuse a fresh expiring Neon child through the authenticated Neon management connection**

Use project `cool-shape-96550274`, parent `br-bold-cake-aiq95mz3`, name `verify-us008-20260719`, database `neondb`, role `neondb_owner`, and an expiry no later than 24 hours after creation.

Expected: a child branch ID and masked connection string are returned.

- [ ] **Step 4: Run the migration rehearsal twice on the child**

With the child URL provided only through `DATABASE_URL`, run:

```bash
rtk env ALLOW_NON_LOCAL_SCHEMA_APPLY=1 DB_DRIVER=pg node packages/db/scripts/apply-local-schema.mjs
rtk env DB_DRIVER=pg node packages/db/scripts/verify-schema.mjs
rtk env ALLOW_NON_LOCAL_SCHEMA_APPLY=1 DB_DRIVER=pg node packages/db/scripts/apply-local-schema.mjs
rtk env DB_DRIVER=pg node packages/db/scripts/verify-schema.mjs
rtk env DB_DRIVER=pg pnpm --filter @mi-banquito/db exec vitest run src/tenant.test.ts src/sprint3-substrate.test.ts src/interest-gains-schema.test.ts src/fail-closed-rls.test.ts
```

Expected: both schema passes and all selected tests are green.

- [ ] **Step 5: Compare child and production catalogs**

Read-only catalog queries must show that the intended diff is exactly:

- one materialized view, `mv_interest_gains_per_fiscal_year`;
- one unique index, `idx_mv_interest_gains_per_fiscal_year_org_year`; and
- canonical fail-closed definitions on every `<table>_tenant_isolation` policy.

Expected: no table, column, constraint, trigger, or Sprint 8 object is removed or changed.

- [ ] **Step 6: Run the full repository Definition of Done gate**

Run:

```bash
rtk pnpm type-check
rtk pnpm lint
rtk pnpm test
rtk pnpm build
rtk python3 docs/scripts/nous_api_reconcile.py
rtk pnpm audit:sprints0-1
```

Expected: all commands exit 0.

- [ ] **Step 7: Apply the rehearsed additive migrations to production**

After confirming the child diff and target branch, run the same guarded schema application against the production branch URL, followed only by read-only catalog verification and non-owner adversarial RLS probes.

Expected: production has the required view/index, all policies fail closed, and all existing materialized views refresh.

- [ ] **Step 8: Record US-008 evidence and synchronize Nous**

Append JSONL events for all nine acceptance criteria, a `build_pass`, and finally the required plain status event:

```jsonl
{"story":"US-008","event":"build_pass","notes":"type-check, lint, tests, build, local schema, and Neon child rehearsal green"}
{"story":"US-008","event":"done"}
```

Run `rtk ./infra/scripts/sync-from-nous.sh` and verify the synchronized story state. Do not emit `done` if the production or live trusted-PR evidence remains incomplete.

- [ ] **Step 9: Commit closure evidence**

```bash
rtk git add .nous-feedback.jsonl
rtk git commit -m "chore(nous): record US-008 verification (US-008)"
```
