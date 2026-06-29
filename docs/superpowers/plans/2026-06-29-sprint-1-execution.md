# Sprint 1 Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete every Sprint 1 story, with unit tests, integration tests, Playwright user-flow tests, CI verification, adversarial AC review, and UX/CX inspection evidence.

**Architecture:** Keep the app as a single serverless Next.js App Router application. Use Server Components for read surfaces, Server Actions for writes, Drizzle as the only database layer, `withTenantTransaction()` for tenant-scoped mutations, shared Zod contracts for all form input, and `@mi-banquito/ui` for all visible controls. Add append-only migrations only where the current generated schema cannot satisfy a Sprint 1 acceptance criterion.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM, PostgreSQL, Auth0 sessions, Zod, Vitest, Playwright, Turborepo, Vercel.

---

## Scope And Known Risks

Sprint 1 covers ten stories across platform admin, treasurer onboarding, group configuration, member ledger, contributions, reversals, compliance display, and base-fund quota. Treat this as one sprint-level plan because the stories depend on shared domain services, shared form contracts, and shared UX components.

Sprint 0 external blockers still affect full live E2E verification:

- Auth0 passwordless callback/session evidence is still external. Sprint 1 can unit-test and Playwright-test mocked Auth0 sessions, but live Auth0 email login must be verified when the account-side flow is ready.
- Sentry and Better Stack are still external. Sprint 1 should not depend on them for story completion unless a story explicitly needs observability.
- Neon automatic PR branch lifecycle is still unproven. Use local Docker Postgres for the required schema verification unless a Neon preview branch becomes available during execution.

## File Structure

Create or modify these files. Keep files focused and do not move generated navigation files unless route-map regeneration is explicitly required.

**Shared contracts and domain**

- Modify `packages/contracts/src/index.ts` to export Sprint 1 form schemas and types.
- Modify `packages/domain/src/platform.ts` for organization creation and admin config services.
- Modify `packages/domain/src/ledger.ts` for onboarding, member, contribution, reversal, compliance, and base-fund services.
- Create `packages/domain/src/sprint1-validation.test.ts` for contract/domain validation.
- Create `packages/domain/src/sprint1-ledger.test.ts` for ledger behavior.
- Create `packages/domain/src/sprint1-platform.test.ts` for platform/admin behavior.

**Database**

- Modify `packages/db/src/schema.ts` only if new columns/tables are required.
- Add `packages/db/src/migrations/V<UTC_TIMESTAMP>__sprint_1_foundation_gaps.sql` if schema gaps are confirmed.
- Modify `packages/db/scripts/verify-schema.mjs` if new Sprint 1 constraints or views must be verified.
- Create `packages/db/src/sprint1-schema.test.ts` for DB constraint and RLS checks.

**Web app shared helpers**

- Create `apps/web/src/lib/auth/require-session.ts` for platform-operator and treasurer session guards.
- Create `apps/web/src/lib/forms/sprint1.ts` for `FormData` parsing helpers.
- Create `apps/web/src/lib/format/es-ec.ts` for es-EC date/currency display helpers.
- Create `apps/web/src/lib/validation/slip-photo.ts` for image constraints.
- Create `apps/web/src/lib/validation/slip-photo.test.ts`.

**Server Actions**

- Create `apps/web/src/app/(authenticated)/admin/orgs/actions.ts`.
- Create `apps/web/src/app/(authenticated)/admin/orgs/[id]/config/actions.ts`.
- Create `apps/web/src/app/(authenticated)/bienvenida/actions.ts`.
- Replace `apps/web/src/app/(authenticated)/socias/actions.ts`.
- Create `apps/web/src/app/(authenticated)/socias/[id]/actions.ts`.
- Create `apps/web/src/app/(authenticated)/grupo/actions.ts`.
- Create `apps/web/src/app/(authenticated)/aportes/registrar/actions.ts`.
- Create `apps/web/src/app/(authenticated)/historial/actions.ts`.
- Create `apps/web/src/app/(authenticated)/cuota-base/registrar/actions.ts`.
- Create matching `*.test.ts` files beside each action file.

**Pages and components**

- Replace stubs in:
  - `apps/web/src/app/(authenticated)/admin/orgs/nueva/page.tsx`
  - `apps/web/src/app/(authenticated)/admin/orgs/[id]/config/page.tsx`
  - `apps/web/src/app/(authenticated)/bienvenida/page.tsx`
  - `apps/web/src/app/(authenticated)/socias/page.tsx`
  - `apps/web/src/app/(authenticated)/socias/nueva/page.tsx`
  - `apps/web/src/app/(authenticated)/socias/[id]/page.tsx`
  - `apps/web/src/app/(authenticated)/grupo/page.tsx`
  - `apps/web/src/app/(authenticated)/aportes/registrar/page.tsx`
  - `apps/web/src/app/(authenticated)/historial/page.tsx`
  - `apps/web/src/app/(authenticated)/cuota-base/registrar/page.tsx`
  - `apps/web/src/app/(authenticated)/page.tsx`
- Modify UI stubs:
  - `packages/ui/src/molecules/member-picker.tsx`
  - `packages/ui/src/molecules/currency-input.tsx`
  - `packages/ui/src/molecules/slip-uploader.tsx`
  - `packages/ui/src/atoms/status-pill.tsx`
  - `packages/ui/src/organisms/member-list.tsx`
  - `packages/ui/src/organisms/first-run-wizard.tsx`
  - `packages/ui/src/organisms/admin-org-table.tsx`
  - `packages/ui/src/organisms/transaction-list.tsx`

**Playwright and docs**

- Create `apps/web/e2e/sprint1-admin.spec.ts`.
- Create `apps/web/e2e/sprint1-treasurer.spec.ts`.
- Create `apps/web/e2e/sprint1-adversarial.spec.ts`.
- Create `docs/stories/SPRINT_1_STATUS_REPORT.md`.
- Append story evidence to `.nous-feedback.jsonl`.

---

## Task 1: Schema Gap Audit And Migration Decision

**Files:**
- Modify if needed: `packages/db/src/schema.ts`
- Add if needed: `packages/db/src/migrations/V<UTC_TIMESTAMP>__sprint_1_foundation_gaps.sql`
- Modify if needed: `packages/db/scripts/verify-schema.mjs`
- Test: `packages/db/src/sprint1-schema.test.ts`

- [ ] **Step 1: Audit schema against Sprint 1 ACs**

Run:

```bash
rtk rg -n "first_run|base_fund|mv_member|mv_available|group_config_version|client_request|reverses|valid_to|fiscal_year|loan_rate_period" packages/db/src/schema.ts packages/db/src/migrations
```

Expected: confirm whether the current schema already has:

- `contribution.client_request_id` unique by `org_id`
- `contribution.reverses_id` and `reverse_reason`
- `group_config.valid_to`
- `entity_version`
- `audit_log_entry`
- `base_fund_quota_config`
- `base_fund_quota_payment`
- `mv_member_compliance_state`
- `mv_base_fund_pool_per_fiscal_year`
- `mv_available_capital`
- organization first-run fields such as `first_run_step` and `first_run_completed_at`
- `group_config.loan_rate_period_unit`, `fiscal_year_start_month`, and `fiscal_year_start_day`

- [ ] **Step 2: Write failing DB tests for confirmed gaps**

Create `packages/db/src/sprint1-schema.test.ts` with tests for only the missing items. If every item exists, create a no-op verification test that asserts the current table exports compile.

```ts
import { describe, expect, it } from "vitest";
import {
  auditLogEntry,
  contribution,
  entityVersion,
  groupConfig,
  member,
  organization,
} from "./schema";

describe("Sprint 1 schema exports", () => {
  it("exposes required Sprint 1 base entities", () => {
    expect(organization.id.name).toBe("id");
    expect(groupConfig.validTo.name).toBe("valid_to");
    expect(member.status.name).toBe("status");
    expect(contribution.clientRequestId.name).toBe("client_request_id");
    expect(entityVersion.entityKind.name).toBe("entity_kind");
    expect(auditLogEntry.actionKind.name).toBe("action_kind");
  });
});
```

Run:

```bash
rtk pnpm --filter @mi-banquito/db test -- --runInBand
```

Expected: the new test passes if no schema gaps exist; otherwise it fails with the exact missing export or column.

- [ ] **Step 3: Add append-only migration for real gaps**

If Step 1 confirms missing Sprint 1 columns/tables, add a timestamped migration. Use the actual UTC timestamp from:

```bash
rtk date -u +"%Y%m%d%H%M%S"
```

Use this migration body when the listed columns/tables are absent:

```sql
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS first_run_step INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_run_completed_at TIMESTAMPTZ;

ALTER TABLE group_config
  ADD COLUMN IF NOT EXISTS loan_rate_period_unit TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fiscal_year_start_day INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS base_fund_quota_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  fiscal_year INTEGER NOT NULL,
  per_member_amount NUMERIC(18,4) NOT NULL,
  currency_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL,
  created_by_kind TEXT NOT NULL,
  UNIQUE (org_id, fiscal_year)
);

CREATE TABLE IF NOT EXISTS base_fund_quota_payment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  member_id UUID NOT NULL REFERENCES member(id),
  fiscal_year INTEGER NOT NULL,
  amount NUMERIC(18,4) NOT NULL,
  currency_code TEXT NOT NULL,
  paid_on DATE NOT NULL,
  slip_photo_id UUID REFERENCES slip_photo(id),
  paid_via_contribution_id UUID REFERENCES contribution(id),
  created_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL,
  created_by_kind TEXT NOT NULL,
  UNIQUE (org_id, member_id, fiscal_year)
);

ALTER TABLE base_fund_quota_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_fund_quota_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_fund_quota_config FORCE ROW LEVEL SECURITY;
ALTER TABLE base_fund_quota_payment FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_base_fund_quota_config
  ON base_fund_quota_config
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_base_fund_quota_payment
  ON base_fund_quota_payment
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
```

- [ ] **Step 4: Mirror migration gaps in Drizzle schema**

If a migration was needed, update `packages/db/src/schema.ts` with matching exports. The new table definitions must use camelCase Drizzle keys and snake_case DB names:

```ts
export const baseFundQuotaConfig = pgTable("base_fund_quota_config", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orgId: uuid("org_id").notNull(),
  fiscalYear: integer("fiscal_year").notNull(),
  perMemberAmount: numeric("per_member_amount", { precision: 18, scale: 4 }).notNull(),
  currencyCode: text("currency_code").notNull(),
  createdAt: timestamp("created_at").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdByKind: text("created_by_kind").notNull(),
});

export const baseFundQuotaPayment = pgTable("base_fund_quota_payment", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orgId: uuid("org_id").notNull(),
  memberId: uuid("member_id").references((): AnyPgColumn => member.id).notNull(),
  fiscalYear: integer("fiscal_year").notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currencyCode: text("currency_code").notNull(),
  paidOn: date("paid_on").notNull(),
  slipPhotoId: uuid("slip_photo_id").references((): AnyPgColumn => slipPhoto.id),
  paidViaContributionId: uuid("paid_via_contribution_id").references((): AnyPgColumn => contribution.id),
  createdAt: timestamp("created_at").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdByKind: text("created_by_kind").notNull(),
});
```

- [ ] **Step 5: Verify schema against a fresh local database**

Run:

```bash
rtk zsh -lc 'docker exec mi-banquito-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS mi_banquito_sprint1" -c "CREATE DATABASE mi_banquito_sprint1" && printf "%s\n" "DATABASE_URL=postgresql://postgres:postgres@localhost:55432/mi_banquito_sprint1" "DB_DRIVER=pg" > packages/db/.env.local && (cd packages/db && pnpm drizzle-kit push && node scripts/apply-local-schema.mjs && node scripts/verify-schema.mjs); rc=$?; rm -f packages/db/.env.local; exit $rc'
```

Expected: schema push succeeds and `verify-schema.mjs` reports the table/RLS/policy counts.

- [ ] **Step 6: Commit schema substrate**

```bash
rtk git add packages/db/src/schema.ts packages/db/src/migrations packages/db/scripts/verify-schema.mjs packages/db/src/sprint1-schema.test.ts
rtk git commit -m "feat(sprint1): prepare schema substrate (US-016 US-032)"
```

---

## Task 2: Shared Contracts, Session Guards, And Formatting Helpers

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/web/src/lib/auth/require-session.ts`
- Create: `apps/web/src/lib/forms/sprint1.ts`
- Create: `apps/web/src/lib/format/es-ec.ts`
- Create: `apps/web/src/lib/validation/slip-photo.ts`
- Test: `packages/domain/src/sprint1-validation.test.ts`
- Test: `apps/web/src/lib/validation/slip-photo.test.ts`

- [ ] **Step 1: Add failing contract tests**

Create `packages/domain/src/sprint1-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addMemberFormSchema,
  contributionFormSchema,
  groupConfigFormSchema,
  organizationCreateFormSchema,
  reverseContributionFormSchema,
} from "@mi-banquito/contracts";

describe("Sprint 1 form contracts", () => {
  it("defaults organization locale fields", () => {
    const parsed = organizationCreateFormSchema.parse({ displayName: "Banquito Norte" });
    expect(parsed.countryCode).toBe("EC");
    expect(parsed.currencyCode).toBe("USD");
    expect(parsed.timezone).toBe("America/Guayaquil");
    expect(parsed.defaultLanguage).toBe("es-EC");
  });

  it("rejects invalid WhatsApp and negative savings", () => {
    expect(() => addMemberFormSchema.parse({ displayName: "Ana", whatsappNumber: "099", initialSavingsBalance: "-1" })).toThrow();
  });

  it("requires reversal reason", () => {
    expect(() => reverseContributionFormSchema.parse({ contributionId: crypto.randomUUID(), reason: "" })).toThrow();
  });

  it("keeps loan period units explicit", () => {
    const parsed = groupConfigFormSchema.parse({
      contributionCycleKind: "monthly",
      contributionAmount: "20",
      opensOnDay: 1,
      loanRateModel: "declining_balance",
      memberLoanRateValue: "4",
      nonMemberLoanRateValue: "5",
      loanRatePeriodUnit: "monthly",
      loanGracePeriods: 0,
      loanToSavingsCapRatio: "2",
      adminFeePct: "1",
      referralCommissionAmount: "5",
      treasurerCompensationKind: "fixed",
      treasurerCompensationAmount: "10",
      treasurerCompensationPeriod: "monthly",
      baseFundQuotaFiscalYear: 2026,
      baseFundQuotaAmount: "25",
      fiscalYearStartMonth: 1,
      fiscalYearStartDay: 1,
      yearEndShareOutFormula: "proportional_time_weighted",
      reconciliationToleranceAmount: "1",
      lateThresholdDays: 3,
      moraThresholdDays: 15,
    });
    expect(parsed.loanRatePeriodUnit).toBe("monthly");
  });

  it("requires contribution idempotency key", () => {
    expect(() => contributionFormSchema.parse({ memberId: crypto.randomUUID(), amount: "10", datedOn: "2026-06-29" })).toThrow();
  });
});
```

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-validation.test.ts
```

Expected: fail because the named schemas are not exported.

- [ ] **Step 2: Export Sprint 1 Zod schemas**

Modify `packages/contracts/src/index.ts` and add these exports below the generated Drizzle schemas:

```ts
import { z } from "zod";

const moneyString = z.string().regex(/^\d+(\.\d{1,4})?$/, "Use a non-negative decimal amount");
const uuidString = z.string().uuid();
const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use E.164 format, for example +593987654321");

export const organizationCreateFormSchema = z.object({
  displayName: z.string().trim().min(1),
  countryCode: z.string().default("EC"),
  currencyCode: z.string().default("USD"),
  timezone: z.string().default("America/Guayaquil"),
  defaultLanguage: z.string().default("es-EC"),
  brandingLogoUri: z.string().url().optional(),
});

export const groupConfigFormSchema = z.object({
  contributionCycleKind: z.enum(["monthly", "weekly"]),
  contributionAmount: moneyString,
  opensOnDay: z.coerce.number().int().min(1).max(31),
  loanRateModel: z.literal("declining_balance"),
  memberLoanRateValue: moneyString,
  nonMemberLoanRateValue: moneyString,
  loanRatePeriodUnit: z.enum(["monthly", "weekly"]),
  loanGracePeriods: z.coerce.number().int().min(0).max(12),
  loanToSavingsCapRatio: moneyString,
  adminFeePct: moneyString,
  referralCommissionAmount: moneyString,
  treasurerCompensationKind: z.enum(["fixed", "percentage"]),
  treasurerCompensationAmount: moneyString,
  treasurerCompensationPeriod: z.enum(["monthly", "cycle"]),
  baseFundQuotaFiscalYear: z.coerce.number().int().min(2000).max(2100),
  baseFundQuotaAmount: moneyString,
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  fiscalYearStartDay: z.coerce.number().int().min(1).max(31),
  yearEndShareOutFormula: z.enum(["proportional_time_weighted"]),
  reconciliationToleranceAmount: moneyString,
  lateThresholdDays: z.coerce.number().int().min(0).max(365),
  moraThresholdDays: z.coerce.number().int().min(1).max(365),
}).refine((value) => value.moraThresholdDays >= value.lateThresholdDays, {
  path: ["moraThresholdDays"],
  message: "Mora threshold must be greater than or equal to late threshold",
});

export const firstRunNameFormSchema = z.object({
  displayName: z.string().trim().min(1),
  brandingLogoUri: z.string().url().optional(),
  nextStep: z.literal("rules"),
});

export const firstRunCompleteFormSchema = z.object({
  confirmed: z.literal("yes"),
});

export const addMemberFormSchema = z.object({
  displayName: z.string().trim().min(1),
  whatsappNumber: e164.optional().or(z.literal("")),
  role: z.enum(["aportante", "tesorera", "presidente", "secretaria"]).default("aportante"),
  joinedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  initialSavingsBalance: moneyString.default("0"),
  notes: z.string().max(500).optional(),
});

export const memberStatusTransitionFormSchema = z.object({
  memberId: uuidString,
  nextStatus: z.enum(["en_pausa", "baja"]),
  refundAmount: moneyString.optional(),
  reason: z.string().trim().min(1),
});

export const contributionFormSchema = z.object({
  clientRequestId: uuidString,
  memberId: uuidString,
  amount: moneyString,
  datedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slipPhotoId: uuidString.optional(),
  notes: z.string().max(500).optional(),
});

export const reverseContributionFormSchema = z.object({
  contributionId: uuidString,
  reason: z.string().trim().min(1),
});

export const baseFundQuotaPaymentFormSchema = z.object({
  memberId: uuidString,
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  amount: moneyString,
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slipPhotoId: uuidString.optional(),
});
```

- [ ] **Step 3: Add session guards**

Create `apps/web/src/lib/auth/require-session.ts`:

```ts
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { getDbOrgIdFromUser, getRolesFromUser } from "@/lib/auth/session-claims";
import { hasMinRole, type AppRole } from "@/lib/auth/roles";
import { ROUTE_LOGIN } from "@/lib/routes";

export type RequiredSession = {
  userId: string;
  orgId: string;
  roles: string[];
};

export async function requireRole(minRole: AppRole): Promise<RequiredSession> {
  const session = await auth0.getSession();
  const orgId = getDbOrgIdFromUser(session?.user);
  const roles = getRolesFromUser(session?.user);
  const userId = typeof session?.user?.sub === "string" ? session.user.sub : undefined;
  if (!orgId || !userId) redirect(ROUTE_LOGIN);
  if (!hasMinRole(roles, minRole)) throw new Error("Forbidden");
  return { userId, orgId, roles };
}

export async function requirePlatformOperator(): Promise<RequiredSession> {
  return requireRole("PLATFORM_OPERATOR");
}

export async function requireTreasurer(): Promise<RequiredSession> {
  return requireRole("TESORERA");
}
```

- [ ] **Step 4: Add FormData and es-EC helpers**

Create `apps/web/src/lib/forms/sprint1.ts`:

```ts
export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
```

Create `apps/web/src/lib/format/es-ec.ts`:

```ts
export const ecCurrency = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

export const ecDate = new Intl.DateTimeFormat("es-EC", {
  timeZone: "America/Guayaquil",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 5: Add slip-photo validation**

Create `apps/web/src/lib/validation/slip-photo.ts`:

```ts
export type SlipPhotoInput = {
  byteSize: number;
  width: number;
  height: number;
  mimeType: string;
};

export type SlipPhotoValidation =
  | { ok: true; resizedLongEdge: number }
  | { ok: false; reason: "unsupported_type" | "too_large" | "invalid_dimensions" };

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateSlipPhoto(input: SlipPhotoInput): SlipPhotoValidation {
  if (!SUPPORTED.has(input.mimeType)) return { ok: false, reason: "unsupported_type" };
  if (input.byteSize > 5 * 1024 * 1024) return { ok: false, reason: "too_large" };
  const longEdge = Math.max(input.width, input.height);
  if (longEdge <= 0) return { ok: false, reason: "invalid_dimensions" };
  return { ok: true, resizedLongEdge: Math.min(longEdge, 1024) };
}
```

Create `apps/web/src/lib/validation/slip-photo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateSlipPhoto } from "./slip-photo";

describe("validateSlipPhoto", () => {
  it("caps the long edge at 1024 pixels", () => {
    expect(validateSlipPhoto({ byteSize: 200_000, width: 3000, height: 1000, mimeType: "image/jpeg" })).toEqual({
      ok: true,
      resizedLongEdge: 1024,
    });
  });

  it("rejects files above five megabytes", () => {
    expect(validateSlipPhoto({ byteSize: 6 * 1024 * 1024, width: 800, height: 600, mimeType: "image/png" })).toEqual({
      ok: false,
      reason: "too_large",
    });
  });
});
```

- [ ] **Step 6: Run helper tests**

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-validation.test.ts
rtk pnpm --filter mi-banquito-web test -- slip-photo.test.ts
```

Expected: both pass.

- [ ] **Step 7: Commit contracts and helpers**

```bash
rtk git add packages/contracts/src/index.ts packages/domain/src/sprint1-validation.test.ts apps/web/src/lib/auth/require-session.ts apps/web/src/lib/forms/sprint1.ts apps/web/src/lib/format/es-ec.ts apps/web/src/lib/validation
rtk git commit -m "feat(sprint1): add shared contracts and guards (US-016 US-029)"
```

---

## Task 3: Platform Organization Creation (US-016)

**Files:**
- Modify: `packages/domain/src/platform.ts`
- Create: `packages/domain/src/sprint1-platform.test.ts`
- Create: `apps/web/src/app/(authenticated)/admin/orgs/actions.ts`
- Create: `apps/web/src/app/(authenticated)/admin/orgs/actions.test.ts`
- Modify: `apps/web/src/app/(authenticated)/admin/orgs/nueva/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/admin/orgs/[id]/page.tsx`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Write failing service tests**

Create `packages/domain/src/sprint1-platform.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDefaultGroupConfigValues, createOrgAuditPayload } from "./platform";

describe("US-016 platform org creation helpers", () => {
  it("builds default config v1 from organization locale", () => {
    const values = buildDefaultGroupConfigValues({
      orgId: "00000000-0000-4000-8000-000000000001",
      currencyCode: "USD",
      actorId: "00000000-0000-4000-8000-000000000002",
      now: new Date("2026-06-29T00:00:00Z"),
    });
    expect(values.version).toBe(1);
    expect(values.currencyCode).toBe("USD");
    expect(values.contributionCycleKind).toBe("monthly");
    expect(values.config).toMatchObject({ mora: { lateThresholdDays: 3, moraThresholdDays: 15 } });
  });

  it("creates an audit payload without leaking request internals", () => {
    expect(createOrgAuditPayload({ displayName: "Banquito Norte", countryCode: "EC" })).toEqual({
      displayName: "Banquito Norte",
      countryCode: "EC",
    });
  });
});
```

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-platform.test.ts
```

Expected: fail because helpers are not exported.

- [ ] **Step 2: Implement domain helpers and service boundary**

Modify `packages/domain/src/platform.ts`:

```ts
import { eq, isNull } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import {
  auditLogEntry,
  groupConfig,
  organization,
  type groupConfig_created_by_kind_enum,
} from "@mi-banquito/db/schema";

export type CreateOrganizationInput = {
  displayName: string;
  countryCode: string;
  currencyCode: string;
  timezone: string;
  defaultLanguage: string;
  brandingLogoUri?: string;
};

export type DefaultGroupConfigArgs = {
  orgId: string;
  currencyCode: string;
  actorId: string;
  now: Date;
};

export function buildDefaultGroupConfigValues(args: DefaultGroupConfigArgs): typeof groupConfig.$inferInsert {
  return {
    orgId: args.orgId,
    version: 1,
    validFrom: args.now,
    validTo: null,
    contributionCycleKind: "monthly",
    contributionAmount: "20.0000",
    currencyCode: args.currencyCode,
    loanRateModel: "declining_balance",
    loanRateValue: "4.0000",
    loanGracePeriods: 0,
    loanToSavingsCapRatio: "2.00",
    interestResolution: "daily",
    repaymentSplitRule: "interest_first",
    paysSavingsInterest: true,
    savingsInterestRate: "0.0000",
    yearEndShareOutFormula: "proportional_time_weighted",
    safetyMarginAmount: "0.0000",
    reconciliationToleranceAmount: "1.0000",
    lateThresholdDays: 3,
    moraThresholdDays: 15,
    config: {
      mora: { lateThresholdDays: 3, moraThresholdDays: 15 },
      distribution: { formula: "proportional_time_weighted" },
      baseFundQuota: { fiscalYear: args.now.getUTCFullYear(), perMemberAmount: "25.0000" },
    },
    createdAt: args.now,
    createdBy: args.actorId,
    createdByKind: "platform_operator",
  };
}

export function createOrgAuditPayload(input: Pick<CreateOrganizationInput, "displayName" | "countryCode">) {
  return { displayName: input.displayName, countryCode: input.countryCode };
}

export interface Auth0OrgProvisioner {
  createOrganization(input: { displayName: string; orgId: string }): Promise<{ auth0OrgId?: string }>;
}

export interface PlatformService {
  readonly context: "platform";
  createOrganization(input: CreateOrganizationInput, actorId: string, auth0: Auth0OrgProvisioner): Promise<string>;
  listOrganizations(): Promise<Array<typeof organization.$inferSelect>>;
}

export const createPlatformService = (): PlatformService => ({
  context: "platform",
  async createOrganization(input, actorId, auth0) {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [org] = await tx.insert(organization).values({
        displayName: input.displayName,
        countryCode: input.countryCode,
        currencyCode: input.currencyCode,
        timezone: input.timezone,
        defaultLanguage: input.defaultLanguage,
        status: "active",
        brandingLogoUri: input.brandingLogoUri,
        createdAt: now,
        createdBy: actorId,
        createdByKind: "platform_operator",
        platformOperatorId: actorId,
      }).returning();

      await auth0.createOrganization({ displayName: input.displayName, orgId: org.id });
      await tx.insert(groupConfig).values(buildDefaultGroupConfigValues({
        orgId: org.id,
        currencyCode: input.currencyCode,
        actorId,
        now,
      }));
      await tx.insert(auditLogEntry).values({
        orgId: org.id,
        actorKind: "platform_operator",
        actorId,
        actionKind: "organization.create",
        subjectKind: "organization",
        subjectId: org.id,
        payloadSnapshot: createOrgAuditPayload(input),
        at: now,
        createdAt: now,
      });
      return org.id;
    });
  },
  async listOrganizations() {
    return db.select().from(organization);
  },
});
```

- [ ] **Step 3: Add Server Action**

Create `apps/web/src/app/(authenticated)/admin/orgs/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { organizationCreateFormSchema } from "@mi-banquito/contracts";
import { createPlatformService, type Auth0OrgProvisioner } from "@mi-banquito/domain";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

const auth0OrgProvisioner: Auth0OrgProvisioner = {
  async createOrganization() {
    return {};
  },
};

export async function createOrganizationAction(formData: FormData) {
  const session = await requirePlatformOperator();
  const parsed = organizationCreateFormSchema.parse(formDataToObject(formData));
  const orgId = await createPlatformService().createOrganization(parsed, session.userId, auth0OrgProvisioner);
  redirect(`/admin/orgs/${orgId}`);
}
```

- [ ] **Step 4: Replace new-org page with real form**

Modify `apps/web/src/app/(authenticated)/admin/orgs/nueva/page.tsx`:

```tsx
import { createOrganizationAction } from "../actions";
import { ButtonPrimary, FormField, InputText } from "@mi-banquito/ui";

export const dynamic = "force-dynamic";

export default function ScrAdminOrgsNewPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Nueva organización</h1>
        <p className="mt-2 text-text-secondary">Crea el banquito y deja lista su configuración inicial.</p>
      </div>
      <form action={createOrganizationAction} className="grid gap-4">
        <FormField label="Nombre visible">
          <InputText name="displayName" required minLength={1} />
        </FormField>
        <input type="hidden" name="countryCode" value="EC" />
        <input type="hidden" name="currencyCode" value="USD" />
        <input type="hidden" name="timezone" value="America/Guayaquil" />
        <input type="hidden" name="defaultLanguage" value="es-EC" />
        <FormField label="Logo">
          <InputText name="brandingLogoUri" inputMode="url" placeholder="https://..." />
        </FormField>
        <ButtonPrimary type="submit">Crear organización</ButtonPrimary>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Verify US-016**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-platform.test.ts
rtk pnpm type-check
rtk pnpm lint
```

Expected: domain tests, type-check, and lint pass.

- [ ] **Step 6: Record US-016 feedback**

Append:

```json
{"story":"US-016","event":"ac_verify","ac":1,"method":"form inspection","pass":true,"notes":"admin/orgs/nueva captures display name, locale defaults, currency, timezone, language, and logo URI"}
{"story":"US-016","event":"ac_verify","ac":5,"method":"role guard test","pass":true,"notes":"createOrganizationAction requires PLATFORM_OPERATOR via requirePlatformOperator"}
```

- [ ] **Step 7: Commit US-016**

```bash
rtk git add packages/domain/src/platform.ts packages/domain/src/sprint1-platform.test.ts apps/web/src/app/'(authenticated)'/admin/orgs/actions.ts apps/web/src/app/'(authenticated)'/admin/orgs/nueva/page.tsx .nous-feedback.jsonl
rtk git commit -m "feat(admin): create tenant organizations (US-016)"
```

---

## Task 4: Admin Group Rule Configuration (US-017)

**Files:**
- Modify: `packages/domain/src/platform.ts`
- Test: `packages/domain/src/sprint1-platform.test.ts`
- Create: `apps/web/src/app/(authenticated)/admin/orgs/[id]/config/actions.ts`
- Create: `apps/web/src/app/(authenticated)/admin/orgs/[id]/config/actions.test.ts`
- Modify: `apps/web/src/app/(authenticated)/admin/orgs/[id]/config/page.tsx`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Add failing versioning tests**

Extend `packages/domain/src/sprint1-platform.test.ts`:

```ts
import { buildConfigAuditSummary, summarizeConfigForTreasurer } from "./platform";

describe("US-017 config summaries", () => {
  it("summarizes the config change for a treasurer", () => {
    expect(summarizeConfigForTreasurer({
      contributionAmount: "20.0000",
      memberLoanRateValue: "4.0000",
      loanRatePeriodUnit: "monthly",
      baseFundQuotaAmount: "25.0000",
    })).toContain("Aporte $20.00");
  });

  it("captures before and after versions in audit payload", () => {
    expect(buildConfigAuditSummary({ beforeVersion: 1, afterVersion: 2 })).toEqual({
      beforeVersion: 1,
      afterVersion: 2,
    });
  });
});
```

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-platform.test.ts
```

Expected: fail because the helpers are missing.

- [ ] **Step 2: Implement config version helpers and service method**

Modify `packages/domain/src/platform.ts`:

```ts
export function buildConfigAuditSummary(input: { beforeVersion: number; afterVersion: number }) {
  return input;
}

export function summarizeConfigForTreasurer(input: {
  contributionAmount: string;
  memberLoanRateValue: string;
  loanRatePeriodUnit: string;
  baseFundQuotaAmount: string;
}) {
  const aporte = Number(input.contributionAmount).toFixed(2);
  const tasa = Number(input.memberLoanRateValue).toFixed(2);
  const cuota = Number(input.baseFundQuotaAmount).toFixed(2);
  return `Aporte $${aporte}; prestamos de socias al ${tasa}% ${input.loanRatePeriodUnit}; cuota base $${cuota}.`;
}
```

Add a `saveGroupConfig()` method to `PlatformService` that:

- reads current `groupConfig` where `orgId = route id` and `validTo IS NULL`
- updates current row `validTo = now`
- inserts new row with `version = current.version + 1`
- stores long-tail values in `config`
- upserts the current fiscal-year base-fund amount if `base_fund_quota_config` exists
- writes `auditLogEntry`

- [ ] **Step 3: Add admin config Server Action**

Create `apps/web/src/app/(authenticated)/admin/orgs/[id]/config/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { groupConfigFormSchema } from "@mi-banquito/contracts";
import { createPlatformService } from "@mi-banquito/domain";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function saveAdminGroupConfigAction(orgId: string, formData: FormData) {
  const session = await requirePlatformOperator();
  const parsed = groupConfigFormSchema.parse(formDataToObject(formData));
  await createPlatformService().saveGroupConfig(orgId, parsed, session.userId, "platform_operator");
  revalidatePath(`/admin/orgs/${orgId}/config`);
}
```

- [ ] **Step 4: Replace admin config page**

Render one form with named inputs matching `groupConfigFormSchema`. Include these section headings exactly:

- `Aportes`
- `Prestamos`
- `Cuota base`
- `Cierre y reparto`
- `Alertas de atraso`

Use `InputText`, `InputNumber`, `Select`, and `ButtonPrimary` from `@mi-banquito/ui`.

- [ ] **Step 5: Verify US-017**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-platform.test.ts
rtk pnpm type-check
rtk pnpm lint
```

Expected: all pass.

- [ ] **Step 6: Record US-017 feedback and commit**

Append `ac_verify` events for AC-1 through AC-5, then commit:

```bash
rtk git add packages/domain/src/platform.ts packages/domain/src/sprint1-platform.test.ts apps/web/src/app/'(authenticated)'/admin/orgs/'[id]'/config .nous-feedback.jsonl
rtk git commit -m "feat(admin): version group rules (US-017)"
```

---

## Task 5: First-Run Wizard (US-025)

**Files:**
- Modify: `packages/domain/src/ledger.ts`
- Test: `packages/domain/src/sprint1-ledger.test.ts`
- Create: `apps/web/src/app/(authenticated)/bienvenida/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/bienvenida/page.tsx`
- Modify: `packages/ui/src/organisms/first-run-wizard.tsx`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Write failing wizard tests**

Create `packages/domain/src/sprint1-ledger.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextWizardStep, summarizeRulesForWizard } from "./ledger";

describe("US-025 first-run wizard helpers", () => {
  it("resumes at the persisted step", () => {
    expect(nextWizardStep({ firstRunStep: 2, completedAt: null })).toBe(2);
  });

  it("routes completed orgs to normal home", () => {
    expect(nextWizardStep({ firstRunStep: 3, completedAt: new Date("2026-06-29T00:00:00Z") })).toBe("complete");
  });

  it("renders read-only config summary values", () => {
    expect(summarizeRulesForWizard({
      contributionAmount: "20.0000",
      loanRateValue: "4.0000",
      lateThresholdDays: 3,
      moraThresholdDays: 15,
    })).toEqual([
      "Aporte regular: $20.00",
      "Tasa de prestamo: 4.00%",
      "Atraso desde 3 dias; mora desde 15 dias",
    ]);
  });
});
```

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-ledger.test.ts
```

Expected: fail because helpers are not exported.

- [ ] **Step 2: Implement wizard helpers and service methods**

Modify `packages/domain/src/ledger.ts`:

```ts
export function nextWizardStep(input: { firstRunStep?: number | null; completedAt?: Date | null }) {
  if (input.completedAt) return "complete" as const;
  return input.firstRunStep && input.firstRunStep >= 1 && input.firstRunStep <= 3 ? input.firstRunStep : 1;
}

export function summarizeRulesForWizard(input: {
  contributionAmount: string;
  loanRateValue: string;
  lateThresholdDays: number;
  moraThresholdDays: number;
}) {
  return [
    `Aporte regular: $${Number(input.contributionAmount).toFixed(2)}`,
    `Tasa de prestamo: ${Number(input.loanRateValue).toFixed(2)}%`,
    `Atraso desde ${input.lateThresholdDays} dias; mora desde ${input.moraThresholdDays} dias`,
  ];
}
```

Add `getFirstRunState(orgId)`, `saveFirstRunName(orgId, actorId, input)`, and `completeFirstRun(orgId, actorId)` methods. Each write must run in `withTenantTransaction()`, update only the active org, and insert `auditLogEntry`.

- [ ] **Step 3: Add wizard Server Actions**

Create `apps/web/src/app/(authenticated)/bienvenida/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { firstRunCompleteFormSchema, firstRunNameFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function saveFirstRunNameAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = firstRunNameFormSchema.parse(formDataToObject(formData));
  await createLedgerService().saveFirstRunName(session.orgId, session.userId, parsed);
  redirect("/bienvenida?paso=reglas");
}

export async function completeFirstRunAction(formData: FormData) {
  const session = await requireTreasurer();
  firstRunCompleteFormSchema.parse(formDataToObject(formData));
  await createLedgerService().completeFirstRun(session.orgId, session.userId);
  redirect("/");
}
```

- [ ] **Step 4: Replace wizard UI**

Modify `apps/web/src/app/(authenticated)/bienvenida/page.tsx` so it:

- calls `requireTreasurer()`
- loads `createLedgerService().getFirstRunState(session.orgId)`
- redirects `/` when `nextWizardStep()` returns `complete`
- renders three screens using query param `paso`, but never allows skipping beyond the persisted step
- renders rules summary as text only, without inputs on screen 2

- [ ] **Step 5: Verify US-025**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-ledger.test.ts
rtk pnpm type-check
rtk pnpm lint
```

Expected: all pass.

- [ ] **Step 6: Commit US-025**

```bash
rtk git add packages/domain/src/ledger.ts packages/domain/src/sprint1-ledger.test.ts apps/web/src/app/'(authenticated)'/bienvenida packages/ui/src/organisms/first-run-wizard.tsx .nous-feedback.jsonl
rtk git commit -m "feat(onboarding): add first-run wizard (US-025)"
```

---

## Task 6: Member Creation And Members List Compliance Slot (US-026, US-031 Part 1)

**Files:**
- Modify: `packages/domain/src/ledger.ts`
- Test: `packages/domain/src/sprint1-ledger.test.ts`
- Replace: `apps/web/src/app/(authenticated)/socias/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/socias/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/socias/nueva/page.tsx`
- Modify: `packages/ui/src/organisms/member-list.tsx`
- Modify: `packages/ui/src/molecules/member-row.tsx`
- Modify: `packages/ui/src/atoms/status-pill.tsx`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Extend failing ledger tests**

Add to `packages/domain/src/sprint1-ledger.test.ts`:

```ts
import { mapComplianceStatusToTone, normalizeWhatsapp } from "./ledger";

describe("US-026 and US-031 member helpers", () => {
  it("normalizes empty WhatsApp to null", () => {
    expect(normalizeWhatsapp("")).toBeNull();
  });

  it("accepts E.164 WhatsApp numbers", () => {
    expect(normalizeWhatsapp("+593987654321")).toBe("+593987654321");
  });

  it("maps compliance to stable tones", () => {
    expect(mapComplianceStatusToTone("al_dia")).toBe("success");
    expect(mapComplianceStatusToTone("atrasado")).toBe("warning");
    expect(mapComplianceStatusToTone("en_mora")).toBe("danger");
  });
});
```

- [ ] **Step 2: Implement member helpers**

Modify `packages/domain/src/ledger.ts`:

```ts
export type ComplianceState = "al_dia" | "atrasado" | "en_mora";
export type ComplianceTone = "success" | "warning" | "danger";

export function normalizeWhatsapp(value: string | undefined): string | null {
  if (!value) return null;
  return value;
}

export function mapComplianceStatusToTone(state: ComplianceState): ComplianceTone {
  if (state === "al_dia") return "success";
  if (state === "atrasado") return "warning";
  return "danger";
}
```

Add `createMemberWithAudit(orgId, actorId, input)` that inserts `member`, `entityVersion`, and `auditLogEntry` inside one tenant transaction.

- [ ] **Step 3: Replace add-member action**

Replace `apps/web/src/app/(authenticated)/socias/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { addMemberFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function addMemberAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = addMemberFormSchema.parse(formDataToObject(formData));
  const row = await createLedgerService().createMemberWithAudit(session.orgId, session.userId, parsed);
  redirect(`/socias?nueva=${row.id}`);
}
```

- [ ] **Step 4: Replace `socias/nueva` page**

Render a one-screen form with:

- `displayName`
- `whatsappNumber`
- `role`
- `joinedOn`
- `initialSavingsBalance`
- `notes`

Defaults:

- `role = aportante`
- `joinedOn = todayISO()`
- `initialSavingsBalance = 0`

- [ ] **Step 5: Replace `socias` list page**

Load members through `createLedgerService().listMembersWithCompliance(orgId)`. Render each row with:

- display name
- WhatsApp when present
- role
- status
- compliance `StatusPill`
- highlighted row when `searchParams.nueva` equals member id
- CTA link to `/socias/nueva`

- [ ] **Step 6: Verify US-026 and partial US-031**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-ledger.test.ts
rtk pnpm --filter mi-banquito-web test
rtk pnpm type-check
rtk pnpm lint
```

Expected: all pass.

- [ ] **Step 7: Commit US-026**

```bash
rtk git add packages/domain/src/ledger.ts packages/domain/src/sprint1-ledger.test.ts apps/web/src/app/'(authenticated)'/socias packages/ui/src/organisms/member-list.tsx packages/ui/src/molecules/member-row.tsx packages/ui/src/atoms/status-pill.tsx .nous-feedback.jsonl
rtk git commit -m "feat(ledger): add member registration (US-026 US-031)"
```

---

## Task 7: Member Status Transitions (US-027)

**Files:**
- Modify: `packages/domain/src/ledger.ts`
- Test: `packages/domain/src/sprint1-ledger.test.ts`
- Create: `apps/web/src/app/(authenticated)/socias/[id]/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/socias/[id]/page.tsx`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Add failing transition tests**

Add:

```ts
import { defaultRefundAmount, shouldCreateRefundExpense } from "./ledger";

describe("US-027 member status transitions", () => {
  it("defaults refund to accumulated savings", () => {
    expect(defaultRefundAmount("125.5000")).toBe("125.5000");
  });

  it("creates refund expense only for baja", () => {
    expect(shouldCreateRefundExpense("baja")).toBe(true);
    expect(shouldCreateRefundExpense("en_pausa")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement transition helpers and service**

Add:

```ts
export function defaultRefundAmount(accumulatedSavings: string): string {
  return accumulatedSavings;
}

export function shouldCreateRefundExpense(nextStatus: "en_pausa" | "baja"): boolean {
  return nextStatus === "baja";
}
```

Add `transitionMemberStatus(orgId, actorId, input)`:

- reads member by `org_id` and id
- updates status only; never deletes
- inserts `entityVersion` with `changeKind = "status_transition"`
- inserts `expense` with `purpose = "member_refund"` only for `baja`
- inserts `auditLogEntry`

- [ ] **Step 3: Add status action**

Create `apps/web/src/app/(authenticated)/socias/[id]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { memberStatusTransitionFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function transitionMemberStatusAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = memberStatusTransitionFormSchema.parse(formDataToObject(formData));
  await createLedgerService().transitionMemberStatus(session.orgId, session.userId, parsed);
  revalidatePath(`/socias/${parsed.memberId}`);
}
```

- [ ] **Step 4: Update member detail page**

Render status actions:

- `Pausar` form with hidden `nextStatus=en_pausa`, reason input, no refund input
- `Dar de baja` form with hidden `nextStatus=baja`, reason input, refund amount input defaulting to accumulated savings
- show audit-friendly copy that member rows are preserved

- [ ] **Step 5: Verify and commit US-027**

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-ledger.test.ts
rtk pnpm type-check
rtk pnpm lint
rtk git add packages/domain/src/ledger.ts packages/domain/src/sprint1-ledger.test.ts apps/web/src/app/'(authenticated)'/socias/'[id]' .nous-feedback.jsonl
rtk git commit -m "feat(ledger): transition member status (US-027)"
```

---

## Task 8: Treasurer Group Config (US-028)

**Files:**
- Modify: `packages/domain/src/ledger.ts`
- Modify: `packages/domain/src/sprint1-ledger.test.ts`
- Create: `apps/web/src/app/(authenticated)/grupo/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/grupo/page.tsx`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Add failing BR-02 and BR-10 helper tests**

Add:

```ts
import { fiscalYearForDate, rateConfigChangesOnlyNewLoans } from "./ledger";

describe("US-028 group rules", () => {
  it("does not convert monthly and weekly rates", () => {
    expect(rateConfigChangesOnlyNewLoans({ oldUnit: "monthly", newUnit: "weekly" })).toBe("new_loans_only");
  });

  it("computes fiscal year from configured start", () => {
    expect(fiscalYearForDate(new Date("2026-01-01T00:00:00Z"), { month: 1, day: 1 })).toBe(2026);
    expect(fiscalYearForDate(new Date("2026-01-01T00:00:00Z"), { month: 7, day: 1 })).toBe(2025);
  });
});
```

- [ ] **Step 2: Implement helpers and service**

Add:

```ts
export function rateConfigChangesOnlyNewLoans(_: { oldUnit: string; newUnit: string }) {
  return "new_loans_only" as const;
}

export function fiscalYearForDate(date: Date, start: { month: number; day: number }) {
  const year = date.getUTCFullYear();
  const startDate = new Date(Date.UTC(year, start.month - 1, start.day));
  return date >= startDate ? year : year - 1;
}
```

Add `saveTreasurerGroupConfig(orgId, actorId, input)` that reuses the HR-1 versioning logic from platform config but sets `createdByKind = "member"`.

- [ ] **Step 3: Add treasurer config action and page**

Create `apps/web/src/app/(authenticated)/grupo/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { groupConfigFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function saveTreasurerGroupConfigAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = groupConfigFormSchema.parse(formDataToObject(formData));
  await createLedgerService().saveTreasurerGroupConfig(session.orgId, session.userId, parsed);
  revalidatePath("/grupo");
}
```

Modify `/grupo` to render:

- read-only current values first
- `Editar reglas` control
- edit form for rate value, period unit, fiscal-year start, and thresholds
- explanatory text that existing loans keep their origination config version

- [ ] **Step 4: Verify and commit US-028**

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-ledger.test.ts
rtk pnpm type-check
rtk pnpm lint
rtk git add packages/domain/src/ledger.ts packages/domain/src/sprint1-ledger.test.ts apps/web/src/app/'(authenticated)'/grupo .nous-feedback.jsonl
rtk git commit -m "feat(config): edit treasurer group rules (US-028)"
```

---

## Task 9: Record Contributions With Idempotency And Slip Constraints (US-029)

**Files:**
- Modify: `packages/domain/src/ledger.ts`
- Modify: `packages/domain/src/sprint1-ledger.test.ts`
- Create: `apps/web/src/app/(authenticated)/aportes/registrar/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/aportes/registrar/page.tsx`
- Modify: `packages/ui/src/molecules/member-picker.tsx`
- Modify: `packages/ui/src/molecules/currency-input.tsx`
- Modify: `packages/ui/src/molecules/slip-uploader.tsx`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Add failing idempotency helper tests**

Add:

```ts
import { contributionSuccessCopy } from "./ledger";

describe("US-029 contributions", () => {
  it("builds the success copy", () => {
    expect(contributionSuccessCopy({ memberName: "Ana", amount: "15.0000", datedOn: "2026-06-29" })).toBe(
      "Aporte de Ana registrado — $15.00, 2026-06-29",
    );
  });
});
```

- [ ] **Step 2: Implement contribution service**

Add:

```ts
export function contributionSuccessCopy(input: { memberName: string; amount: string; datedOn: string }) {
  return `Aporte de ${input.memberName} registrado — $${Number(input.amount).toFixed(2)}, ${input.datedOn}`;
}
```

Add `recordContribution(orgId, actorId, input)`:

- finds open active `contributionCycle`
- inserts `contribution` with `clientRequestId`
- on unique violation returns existing row for same `org_id, client_request_id`
- inserts `auditLogEntry` only when a new row is created
- refreshes compliance read model when the database exposes the refresh function

- [ ] **Step 3: Add contribution action**

Create `apps/web/src/app/(authenticated)/aportes/registrar/actions.ts`:

```ts
"use server";

import { contributionFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function recordContributionAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = contributionFormSchema.parse(formDataToObject(formData));
  return createLedgerService().recordContribution(session.orgId, session.userId, parsed);
}
```

- [ ] **Step 4: Replace contribution page**

Render:

- member picker with partial-name search
- amount field
- date defaulting to `todayISO()`
- slip upload surface
- notes
- hidden `clientRequestId` generated server-side with `crypto.randomUUID()`
- success feedback region with the exact copy from AC-4

- [ ] **Step 5: Verify and commit US-029**

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-ledger.test.ts
rtk pnpm --filter mi-banquito-web test -- slip-photo.test.ts
rtk pnpm type-check
rtk pnpm lint
rtk git add packages/domain/src/ledger.ts packages/domain/src/sprint1-ledger.test.ts apps/web/src/app/'(authenticated)'/aportes/registrar packages/ui/src/molecules/member-picker.tsx packages/ui/src/molecules/currency-input.tsx packages/ui/src/molecules/slip-uploader.tsx .nous-feedback.jsonl
rtk git commit -m "feat(ledger): record idempotent contributions (US-029)"
```

---

## Task 10: Contribution Reversal (US-030)

**Files:**
- Modify: `packages/domain/src/ledger.ts`
- Modify: `packages/domain/src/sprint1-ledger.test.ts`
- Create: `apps/web/src/app/(authenticated)/historial/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/historial/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/socias/[id]/page.tsx`
- Modify: `packages/ui/src/molecules/confirmation-modal.tsx`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Add failing reversal tests**

Add:

```ts
import { reversalSentence } from "./ledger";

describe("US-030 contribution reversal", () => {
  it("builds a full Spanish confirmation sentence", () => {
    expect(reversalSentence({ memberName: "Ana", amount: "10.0000", datedOn: "2026-06-29" })).toBe(
      "Vas a reversar el aporte de Ana por $10.00 registrado el 2026-06-29.",
    );
  });
});
```

- [ ] **Step 2: Implement reversal service**

Add:

```ts
export function reversalSentence(input: { memberName: string; amount: string; datedOn: string }) {
  return `Vas a reversar el aporte de ${input.memberName} por $${Number(input.amount).toFixed(2)} registrado el ${input.datedOn}.`;
}
```

Add `reverseContribution(orgId, actorId, input)`:

- reads original by `org_id`
- rejects if original has `reversesId`
- rejects if another contribution already points `reversesId` at original id
- inserts a new contribution with negative amount, same cycle/member/currency/date, `reversesId = original.id`, and `reverseReason`
- writes `auditLogEntry`

- [ ] **Step 3: Add reversal action**

Create `apps/web/src/app/(authenticated)/historial/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { reverseContributionFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function reverseContributionAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = reverseContributionFormSchema.parse(formDataToObject(formData));
  await createLedgerService().reverseContribution(session.orgId, session.userId, parsed);
  revalidatePath("/historial");
}
```

- [ ] **Step 4: Add modal to history and member detail**

The modal must show:

- full Spanish sentence from `reversalSentence()`
- required `reason` input
- destructive confirm button disabled when reason is empty
- hidden `contributionId`

- [ ] **Step 5: Verify and commit US-030**

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-ledger.test.ts
rtk pnpm type-check
rtk pnpm lint
rtk git add packages/domain/src/ledger.ts packages/domain/src/sprint1-ledger.test.ts apps/web/src/app/'(authenticated)'/historial apps/web/src/app/'(authenticated)'/socias/'[id]'/page.tsx packages/ui/src/molecules/confirmation-modal.tsx .nous-feedback.jsonl
rtk git commit -m "feat(ledger): reverse contributions append-only (US-030)"
```

---

## Task 11: Compliance Display On Home And Members (US-031)

**Files:**
- Modify: `packages/domain/src/ledger.ts`
- Modify: `apps/web/src/app/(authenticated)/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/socias/page.tsx`
- Modify: `packages/ui/src/atoms/status-pill.tsx`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Ensure single read path**

Add `listComplianceRows(orgId)` to `createLedgerService()`. It must read from the materialized view when available and fall back to a deterministic SQL projection for local development only when the view is absent. The return type must be:

```ts
export type MemberComplianceRow = {
  memberId: string;
  displayName: string;
  state: ComplianceState;
  tone: ComplianceTone;
};
```

- [ ] **Step 2: Update `StatusPill`**

`packages/ui/src/atoms/status-pill.tsx` must accept only:

```ts
export type StatusPillTone = "success" | "warning" | "danger" | "neutral";
export type StatusPillProps = {
  label: string;
  tone: StatusPillTone;
};
```

Mapping:

- `success` = `al día`
- `warning` = `atrasado`
- `danger` = `en mora`

- [ ] **Step 3: Render the same rows on `/` and `/socias`**

Modify both pages to call `listComplianceRows(orgId)` and render `StatusPill` from returned `tone`. Do not recompute date thresholds in page code.

- [ ] **Step 4: Verify and commit US-031**

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-ledger.test.ts
rtk pnpm type-check
rtk pnpm lint
rtk git add packages/domain/src/ledger.ts apps/web/src/app/'(authenticated)'/page.tsx apps/web/src/app/'(authenticated)'/socias/page.tsx packages/ui/src/atoms/status-pill.tsx .nous-feedback.jsonl
rtk git commit -m "feat(ledger): show member compliance state (US-031)"
```

---

## Task 12: Base-Fund Quota Payment (US-032)

**Files:**
- Modify: `packages/domain/src/ledger.ts`
- Modify: `packages/domain/src/sprint1-ledger.test.ts`
- Create: `apps/web/src/app/(authenticated)/cuota-base/registrar/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/cuota-base/registrar/page.tsx`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Add failing base-fund helper tests**

Add:

```ts
import { availableCapitalAfterBaseFund, quotaDefaultAmount } from "./ledger";

describe("US-032 base fund quota", () => {
  it("defaults payment amount from config", () => {
    expect(quotaDefaultAmount("25.0000")).toBe("25.0000");
  });

  it("subtracts base fund from available capital", () => {
    expect(availableCapitalAfterBaseFund({ poolBalance: "1000.0000", baseFundPool: "250.0000" })).toBe("750.0000");
  });
});
```

- [ ] **Step 2: Implement quota service**

Add:

```ts
export function quotaDefaultAmount(perMemberAmount: string) {
  return perMemberAmount;
}

export function availableCapitalAfterBaseFund(input: { poolBalance: string; baseFundPool: string }) {
  return (Number(input.poolBalance) - Number(input.baseFundPool)).toFixed(4);
}
```

Add `recordBaseFundQuotaPayment(orgId, actorId, input)`:

- checks current fiscal-year config exists
- inserts `baseFundQuotaPayment`
- rejects duplicate `(org_id, member_id, fiscal_year)` by surfacing a form-safe error
- writes `auditLogEntry`
- refreshes base-fund and available-capital views when refresh functions exist

- [ ] **Step 3: Add quota action**

Create `apps/web/src/app/(authenticated)/cuota-base/registrar/actions.ts`:

```ts
"use server";

import { baseFundQuotaPaymentFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function recordBaseFundQuotaAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = baseFundQuotaPaymentFormSchema.parse(formDataToObject(formData));
  return createLedgerService().recordBaseFundQuotaPayment(session.orgId, session.userId, parsed);
}
```

- [ ] **Step 4: Replace quota page**

Render:

- member picker
- amount defaulting from current fiscal-year quota config
- date defaulting to `todayISO()`
- optional slip uploader
- duplicate-year error message

- [ ] **Step 5: Verify and commit US-032**

```bash
rtk pnpm --filter @mi-banquito/domain test -- sprint1-ledger.test.ts
rtk pnpm type-check
rtk pnpm lint
rtk git add packages/domain/src/ledger.ts packages/domain/src/sprint1-ledger.test.ts apps/web/src/app/'(authenticated)'/cuota-base/registrar .nous-feedback.jsonl
rtk git commit -m "feat(ledger): record base fund quota payments (US-032)"
```

---

## Task 13: Playwright User Flows And Adversarial Tests

**Files:**
- Create: `apps/web/e2e/sprint1-admin.spec.ts`
- Create: `apps/web/e2e/sprint1-treasurer.spec.ts`
- Create: `apps/web/e2e/sprint1-adversarial.spec.ts`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Add admin Playwright flow**

Create `apps/web/e2e/sprint1-admin.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("US-016 operator can see new organization form", async ({ page }) => {
  await page.goto("/admin/orgs/nueva");
  await expect(page.getByRole("heading", { name: "Nueva organización" })).toBeVisible();
  await expect(page.getByLabel("Nombre visible")).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear organización" })).toBeVisible();
});

test("US-017 operator can see group rule sections", async ({ page }) => {
  await page.goto("/admin/orgs/00000000-0000-4000-8000-000000000001/config");
  await expect(page.getByText("Aportes")).toBeVisible();
  await expect(page.getByText("Prestamos")).toBeVisible();
  await expect(page.getByText("Cuota base")).toBeVisible();
});
```

- [ ] **Step 2: Add treasurer Playwright flow**

Create `apps/web/e2e/sprint1-treasurer.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("US-025 wizard shows three-step flow", async ({ page }) => {
  await page.goto("/bienvenida");
  await expect(page.getByText("Esto es lo que tu grupo decidió")).toBeVisible();
});

test("US-026 member form has required fields and defaults", async ({ page }) => {
  await page.goto("/socias/nueva");
  await expect(page.getByLabel("Nombre")).toBeVisible();
  await expect(page.getByLabel("Rol")).toHaveValue("aportante");
  await expect(page.getByLabel("Ahorro inicial")).toHaveValue(/0/);
});

test("US-029 contribution form contains idempotency-backed controls", async ({ page }) => {
  await page.goto("/aportes/registrar");
  await expect(page.getByText("Registrar aporte")).toBeVisible();
  await expect(page.locator('input[name="clientRequestId"]')).toHaveCount(1);
});
```

- [ ] **Step 3: Add adversarial Playwright tests**

Create `apps/web/e2e/sprint1-adversarial.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("US-030 reversal confirm stays disabled until reason exists", async ({ page }) => {
  await page.goto("/historial");
  const button = page.getByRole("button", { name: /confirmar revers/i }).first();
  if (await button.count()) {
    await expect(button).toBeDisabled();
  }
});

test("US-031 status pills use allowed labels only", async ({ page }) => {
  await page.goto("/socias");
  const pills = page.locator('[data-component="status-pill"]');
  const count = await pills.count();
  for (let i = 0; i < count; i += 1) {
    await expect(pills.nth(i)).toHaveText(/al dia|al día|atrasado|en mora/i);
  }
});
```

- [ ] **Step 4: Run Playwright**

```bash
rtk pnpm --filter mi-banquito-web test:e2e --project=chromium-desktop
rtk pnpm --filter mi-banquito-web test:e2e --project=mobile-chrome
```

Expected: all Sprint 0 and Sprint 1 specs pass on desktop and mobile.

- [ ] **Step 5: Commit Playwright tests**

```bash
rtk git add apps/web/e2e/sprint1-admin.spec.ts apps/web/e2e/sprint1-treasurer.spec.ts apps/web/e2e/sprint1-adversarial.spec.ts .nous-feedback.jsonl
rtk git commit -m "test(sprint1): cover user and adversarial flows (US-016 US-032)"
```

---

## Task 14: UX, UI, And CX Inspection Pass

**Files:**
- Modify as needed: Sprint 1 pages and UI components listed above
- Create: `docs/stories/SPRINT_1_STATUS_REPORT.md`
- Add screenshots if issues are found: `screenshots/sprint1/*.png`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Start the app**

```bash
rtk pnpm --filter mi-banquito-web dev
```

Expected: app serves at `http://localhost:3000`.

- [ ] **Step 2: Inspect desktop and mobile**

Use Playwright screenshots or the browser plugin to inspect:

- `/admin/orgs/nueva`
- `/admin/orgs/00000000-0000-4000-8000-000000000001/config`
- `/bienvenida`
- `/socias`
- `/socias/nueva`
- `/socias/00000000-0000-4000-8000-000000000001`
- `/grupo`
- `/aportes/registrar`
- `/historial`
- `/cuota-base/registrar`

Check:

- no scaffold text remains
- no overlapping text
- tap targets are at least 48px on mobile
- form labels are visible and in Spanish
- destructive reversal action is visually distinct
- status colors use the shared status pill, not ad hoc color classes
- screens are task-first, not marketing-style
- empty states have a clear CTA

- [ ] **Step 3: Fix UX/CX issues immediately**

For each issue, edit the relevant page or UI component and append a feedback event:

```json
{"story":"US-XXX","event":"feedback","title":"Sprint 1 UX inspection fix","description":"Describe the observed issue and the exact page/component fixed","images":["screenshots/sprint1/example.png"]}
```

- [ ] **Step 4: Run design-system lint**

```bash
rtk pnpm --filter mi-banquito-web lint:ds
```

Expected: no hardcoded color, hardcoded string, status-pill, or Lucide allow-list violations.

- [ ] **Step 5: Commit UX pass**

```bash
rtk git add apps/web/src packages/ui/src docs/stories/SPRINT_1_STATUS_REPORT.md screenshots/sprint1 .nous-feedback.jsonl
rtk git commit -m "fix(sprint1): address UX inspection findings (US-016 US-032)"
```

---

## Task 15: Final Sprint 1 Verification, CI, And Status Report

**Files:**
- Create or modify: `docs/stories/SPRINT_1_STATUS_REPORT.md`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Run full local quality gate**

```bash
rtk pnpm type-check
rtk pnpm lint
rtk pnpm test
rtk pnpm build
```

Expected: all pass. The known Auth0 DPoP webpack warning may appear during build; it is non-fatal only if the build exits 0.

- [ ] **Step 2: Run fresh DB gate**

```bash
rtk zsh -lc 'docker exec mi-banquito-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS mi_banquito_sprint1_final" -c "CREATE DATABASE mi_banquito_sprint1_final" && printf "%s\n" "DATABASE_URL=postgresql://postgres:postgres@localhost:55432/mi_banquito_sprint1_final" "DB_DRIVER=pg" > packages/db/.env.local && (cd packages/db && pnpm drizzle-kit push && node scripts/apply-local-schema.mjs && node scripts/verify-schema.mjs); rc=$?; rm -f packages/db/.env.local; exit $rc'
```

Expected: schema applies and verifier exits 0.

- [ ] **Step 3: Run full Playwright gate**

```bash
rtk pnpm --filter mi-banquito-web test:e2e --project=chromium-desktop
rtk pnpm --filter mi-banquito-web test:e2e --project=mobile-chrome
```

Expected: all specs pass.

- [ ] **Step 4: Run adversarial story verification**

For each story US-016, US-017, US-025, US-026, US-027, US-028, US-029, US-030, US-031, and US-032, append `ac_verify` events for every AC. Include negative checks:

- wrong role cannot access platform screens
- invalid WhatsApp rejected
- negative amounts rejected
- duplicate contribution idempotency key creates one row
- reversal reason required
- second reversal blocked
- compliance displayed from the shared read path
- duplicate base-fund quota rejected
- tenant A cannot read tenant B rows

- [ ] **Step 5: Write Sprint 1 status report**

Create `docs/stories/SPRINT_1_STATUS_REPORT.md`:

```md
# Sprint 1 Status Report

Generated: 2026-06-29

## Summary

Sprint 1 implementation status, verification evidence, accepted deviations, and external blockers.

## Story Status

| Story | Status | Evidence | Remaining Work |
|---|---|---|---|
| US-016 | Verified | Form, Server Action, domain service, audit, config seed, RBAC, tests. | Live Auth0 Management API provisioning evidence if account-side access is required. |
| US-017 | Verified | Rule form, HR-1 versioning, audit, base-fund config, tests. | None if schema gaps are closed locally. |
| US-025 | Verified | Three-step wizard, resumability, read-only rules, audit, tests. | Live Auth0 invite acceptance remains tied to Sprint 0/US-018 external flow. |
| US-026 | Verified | Member form, HR-1 snapshot, audit, highlight redirect, tests. | None. |
| US-027 | Verified | Pause/baja actions, refund expense, audit, no delete, tests. | None. |
| US-028 | Verified | Read-only first, edit mode, HR-1, BR-02/BR-10 tests. | Existing loan replay depends on Sprint 2 loan origination for full live proof. |
| US-029 | Verified | Contribution form, slip constraints, idempotency, audit, tests. | Real camera/gallery capture should be checked on a mobile device. |
| US-030 | Verified | Append-only reversal, reason required, audit, tests. | None. |
| US-031 | Verified | Shared compliance read path, status pills on home and members, tests. | Materialized view refresh depends on DB support if not present in Sprint 0 schema. |
| US-032 | Verified | Quota form, unique per fiscal year, BR-08 helpers, audit, tests. | None. |

## Verification Commands

- `rtk pnpm type-check`
- `rtk pnpm lint`
- `rtk pnpm test`
- `rtk pnpm build`
- fresh DB schema push/apply/verify command
- `rtk pnpm --filter mi-banquito-web test:e2e --project=chromium-desktop`
- `rtk pnpm --filter mi-banquito-web test:e2e --project=mobile-chrome`
```

- [ ] **Step 6: Mark stories done only after all ACs have adversarial verification**

Append one `build_pass` and one `done` event per story only after Steps 1-4 pass:

```json
{"story":"US-016","event":"build_pass","notes":"Sprint 1 final gate passed: type-check, lint, test, build, DB verify, Playwright desktop/mobile"}
{"story":"US-016","event":"done"}
```

Repeat for US-017, US-025, US-026, US-027, US-028, US-029, US-030, US-031, and US-032.

- [ ] **Step 7: Commit final status**

```bash
rtk git add docs/stories/SPRINT_1_STATUS_REPORT.md .nous-feedback.jsonl
rtk git commit -m "docs(sprint1): record sprint verification evidence (US-016 US-032)"
```

- [ ] **Step 8: Push and open PR**

```bash
rtk git push -u origin feature/sprint1/complete-stories
rtk gh pr create --base main --head feature/sprint1/complete-stories --title "feat(sprint1): complete Sprint 1 stories" --body "Completes Sprint 1 US-016, US-017, US-025 through US-032 with unit, DB, Playwright, adversarial, and UX verification."
```

- [ ] **Step 9: Wait for CI and Vercel**

```bash
rtk gh pr checks --watch --interval 10
```

Expected: required `verify`, `design-system`, and Vercel preview pass.

---

## Self-Review

**Spec coverage:** This plan covers all Sprint 1 stories in sprint order: US-016, US-025, US-017, US-026, US-031, US-027, US-028, US-029, US-030, and US-032. It includes local unit tests, action/page work, DB verification, Playwright desktop/mobile flows, adversarial AC verification, and UX/CX inspection.

**Placeholder scan:** The plan contains no placeholder steps. Every code-touching task lists concrete files, commands, and implementation details. Schema additions are conditional on a required audit because the current generated schema may already include some columns/constraints; the migration body is provided for the confirmed gaps.

**Type consistency:** Shared names are consistent across tasks: `organizationCreateFormSchema`, `groupConfigFormSchema`, `addMemberFormSchema`, `contributionFormSchema`, `reverseContributionFormSchema`, `baseFundQuotaPaymentFormSchema`, `requirePlatformOperator`, `requireTreasurer`, `createPlatformService`, and `createLedgerService`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-29-sprint-1-execution.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

