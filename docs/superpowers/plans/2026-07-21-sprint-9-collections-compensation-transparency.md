# Sprint 9 Collections, Compensation, And Transparency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Sprint 9's US-048 and US-096 through US-099 with production-ready member statements, governed extraordinary collections, a cumulative no-double-dip treasurer-compensation ceiling, and complete append-only transparency across statements, liquidity, share-out, and public verification.

**Architecture:** Finish the existing US-048 reporting seam first, then add one CHG-011 migration that makes the existing collection tables usable without altering the immutable init migration. Put collection commands, compensation arithmetic, and transparency projections in focused domain modules; Server Components read those modules and strict Server Actions perform writes. Preserve the verified Sprint 8 movement and BR-12 infrastructure by extending its transfer regularization path, and preserve the substrate-generated Lucide icons exactly as asserted by the existing navigation tests.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM, PostgreSQL RLS/triggers/advisory locks, Zod, Auth0, `@react-pdf/renderer`, Vitest, fast-check, React Testing Library, Playwright, Tailwind v4 design tokens.

---

## Authoritative Inputs And Execution Order

This plan replaces the deleted 2026-07-19 plan. It is based on substrate commit `71f65e7` and CHG-011. Before executing any task, re-read:

- `CLAUDE.md`
- `docs/stories/SPRINT_PLAN.md`
- `docs/stories/sprint-9/r1_reporting_us_048.md`
- `docs/stories/sprint-9/r2_chg_us_096.md`
- `docs/stories/sprint-9/r2_chg_us_097.md`
- `docs/stories/sprint-9/r2_chg_us_098.md`
- `docs/stories/sprint-9/r2_chg_us_099.md`
- `docs/specs/04_er_model.md` at `ExtraordinaryCollection` and its CHG-011 mutation contract
- `docs/specs/09b_business_rules.md` at BR-15
- `docs/screens/SCR-solidarity-collection.json`
- `docs/screens/SCR-record-movement.json`
- `docs/dev-guide/TESTING.md`, `FEEDBACK.md`, and `DEFINITION_OF_DONE.md`

Implement in this dependency order:

1. US-048: complete and verify the member-statement foundation already partially present.
2. US-096: ship the CHG-011 schema/trigger contract, collection commands, BR-12 extension, and collect UI.
3. US-097: add payout/cancellation, explicit surplus disposition, and closing lifecycle.
4. US-098: add the exact cumulative BR-15 ceiling and governed manual payout.
5. US-099: make all reporting surfaces consume one complete append-only projection.

US-097 and US-098 may be implemented in parallel only after the US-096 migration and public domain contracts are merged.

## Locked Design Decisions

- **Icons need no Sprint 9 code change.** The refreshed `regenerate-sidebar.py` now validates declared icons against `lucide_valid_exports.json`, refuses silent `Circle` fallback, and emits the meaningful icons expected by `nav-items.test.ts`. Treat `Home`, `Users`, `Wallet`, `Banknote`, `HandCoins`, and the distinct admin icons as a regression gate; never weaken those assertions.
- **Fiscal-year recognition is integer-keyed.** Use `recognition_fiscal_year`, never the superseded `recognition_period_label` and never `opened_on`, to attribute a `treasurer_recognition` collection.
- **BR-15 is cumulative and arithmetic.** For each year, recognition is `max(accrual, recognition-collection total)`. Entitlement and paid totals accumulate from org inception through the selected fiscal year. Automated US-050 withdrawals and prior manual compensation expenses share one entitlement.
- **CHG-011 names are exact.** The header fields are `surplus_amount`, `disposition`, `disposition_motive`, and `surplus_transfer_id`; values are `returned | retained`. Do not introduce `surplus_disposition`, `return`, or `retain`.
- **Zero surplus is explicit money with empty disposition metadata.** At `closed`/`cancelled`, persist `surplus_amount='0.0000'`; keep `disposition`, `disposition_motive`, and `surplus_transfer_id` null.
- **A returned surplus uses one transfer.** Because the ER model has one `surplus_transfer_id`, the command accepts one active same-org non-group destination account representing the return channel to contributors. `retained` writes no transfer and requires a non-empty group-vote reference in `disposition_motive`.
- **Recognition collections need a legal close path.** The screen's recognition variant closes through the only CHG-011-legal sequence, `collecting -> paid_out -> closed`, without creating a solidarity expense. It records the entire regularized recognition amount as retained surplus and requires the group-vote reference. This makes a production-created collection eligible for BR-15 without inventing the forbidden `collecting -> closed` transition.
- **Logical and physical balances are different.** `fund_pool_balance` remains the regularized, spendable core-fund balance and excludes collection inflows, solidarity payouts, and collection-return transfers together. A new physical-cash projection includes collection cash and its payout/return. Collections never inflate BR-09 share-out.
- **No new REST route is required.** Reads use Server Components/domain services and writes use Server Actions. Run API reconciliation to prove the empty registry remains reconciled.

## Known Pre-Existing Closure Blocker

At planning time, `./infra/scripts/validate-routes.sh` fails on three pages unrelated to Sprint 9 because they are absent from `docs/specs/07c_navigation_map.json`: `/acceso-denegado`, `/admin/orgs/[id]/period-close/[periodCloseId]/adjust`, and `/admin/orgs/new`. Do not delete those pages or hand-edit the generated nav map as part of Sprint 9. Request a Nous navigation-map repair and sync it before Task 16; implementation may proceed, but no Sprint 9 story may be marked `done` while this mandatory route gate is red.

The fourth reported mismatch is in scope: the nav map declares `/verify/[hash]` as a page, but the code currently implements `route.ts`. Task 13 converts it to the required public Server Component and removes the conflicting route handler. The API registry has zero endpoints, so the old JSON response is not a registered contract that must be preserved.

## File Map

Create:

- `packages/db/src/migrations/V20260721130000__extraordinary_collection_lifecycle.sql` — CHG-011 columns, constraints, RLS-safe indexes, line reversal/account requirements, trigger replacement, and BR-12 collection regularization.
- `packages/db/src/migrations/V20260721140000__sprint9_balance_projections.sql` — separate post-lifecycle repair for core-fund, physical-cash, and collection-cash projections.
- `packages/db/src/sprint9-schema.test.ts` — Drizzle parity plus adversarial real-PostgreSQL trigger tests.
- `packages/domain/src/money4.ts` — exact `numeric(18,4)` parsing and bigint-unit arithmetic.
- `packages/domain/src/money4.test.ts` — deterministic property tests for exact money.
- `packages/domain/src/member-statements.ts` — US-048 preview/generation query seam extracted from the oversized reporting service.
- `packages/domain/src/member-statements.test.ts` — real-PostgreSQL batch, preview, idempotency, hash, audit, and tenant tests.
- `packages/domain/src/extraordinary-collections.ts` — collection progress and all US-096/097 commands.
- `packages/domain/src/extraordinary-collections.test.ts` — behavioral lifecycle, money properties, real database, audit, and tenant tests.
- `packages/domain/src/treasurer-compensation.ts` — BR-15 breakdown, typed error, and transactional payout service.
- `packages/domain/src/treasurer-compensation.test.ts` — property and real-PostgreSQL AC-9 regression tests.
- `packages/domain/src/transparency.ts` — one normalized append-only read model and balance projection.
- `packages/domain/src/transparency.test.ts` — BR-16 completeness oracle, reversal properties, and tenant isolation.
- `apps/web/src/app/(authenticated)/estados/statement-preview.tsx` — reusable pre/post generation preview.
- `apps/web/src/app/(authenticated)/estados/actions.test.ts` — real-service action boundary tests.
- `apps/web/src/app/(authenticated)/colectas/actions.ts` — strict collection Server Actions.
- `apps/web/src/app/(authenticated)/colectas/actions.test.ts` — authenticated real-service action tests.
- `apps/web/src/app/(authenticated)/colectas/collection-forms.tsx` — interactive collect, cancel, recognition-close, and payout forms.
- `apps/web/src/app/(authenticated)/colectas/page.test.tsx` — pure view-state and accessibility contracts without mocking owned services.
- `apps/web/e2e/sprint9-financial-transparency.spec.ts` — seeded desktop/mobile critical journey.

Modify:

- `packages/db/src/schema.ts`
- `packages/domain/src/index.ts`
- `packages/domain/src/reporting.ts`
- `packages/domain/src/reporting.test.ts`
- `packages/domain/src/movements.ts`
- `packages/domain/src/movements.test.ts`
- `packages/domain/src/liquidity.ts`
- `packages/domain/src/liquidity.test.ts`
- `packages/domain/src/shareout.ts`
- `packages/domain/src/shareout.test.ts`
- `apps/web/src/app/(authenticated)/estados/actions.ts`
- `apps/web/src/app/(authenticated)/estados/page.tsx`
- `apps/web/src/app/(authenticated)/estados/page.test.tsx`
- `apps/web/src/app/(authenticated)/socias/[id]/page.tsx`
- `apps/web/src/app/(authenticated)/socias/[id]/page.test.tsx`
- `apps/web/src/app/(authenticated)/colectas/page.tsx`
- `apps/web/src/app/(authenticated)/movimientos/registrar/actions.ts`
- `apps/web/src/app/(authenticated)/movimientos/registrar/actions.test.ts`
- `apps/web/src/app/(authenticated)/movimientos/registrar/movement-forms.tsx`
- `apps/web/src/app/(authenticated)/movimientos/registrar/page.tsx`
- `apps/web/src/app/(authenticated)/movimientos/registrar/page.test.tsx`
- `apps/web/src/app/(authenticated)/liquidez/page.tsx`
- `apps/web/src/app/(authenticated)/liquidez/page.test.tsx`
- `apps/web/src/app/(authenticated)/reparto/page.tsx`
- `apps/web/src/app/(authenticated)/reparto/page.test.tsx`
- `apps/web/src/app/verify/[hash]/page.tsx`
- `apps/web/src/app/verify/[hash]/page.test.tsx`
- `apps/web/src/lib/monthly-member-artifact.tsx`
- `apps/web/src/lib/i18n/en-US.json`
- `.nous-feedback.jsonl`

Do not modify:

- `packages/db/src/migrations/V20260202151603__init_schema.sql`
- `apps/web/src/components/shell/nav-items.gen.ts`
- `infra/scripts/regenerate-sidebar.py`
- `infra/scripts/allowed_lucide_icons.json`
- `infra/scripts/lucide_valid_exports.json`
- `testing/critical-paths.md`
- `docs/dev-guide/TESTING.md`

Delete during Task 13:

- `apps/web/src/app/verify/[hash]/route.ts` — replace the unregistered JSON/HTML route handler with the nav-map-required page.

---

### Task 1: Establish The Refreshed Baseline And Start Sprint Evidence

**Files:**
- Verify: `apps/web/src/components/shell/nav-items.test.ts`
- Verify: `infra/scripts/regenerate-sidebar.py`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Prove the substrate-generated icons are correct before feature work**

Run:

```bash
rtk ./infra/scripts/regenerate-sidebar.py --check
rtk pnpm --filter mi-banquito-web test -- src/components/shell/nav-items.test.ts
rtk pnpm --filter mi-banquito-web lint:ds
```

Expected: all commands pass; declared icons never silently become `Circle`, and the meaningful-icon test remains unchanged.

- [ ] **Step 2: Record the five story starts and CHG-011 interpretation**

Append exactly these JSONL records:

```jsonl
{"story":"US-048","event":"started","agent":"codex"}
{"story":"US-096","event":"started","agent":"codex"}
{"story":"US-097","event":"started","agent":"codex"}
{"story":"US-098","event":"started","agent":"codex"}
{"story":"US-099","event":"started","agent":"codex"}
{"story":"US-096","event":"decision","id":"CHG-011-RECOGNITION-CLOSE","text":"Close a treasurer-recognition collection through collecting->paid_out->closed without a solidarity expense; retain its full regularized amount with a required group-vote motive.","reason":"The amended mutation contract forbids collecting->closed, while BR-15 requires production-created closed recognition collections."}
{"story":"US-097","event":"decision","id":"CHG-011-RETURN-CHANNEL","text":"A returned surplus writes the single header-linked Transfer to one active same-org non-group return-channel account selected by the treasurer.","reason":"The ER model exposes one surplus_transfer_id while describing a return to contributors."}
{"story":"SPRINT-9","event":"feedback","notes":"Pre-existing route gate requires Nous nav-map entries for /acceso-denegado, /admin/orgs/[id]/period-close/[periodCloseId]/adjust, and /admin/orgs/new before Sprint 9 can be marked done."}
```

- [ ] **Step 3: Commit only the lifecycle evidence**

```bash
rtk git add .nous-feedback.jsonl
rtk git commit -m "chore(sprint): start Sprint 9 CHG-011 delivery (US-048, US-096, US-097, US-098, US-099)"
```

---

### Task 2: Extract And Complete The US-048 Member-Statement Service

**Files:**
- Create: `packages/domain/src/member-statements.ts`
- Create: `packages/domain/src/member-statements.test.ts`
- Modify: `packages/domain/src/reporting.ts`
- Modify: `packages/domain/src/reporting.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Write a failing real-PostgreSQL US-048 contract**

Use the existing `movements.test.ts` database setup pattern and seed two orgs, one closed cycle, two active members, one inactive member, contributions, withdrawals, branding, and a cross-tenant sentinel:

```ts
it("GIVEN a closed period WHEN preview and batch run THEN active members receive stable isolated archives", async () => {
  const preview = await service.preview({
    orgId: ORG_A,
    periodCloseId,
    memberId: MEMBER_A,
    statementCopy,
  });
  expect(preview.payload.member.id).toBe(MEMBER_A);
  expect(preview.payload.orgName).toBe("Grupo A");
  expect(preview.canonicalPayloadHash).toBe(sha256Hex(canonicalJson(preview.payload)));

  const first = await service.generate({
    orgId: ORG_A,
    actorId: TREASURER_A,
    periodCloseId,
    statementCopy,
    createArtifact: localArtifactWriter,
  });
  const replay = await service.generate({
    orgId: ORG_A,
    actorId: TREASURER_A,
    periodCloseId,
    statementCopy,
    createArtifact: localArtifactWriter,
  });

  expect(first).toEqual({ generated: 2, reused: 0 });
  expect(replay).toEqual({ generated: 0, reused: 2 });
  expect(await archiveCount(ORG_A, periodCloseId)).toBe(2);
  expect(await generatedAuditCount(ORG_A, periodCloseId)).toBe(2);
  expect(await archiveCount(ORG_B, periodCloseId)).toBe(0);
});
```

Add exact cases for missing/foreign period close, foreign/inactive member, audit-insert rollback, and stable hashes under shuffled query input. The artifact writer must be a real deterministic local implementation that stores bytes in a test temporary directory; do not mock the member-statement service or database.

- [ ] **Step 2: Run the focused test and confirm the new service is absent**

```bash
rtk pnpm --filter @mi-banquito/domain test -- src/member-statements.test.ts
```

Expected: FAIL because `createMemberStatementService` is not defined.

- [ ] **Step 3: Define the extracted public contract**

Create:

```ts
export type MemberStatementPreview = {
  payload: MonthlyMemberStatementPayload;
  canonicalPayloadHash: string;
};

export interface MemberStatementService {
  preview(input: {
    orgId: string;
    periodCloseId: string;
    memberId: string;
    statementCopy: MonthlyMemberStatementCopy;
  }): Promise<MemberStatementPreview>;
  generate(input: {
    orgId: string;
    actorId: string;
    periodCloseId: string;
    memberId?: string;
    statementCopy: MonthlyMemberStatementCopy;
    createArtifact: (input: MonthlyMemberStatementArtifactInput) => Promise<MonthlyMemberStatementArtifactResult>;
  }): Promise<{ generated: number; reused: number }>;
}

export function createMemberStatementService(options: { now?: () => Date } = {}): MemberStatementService;
```

Move the existing monthly-member query/build loop from `reporting.ts` behind one private `buildPreview(tx, input)` function. Both `preview` and `generate` must call that exact function, so pre-generation preview, archived canonical JSON, PDF input, and verifier input cannot drift.

- [ ] **Step 4: Make the archive uniqueness visible to Drizzle**

Add the existing database constraint to the `statementArchive` table callback without creating another SQL migration:

```ts
unique("uq_statement_archive_org_id_kind_member_id_period_label")
  .on(table.orgId, table.kind, table.memberId, table.periodLabel),
```

Keep `uq_statement_archive_org_id_id`. The migration already exists in `V20260202151603__init_schema.sql`; this step repairs Drizzle metadata parity only.

- [ ] **Step 5: Preserve the old reporting facade during migration**

Have `createReportingService().generateMonthlyMemberStatements(input)` delegate to `createMemberStatementService().generate(input)`. Re-export all moved payload/copy/artifact types from `reporting.ts` and `packages/domain/src/index.ts`, so current callers keep compiling until Task 3 switches them.

- [ ] **Step 6: Run the domain and schema contracts**

```bash
rtk pnpm --filter @mi-banquito/domain test -- src/member-statements.test.ts src/reporting.test.ts
rtk pnpm --filter @mi-banquito/domain type-check
rtk pnpm --filter @mi-banquito/db type-check
```

Expected: PASS; the batch produces exactly one append-only archive and one audit per active member, and the canonical hash is stable.

- [ ] **Step 7: Commit US-048's domain seam**

```bash
rtk git add packages/domain/src/member-statements.ts packages/domain/src/member-statements.test.ts packages/domain/src/reporting.ts packages/domain/src/reporting.test.ts packages/domain/src/index.ts packages/db/src/schema.ts
rtk git commit -m "feat(reporting): complete member statement service (US-048)"
```

---

### Task 3: Finish US-048 Preview, Batch, And Individual UI

**Files:**
- Create: `apps/web/src/app/(authenticated)/estados/statement-preview.tsx`
- Create: `apps/web/src/app/(authenticated)/estados/actions.test.ts`
- Modify: `apps/web/src/app/(authenticated)/estados/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/estados/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/estados/page.test.tsx`
- Modify: `apps/web/src/app/(authenticated)/socias/[id]/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/socias/[id]/page.test.tsx`
- Modify: `apps/web/src/lib/monthly-member-artifact.tsx`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write the failing pure preview-view test**

Extract a serializable view model from each authenticated page and render it without mocking domain code:

```tsx
it("renders the same preview before and after archive generation", () => {
  const view = render(<StatementPreview preview={previewFixture} archiveUri={null} />);
  expect(screen.getByTestId("member_statement_preview")).toHaveTextContent("Ana Mora");
  expect(screen.getByTestId("member_statement_preview")).toHaveTextContent("USD 120.50");
  expect(screen.queryByRole("link", { name: "Abrir PDF" })).not.toBeInTheDocument();

  view.rerender(<StatementPreview preview={previewFixture} archiveUri="/statement-archive/public/hash.pdf" />);
  expect(screen.getByRole("link", { name: "Abrir PDF" })).toHaveAttribute(
    "href",
    "/statement-archive/public/hash.pdf",
  );
});
```

- [ ] **Step 2: Write strict action parsing tests against the real service**

Test unauthenticated, wrong-role, invalid UUID, foreign period close, batch success, individual success, and idempotent replay. Control only Auth0/session and Next.js redirect/revalidation framework seams. Seed the real PostgreSQL rows and assert archives/audits directly.

- [ ] **Step 3: Add strict Zod action schemas**

```ts
const generateStatementsSchema = z.object({
  periodCloseId: z.string().uuid(),
  memberId: z.string().uuid().optional(),
  returnTo: z.string().max(500).optional(),
}).strict();
```

Use the existing scalar `FormData` parser that ignores only React `$ACTION_` keys. Call `requireTreasurer()` before accessing tenant data. Replace the reporting-facade call with `createMemberStatementService().generate(...)`.

- [ ] **Step 4: Add the reusable preview component and page loaders**

`StatementPreview` renders the member, period, opening balance, every section row, closing balance, and a PDF link when one exists. `/socias/[id]` calls `preview` for the latest ready period close and displays the card before generation. `/estados` keeps the closed-period batch CTA and shows the count of active-member archives plus a link to each member detail; it must not add a new route absent from the navigation map.

- [ ] **Step 5: Give the PDF renderer a testable row-model seam**

Export:

```ts
export function monthlyMemberPdfRows(input: MonthlyMemberStatementArtifactInput) {
  return input.payload.sections.flatMap((section) => section.rows.map((row) => ({
    sectionId: section.id,
    sectionTitle: section.title,
    label: row.label,
    value: "value" in row ? row.value : row.amount,
    details: "details" in row ? row.details : [],
  })));
}
```

Use this function inside `MonthlyMemberDocument`. Assert the exact row model and that the real `@react-pdf/renderer` output starts with `%PDF-` and has non-zero byte size.

- [ ] **Step 6: Run focused web tests and a production build timing probe**

```bash
rtk pnpm --filter mi-banquito-web test -- 'src/app/(authenticated)/estados/actions.test.ts' 'src/app/(authenticated)/estados/page.test.tsx' 'src/app/(authenticated)/socias/[id]/page.test.tsx'
rtk pnpm --filter mi-banquito-web type-check
```

Expected: PASS. During AC verification, seed at least 10 active members, time real local PDF generation, and record the measured per-PDF P95 below 2 seconds; do not create a flaky wall-clock unit test.

- [ ] **Step 7: Commit the US-048 surfaces**

```bash
rtk git add 'apps/web/src/app/(authenticated)/estados' 'apps/web/src/app/(authenticated)/socias/[id]/page.tsx' 'apps/web/src/app/(authenticated)/socias/[id]/page.test.tsx' apps/web/src/lib/monthly-member-artifact.tsx apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(statements): add batch and individual previews (US-048)"
```

---

### Task 4: Add Shared Exact Money4 Arithmetic

**Files:**
- Create: `packages/domain/src/money4.ts`
- Create: `packages/domain/src/money4.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing deterministic money properties**

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addMoney4, compareMoney4, formatMoney4Units, parseMoney4Units, subtractMoney4 } from "./money4";

describe("numeric(18,4) arithmetic", () => {
  it("round-trips the complete representable unit range", () => {
    fc.assert(fc.property(
      fc.bigInt({ min: -999_999_999_999_999_999n, max: 999_999_999_999_999_999n }),
      (units) => expect(parseMoney4Units(formatMoney4Units(units))).toBe(units),
    ), { seed: 915, numRuns: 2_000 });
  });

  it("is associative and exact above Number.MAX_SAFE_INTEGER", () => {
    expect(addMoney4("90071992547409.9100", "0.0001")).toBe("90071992547409.9101");
    expect(subtractMoney4("10.0000", "10.0000")).toBe("0.0000");
    expect(compareMoney4("10.0001", "10.0000")).toBe(1);
  });
});
```

- [ ] **Step 2: Confirm the module is missing**

```bash
rtk pnpm --filter @mi-banquito/domain test -- src/money4.test.ts
```

Expected: FAIL with an unresolved `./money4` import.

- [ ] **Step 3: Implement the exact helpers**

```ts
const SCALE = 10_000n;
const MAX_UNITS = 999_999_999_999_999_999n;
const MONEY4 = /^(-?)(\d{1,14})(?:[.,](\d{1,4}))?$/;

export function parseMoney4Units(value: string): bigint {
  const match = MONEY4.exec(value.trim());
  if (!match) throw new Error("money4_invalid");
  const absolute = BigInt(match[2]) * SCALE + BigInt((match[3] ?? "").padEnd(4, "0") || "0");
  const units = match[1] === "-" ? -absolute : absolute;
  if (units < -MAX_UNITS || units > MAX_UNITS) throw new Error("money4_out_of_range");
  return units;
}

export function formatMoney4Units(units: bigint): string {
  if (units < -MAX_UNITS || units > MAX_UNITS) throw new Error("money4_out_of_range");
  const sign = units < 0n ? "-" : "";
  const absolute = units < 0n ? -units : units;
  return `${sign}${absolute / SCALE}.${String(absolute % SCALE).padStart(4, "0")}`;
}

export const addMoney4 = (a: string, b: string) => formatMoney4Units(parseMoney4Units(a) + parseMoney4Units(b));
export const subtractMoney4 = (a: string, b: string) => formatMoney4Units(parseMoney4Units(a) - parseMoney4Units(b));
export const compareMoney4 = (a: string, b: string) => parseMoney4Units(a) < parseMoney4Units(b) ? -1 : parseMoney4Units(a) > parseMoney4Units(b) ? 1 : 0;
export const parseNonNegativeMoney4 = (value: string) => {
  const units = parseMoney4Units(value);
  if (units < 0n) throw new Error("money4_non_negative_required");
  return formatMoney4Units(units);
};
export const parsePositiveMoney4 = (value: string) => {
  const units = parseMoney4Units(value);
  if (units <= 0n) throw new Error("money4_positive_required");
  return formatMoney4Units(units);
};
```

- [ ] **Step 4: Run and commit**

```bash
rtk pnpm --filter @mi-banquito/domain test -- src/money4.test.ts
rtk pnpm --filter @mi-banquito/domain type-check
rtk git add packages/domain/src/money4.ts packages/domain/src/money4.test.ts packages/domain/src/index.ts
rtk git commit -m "feat(finance): add exact money4 arithmetic (US-096, US-098, US-099)"
```

---

### Task 5: Implement The CHG-011 Collection Schema And Trigger Contract

**Files:**
- Create: `packages/db/src/migrations/V20260721130000__extraordinary_collection_lifecycle.sql`
- Create: `packages/db/src/sprint9-schema.test.ts`
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Write the failing Drizzle parity test**

```ts
expect(extraordinary_collection_disposition_enum.enumValues).toEqual(["returned", "retained"]);
expect(extraordinaryCollection.surplusAmount.name).toBe("surplus_amount");
expect(extraordinaryCollection.disposition.name).toBe("disposition");
expect(extraordinaryCollection.dispositionMotive.name).toBe("disposition_motive");
expect(extraordinaryCollection.surplusTransferId.name).toBe("surplus_transfer_id");
expect(extraordinaryCollection.recognitionFiscalYear.name).toBe("recognition_fiscal_year");
expect(extraordinaryCollectionLine.accountId.notNull).toBe(true);
expect(extraordinaryCollectionLine.reversesId.name).toBe("reverses_id");
expect(extraordinaryCollectionLine.reverseReason.name).toBe("reverse_reason");
```

- [ ] **Step 2: Add adversarial real-PostgreSQL trigger tests before the migration**

Use a direct `pg.Pool` like `sprint8-cash-balances.test.ts`. Assert legal `open -> collecting -> paid_out -> closed` and `open|collecting -> cancelled` transitions. Assert PostgreSQL rejects `open -> paid_out`, `closed -> collecting`, a purpose edit after open, every `recognition_fiscal_year` update, `regularized -> pending`, any other line edit, and DELETE on either table.

- [ ] **Step 3: Confirm the contract fails against the current schema**

```bash
rtk pnpm --filter @mi-banquito/db test -- src/sprint9-schema.test.ts
```

Expected: FAIL because the CHG-011 columns and replacement triggers do not exist.

- [ ] **Step 4: Add exact Drizzle fields and enum**

```ts
export const extraordinary_collection_disposition_enum = pgEnum(
  "extraordinary_collection_disposition_enum",
  ["returned", "retained"],
);

// extraordinaryCollection
surplusAmount: numeric("surplus_amount", { precision: 18, scale: 4 }),
disposition: extraordinary_collection_disposition_enum("disposition"),
dispositionMotive: text("disposition_motive"),
surplusTransferId: uuid("surplus_transfer_id").references((): AnyPgColumn => transfer.id),
recognitionFiscalYear: integer("recognition_fiscal_year"),

// extraordinaryCollectionLine
accountId: uuid("account_id").references((): AnyPgColumn => account.id).notNull(),
reversesId: uuid("reverses_id").references((): AnyPgColumn => extraordinaryCollectionLine.id),
reverseReason: text("reverse_reason"),
```

Add indexes on `(org_id,status,opened_on)`, `(org_id,recognition_fiscal_year)` filtered to `kind='treasurer_recognition'`, and `(org_id,collection_id,dated_on)`. Add a partial unique index on `(org_id,reverses_id) WHERE reverses_id IS NOT NULL` so one posted line can be reversed only once.

- [ ] **Step 5: Add the migration's columns, backfill guard, and checks**

The migration must create the enum, add the five header fields plus line reversal fields, and abort if a legacy line lacks `account_id` before setting it NOT NULL. Add checks enforcing exact kinds/statuses, `target_amount >= 0`, `amount >= 0`, recognition year required only for `treasurer_recognition`, reversal reason paired with `reverses_id`, and disposition shape:

```sql
CHECK (
  (surplus_amount IS NULL AND disposition IS NULL AND disposition_motive IS NULL AND surplus_transfer_id IS NULL)
  OR (surplus_amount = 0 AND disposition IS NULL AND disposition_motive IS NULL AND surplus_transfer_id IS NULL)
  OR (surplus_amount > 0 AND disposition = 'returned' AND disposition_motive IS NULL AND surplus_transfer_id IS NOT NULL)
  OR (surplus_amount > 0 AND disposition = 'retained' AND length(btrim(disposition_motive)) >= 3 AND surplus_transfer_id IS NULL)
)
```

- [ ] **Step 6: Replace, never edit, the init triggers**

Drop `extraordinary_collection_no_mutate` and `extraordinary_collection_line_no_mutate` in the new migration. Create `allow_extraordinary_collection_transition()` using `IS DISTINCT FROM`/`to_jsonb` comparisons so only these mutations pass:

```sql
open       -> collecting : status only
collecting -> paid_out   : status + paid_out_expense_id only
paid_out   -> closed     : status + surplus_amount + disposition + disposition_motive + surplus_transfer_id only
open       -> cancelled  : status + surplus_amount + disposition + disposition_motive + surplus_transfer_id only
collecting -> cancelled  : status + surplus_amount + disposition + disposition_motive + surplus_transfer_id only
```

Reject DELETE first. Reject any update where `recognition_fiscal_year IS DISTINCT FROM OLD.recognition_fiscal_year`. At close/cancel, calculate the signed regularized line total (`reversal = -ABS(amount)`), reject an effective pending balance above zero, require `surplus_amount = regularized_total - payout`, and apply the exact disposition check. At `->paid_out`, require a paid same-org `solidarity_payout` expense for `kind='solidarity'`; permit a null expense only for `kind='treasurer_recognition'`.

- [ ] **Step 7: Add the line transition guard**

`allow_extraordinary_collection_line_regularization()` permits only `pending -> regularized` with every other field unchanged and with transfer coverage where `purpose='regularization'`, `regularizes_kind='extraordinary_collection'`, and `regularizes_id=NEW.id`. DELETE and regressions raise `append_only_violation`. In the same migration, replace `validate_regularization_transfer()` with the existing contribution/repayment branches plus an `extraordinary_collection` branch that requires the same-org live pending line, its active non-group source account, and an active group-fund target. This makes the legal line transition testable before the migration is committed.

- [ ] **Step 8: Add explicit tenant-money locks and apply the fresh schema**

Attach `lock_tenant_money_write()` triggers to both collection tables using the existing Sprint 8 pattern. Then run:

```bash
rtk node packages/db/scripts/apply-local-schema.mjs
rtk node packages/db/scripts/verify-schema.mjs
rtk pnpm --filter @mi-banquito/db test -- src/sprint9-schema.test.ts
```

Expected: schema verification passes, every legal transition succeeds, and every adversarial update/delete raises.

- [ ] **Step 9: Commit the immutable migration and parity changes**

```bash
rtk git add packages/db/src/schema.ts packages/db/src/migrations/V20260721130000__extraordinary_collection_lifecycle.sql packages/db/src/sprint9-schema.test.ts
rtk git commit -m "feat(collections): enforce CHG-011 lifecycle schema (US-096)"
```

---

### Task 6: Implement US-096 Collection Rules And Commands

**Files:**
- Create: `packages/domain/src/extraordinary-collections.ts`
- Create: `packages/domain/src/extraordinary-collections.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write failing progress and reversal properties**

```ts
it("nets reversals and counts only contributors with positive net value", () => {
  expect(collectionProgress({
    activeMemberCount: 4,
    lines: [
      { id: "l1", memberId: "m1", amount: "10.0000", reconciliationStatus: "regularized", reversesId: null },
      { id: "l2", memberId: "m2", amount: "7.1250", reconciliationStatus: "pending", reversesId: null },
      { id: "l3", memberId: "m1", amount: "10.0000", reconciliationStatus: "regularized", reversesId: "l1" },
    ],
  })).toEqual({
    contributors: 1,
    activeMembers: 4,
    collected: "7.1250",
    regularized: "0.0000",
    pending: "7.1250",
  });
});
```

Add a fast-check property that appending a matching reversal makes the original/reversal pair contribute exactly zero in its reconciliation bucket.

- [ ] **Step 2: Define the public types and service**

```ts
export type CollectionKind = "solidarity" | "treasurer_recognition";
export type CollectionStatus = "open" | "collecting" | "paid_out" | "closed" | "cancelled";
export type CollectionDisposition = "returned" | "retained";

export type CollectionView = typeof extraordinaryCollection.$inferSelect & {
  beneficiaryName: string;
  activeMemberCount: number;
  progress: CollectionProgress;
  lines: Array<typeof extraordinaryCollectionLine.$inferSelect & {
    memberName: string;
    accountName: string;
  }>;
};

export type OpenCollectionInput = {
  orgId: string; actorId: string; kind: CollectionKind; purpose: string;
  beneficiaryMemberId: string; targetAmount: string | null;
  recognitionFiscalYear: number | null; openedOn: string; clientRequestId: string;
};
export type AddCollectionLineInput = {
  orgId: string; actorId: string; collectionId: string; memberId: string;
  accountId: string; amount: string; datedOn: string; clientRequestId: string;
};
export type ReverseCollectionLineInput = {
  orgId: string; actorId: string; lineId: string; reason: string; clientRequestId: string;
};
export type SurplusDispositionInput = {
  disposition: CollectionDisposition | null;
  dispositionMotive: string | null;
  returnAccountId: string | null;
};
export type CancelCollectionInput = SurplusDispositionInput & {
  orgId: string; actorId: string; collectionId: string; datedOn: string; clientRequestId: string;
};
export type CloseRecognitionCollectionInput = {
  orgId: string; actorId: string; collectionId: string;
  dispositionMotive: string; clientRequestId: string;
};
export type PayoutCollectionInput = SurplusDispositionInput & {
  orgId: string; actorId: string; collectionId: string; sourceAccountId: string;
  payoutAmount: string; datedOn: string; clientRequestId: string;
};

export interface ExtraordinaryCollectionService {
  list(input: { orgId: string }): Promise<CollectionView[]>;
  get(input: { orgId: string; collectionId: string }): Promise<CollectionView | null>;
  open(input: OpenCollectionInput): Promise<typeof extraordinaryCollection.$inferSelect>;
  addLine(input: AddCollectionLineInput): Promise<typeof extraordinaryCollectionLine.$inferSelect>;
  reverseLine(input: ReverseCollectionLineInput): Promise<typeof extraordinaryCollectionLine.$inferSelect>;
  cancel(input: CancelCollectionInput): Promise<typeof extraordinaryCollection.$inferSelect>;
  closeRecognition(input: CloseRecognitionCollectionInput): Promise<typeof extraordinaryCollection.$inferSelect>;
  payout(input: PayoutCollectionInput): Promise<typeof extraordinaryCollection.$inferSelect>;
}
```

`OpenCollectionInput` includes `kind`, `purpose`, required same-org beneficiary, optional non-negative target, `recognitionFiscalYear: number | null`, `openedOn`, actor, and org. Require a year from 2000–2200 for recognition and null for solidarity.

- [ ] **Step 3: Write failing real-database create/add/reverse tests**

Test two tenants and assert: create starts `open`; the first line atomically becomes `collecting`; group account means `regularized`; non-group account means `pending`; a zero line is valid but does not count as a contributor; negative/precision-overflow fails; foreign/inactive member/account fails; every insert and status transition has an audit; audit failure rolls the command back; reversal appends a row with copied collection/member/account/status/date and never mutates the original.

- [ ] **Step 4: Implement every command in one writable tenant transaction**

Resolve member/account rows with both `id` and `org_id`. Lock the header `FOR UPDATE`. Derive reconciliation from the active account's `is_group_fund`, not a form value. On the first line, insert the line/audit, update `open -> collecting`, and insert a separate transition audit. Reversal requires at least 10 trimmed characters, rejects reversal-of-reversal and a second reversal, and writes `collection.line.reversed`.

Include the form's `clientRequestId` only as correlation data in `AuditLogEntry.payload_snapshot`; do not add unspecced collection idempotency columns.

- [ ] **Step 5: Run and commit the US-096 domain core**

```bash
rtk pnpm --filter @mi-banquito/domain test -- src/money4.test.ts src/extraordinary-collections.test.ts
rtk pnpm --filter @mi-banquito/domain type-check
rtk git add packages/domain/src/extraordinary-collections.ts packages/domain/src/extraordinary-collections.test.ts packages/domain/src/index.ts
rtk git commit -m "feat(collections): add audited collection commands (US-096)"
```

---

### Task 7: Extend BR-12 Regularization To Collection Lines

**Files:**
- Modify: `packages/domain/src/movements.ts`
- Modify: `packages/domain/src/movements.test.ts`

- [ ] **Step 1: Write the failing exact-coverage test**

```ts
const partial = await movements.regularizePendingDeposit({
  orgId, actorId, regularizesKind: "extraordinary_collection", regularizesId: lineId,
  toAccountId: groupAccountId, amount: "4.0000", datedOn: "2026-07-21", clientRequestId: requestA,
});
expect(partial).toMatchObject({ regularized: false, remaining: "6.0000" });

const complete = await movements.regularizePendingDeposit({
  orgId, actorId, regularizesKind: "extraordinary_collection", regularizesId: lineId,
  toAccountId: groupAccountId, amount: "6.0000", datedOn: "2026-07-21", clientRequestId: requestB,
});
expect(complete).toMatchObject({ regularized: true, remaining: "0.0000" });
```

Add over-coverage, wrong source account, reversed line, archived target, cross-tenant line, and concurrent exact-coverage cases.

- [ ] **Step 2: Extend the existing union and source resolver**

```ts
export type RegularizableKind = "contribution" | "repayment" | "extraordinary_collection";
```

Add collection lines to `listPendingDeposits`, the locked source lookup, coverage query, and status-update branch. A fully reversed pending pair must not appear as pending. Preserve `regularizes_kind='extraordinary_collection'` on the transfer.

- [ ] **Step 3: Run the BR-12 property and database suites**

```bash
rtk pnpm --filter @mi-banquito/db test -- src/sprint9-schema.test.ts
rtk pnpm --filter @mi-banquito/domain test -- src/movements.test.ts src/extraordinary-collections.test.ts
```

Expected: partial coverage remains pending, exact coverage flips once, and no tenant can regularize another tenant's line.

- [ ] **Step 4: Commit**

```bash
rtk git add packages/domain/src/movements.ts packages/domain/src/movements.test.ts
rtk git commit -m "feat(regularization): support collection deposits (US-096)"
```

---

### Task 8: Implement US-097 Payout, Cancellation, And Recognition Close

**Files:**
- Modify: `packages/domain/src/extraordinary-collections.ts`
- Modify: `packages/domain/src/extraordinary-collections.test.ts`

- [ ] **Step 1: Write the failing payout golden**

```ts
const closed = await service.payout({
  orgId, actorId, collectionId, sourceAccountId: groupAccountId,
  payoutAmount: "25.0000", disposition: "returned", dispositionMotive: null,
  returnAccountId: returnChannelId, datedOn: "2026-07-22", clientRequestId,
});
expect(closed).toMatchObject({
  status: "closed",
  surplusAmount: "5.0000",
  disposition: "returned",
});
expect(closed.paidOutExpenseId).toBeTruthy();
expect(closed.surplusTransferId).toBeTruthy();
```

Assert exactly one paid `solidarity_payout` expense to the header beneficiary, one return transfer, and audits for expense, each status transition, disposition, and transfer.

- [ ] **Step 2: Add rejection and zero-surplus cases**

Assert typed failures for any effective pending balance, amount above ceiling, zero payout, wrong kind, inactive/foreign source or return account, missing retained motive, returned without destination, and replay after close. Assert exact-ceiling payout closes with `surplusAmount='0.0000'` and the other three disposition fields null.

- [ ] **Step 3: Implement the payout transaction**

Acquire the tenant money advisory lock, lock the header, load signed live lines, and recompute the ceiling inside the transaction. Insert the expense, transition `collecting -> paid_out`, compute surplus, optionally insert the return transfer, then transition `paid_out -> closed`. Every audit is in the same transaction; any audit failure rolls everything back.

- [ ] **Step 4: Implement cancellation and recognition close**

`cancel` permits `open|collecting -> cancelled`. It uses payout zero and the same surplus rules; with regularized funds it requires `returned` plus a destination or `retained` plus a motive. `closeRecognition` requires `kind='treasurer_recognition'`, positive regularized total, no effective pending balance, and a motive; it executes `collecting -> paid_out -> closed`, leaves `paid_out_expense_id` null, and records the full regularized total as retained surplus.

- [ ] **Step 5: Run and commit**

```bash
rtk pnpm --filter @mi-banquito/domain test -- src/extraordinary-collections.test.ts
rtk git add packages/domain/src/extraordinary-collections.ts packages/domain/src/extraordinary-collections.test.ts
rtk git commit -m "feat(collections): govern payout and surplus closure (US-097)"
```

---

### Task 9: Build The `/colectas` Screen And Strict Actions

**Files:**
- Create: `apps/web/src/app/(authenticated)/colectas/actions.ts`
- Create: `apps/web/src/app/(authenticated)/colectas/actions.test.ts`
- Create: `apps/web/src/app/(authenticated)/colectas/collection-forms.tsx`
- Create: `apps/web/src/app/(authenticated)/colectas/page.test.tsx`
- Modify: `apps/web/src/app/(authenticated)/colectas/page.tsx`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write a failing pure view contract using the TOON IDs**

```tsx
render(<CollectionForms model={collectingFixture} actions={actionFixtures} />);
expect(screen.getByTestId("collection_summary")).toHaveTextContent("3 de 4 socias han aportado");
expect(screen.getByTestId("collection_summary")).toHaveTextContent("Regularizado");
expect(screen.getByTestId("collection_summary")).toHaveTextContent("Pendiente");
expect(screen.getByTestId("form_open_collection")).toBeInTheDocument();
expect(screen.getByTestId("form_add_line")).toBeInTheDocument();
expect(screen.getByTestId("lines_table")).toBeInTheDocument();
expect(screen.getByTestId("form_payout")).toBeInTheDocument();
expect(screen.getByTestId("payout_guard")).toBeInTheDocument();
```

Add open, pending, zero-surplus, returned, retained, recognition, closed, and cancelled models. Pending disables payout; closed/cancelled remove mutation controls.

- [ ] **Step 2: Define strict form schemas**

```ts
const openCollectionSchema = z.object({
  purpose: z.string().trim().min(3).max(500),
  beneficiaryMemberId: z.string().uuid(),
  kind: z.enum(["solidarity", "treasurer_recognition"]),
  targetAmount: z.string().max(32).optional(),
  recognitionFiscalYear: z.coerce.number().int().min(2000).max(2200).optional(),
  openedOn: z.string().date(),
  clientRequestId: z.string().uuid(),
}).strict().superRefine((value, ctx) => {
  if (value.kind === "treasurer_recognition" && value.recognitionFiscalYear === undefined) {
    ctx.addIssue({ code: "custom", path: ["recognitionFiscalYear"], message: "recognition_fiscal_year_required" });
  }
  if (value.kind === "solidarity" && value.recognitionFiscalYear !== undefined) {
    ctx.addIssue({ code: "custom", path: ["recognitionFiscalYear"], message: "recognition_fiscal_year_forbidden" });
  }
});
```

Define equally strict schemas for line, reversal, regularization link, payout, cancel, and recognition close. `retained` requires `dispositionMotive`; `returned` requires `returnAccountId`.

- [ ] **Step 3: Add real-service action tests**

Control only session/redirect/revalidation seams. Assert unauthorized and non-treasurer denial, strict unknown-field rejection, safe error redirects, successful writes, tenant isolation, and rollback. Never mock `createExtraordinaryCollectionService` or `createMovementService`.

- [ ] **Step 4: Implement the Server Component and localized form view**

The page calls `requireTreasurer()`, loads collections, active members, active accounts, and selected collection by `searchParams.collectionId`, then passes serializable data to the client form. Default recognition year to the current UTC year. Add the CHG-011-only controls missing from the older TOON: recognition fiscal year, cancellation, return-channel account, retained vote motive, and recognition close.

- [ ] **Step 5: Map stable errors without leaking database details**

Map `collection_not_found`, `collection_pending_regularization`, `collection_payout_above_ceiling`, `collection_disposition_required`, `collection_return_account_required`, `collection_retention_motive_required`, `collection_transition_invalid`, and `collection_reversal_invalid`. Unknown errors use `error=action-failed` and the existing safe diagnostic pattern.

- [ ] **Step 6: Run, verify routes, and commit**

```bash
rtk pnpm --filter mi-banquito-web test -- 'src/app/(authenticated)/colectas/actions.test.ts' 'src/app/(authenticated)/colectas/page.test.tsx'
rtk ./infra/scripts/validate-routes.sh
rtk pnpm --filter mi-banquito-web lint
rtk git add 'apps/web/src/app/(authenticated)/colectas' apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(collections): ship collect and payout workflow (US-096, US-097)"
```

---

### Task 10: Implement The Exact Cumulative BR-15 Compensation Service

**Files:**
- Create: `packages/domain/src/treasurer-compensation.ts`
- Create: `packages/domain/src/treasurer-compensation.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing pure BR-15 property suite**

```ts
const result = compensationBreakdown({
  years: [
    { fiscalYear: 2025, accrued: "20.0000", recognition: "0.0000" },
    { fiscalYear: 2026, accrued: "20.0000", recognition: "35.0000" },
  ],
  cronPaid: "20.0000",
  manualPaid: "5.0000",
});
expect(result).toEqual({
  cumulativeEntitlement: "55.0000",
  cumulativePaid: "25.0000",
  payableNow: "30.0000",
});
```

Use fast-check to prove `0 <= payableNow <= cumulativeEntitlement`, paid monotonicity, `recognized(Y)=max(accrued,recognition)`, and paying exactly `payableNow` makes the next result zero.

- [ ] **Step 2: Define the typed error and service contract**

```ts
export type CompensationBreakdown = {
  cumulativeEntitlement: string;
  cumulativePaid: string;
  payableNow: string;
};

export class CompensationCeilingExceededError extends Error {
  readonly code = "compensation_ceiling_exceeded";
  constructor(readonly figures: CompensationBreakdown) {
    super("compensation_ceiling_exceeded");
  }
}

export interface TreasurerCompensationService {
  getBreakdown(input: { orgId: string; fiscalYear: number }): Promise<CompensationBreakdown>;
  recordPayout(input: {
    orgId: string;
    actorId: string;
    fiscalYear: number;
    accountId: string;
    amount: string;
    datedOn: string;
    notes?: string | null;
    clientRequestId: string;
  }): Promise<typeof expense.$inferSelect>;
}
```

- [ ] **Step 3: Write the real-PostgreSQL AC-9 fence**

Seed a US-050 `TreasurerCompensationDisbursement` plus linked `Withdrawal`, a larger closed recognition collection in the same year, prior manual payouts, and a second tenant. Assert: full cumulative entitlement is rejected after the cron payment; entitlement minus cron payment is accepted; replay creates one expense; the year uses max, not sum; a prior unpaid year carries; solidarity/open/cancelled collections never count; reversal rows net paid values; cross-tenant rows never participate.

- [ ] **Step 4: Implement fiscal-year attribution and cumulative queries**

Read the current same-org `GroupConfig` fiscal-year start month/day. Attribute compensation disbursements and cron withdrawals from `period_label`, recognition collections from `recognition_fiscal_year`, and manual expenses from `incurred_on`. For every year through the selected year, aggregate signed append-only rows and call `compensationBreakdown`; never coerce money through `Number`.

- [ ] **Step 5: Implement transactional payout and replay**

Inside `withWritableTenantTransaction`, acquire the org money advisory lock, resolve the active same-org treasurer and selected active group account, check an existing `(org_id, client_request_id)` expense for exact normalized replay, recompute the breakdown, and throw `CompensationCeilingExceededError` when amount exceeds `payableNow`. Insert one paid expense with category `treasurer_comp_payout`, purpose `pago a tesorera`, beneficiary treasurer, and one audit in the same transaction.

- [ ] **Step 6: Run and commit**

```bash
rtk pnpm --filter @mi-banquito/domain test -- src/money4.test.ts src/treasurer-compensation.test.ts
rtk git add packages/domain/src/treasurer-compensation.ts packages/domain/src/treasurer-compensation.test.ts packages/domain/src/index.ts
rtk git commit -m "feat(compensation): enforce cumulative shared entitlement (US-098, CHG-011)"
```

---

### Task 11: Wire The Refreshed Treasurer-Compensation UI

**Files:**
- Modify: `apps/web/src/app/(authenticated)/movimientos/registrar/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/movimientos/registrar/actions.test.ts`
- Modify: `apps/web/src/app/(authenticated)/movimientos/registrar/movement-forms.tsx`
- Modify: `apps/web/src/app/(authenticated)/movimientos/registrar/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/movimientos/registrar/page.test.tsx`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write the failing refreshed TOON contract**

```tsx
render(<MovementForms {...fixture} compensation={breakdownFixture} />);
const ceiling = screen.getByTestId("treasurer_comp_ceiling");
expect(ceiling).toHaveTextContent("Reconocido (hasta este año)");
expect(ceiling).toHaveTextContent("USD 55.00");
expect(ceiling).toHaveTextContent("Ya pagado (automático + manual)");
expect(ceiling).toHaveTextContent("USD 25.00");
expect(ceiling).toHaveTextContent("Disponible ahora");
expect(ceiling).toHaveTextContent("USD 30.00");
```

Add exhausted state text exactly from `SCR-record-movement.json`, above-ceiling error with all three values, and enabled/disabled submit states.

- [ ] **Step 2: Keep generic expenses from bypassing BR-15**

Preserve `recordExpenseAction` rejection of `solidarity_payout` and `treasurer_comp_payout`. Add a separate strict schema/action:

```ts
const treasurerCompensationSchema = z.object({
  fiscalYear: z.coerce.number().int().min(2000).max(2200),
  accountId: z.string().uuid(),
  amount: z.string().min(1).max(32),
  datedOn: z.string().date(),
  notes: z.string().trim().max(2_000).optional(),
  clientRequestId: z.string().uuid(),
}).strict();
```

- [ ] **Step 3: Test the action against the real service**

Add session denial, strict parsing, accepted net amount, stale preview/over-ceiling rejection, typed figures in redirect state, exhausted state, idempotent replay, and tenant isolation. Do not mock the compensation service.

- [ ] **Step 4: Load server figures and render plain-Spanish recovery**

The page selects `searchParams.fiscalYear` or current fiscal year and calls `getBreakdown`. Render `data-testid="treasurer_comp_ceiling"`. The action catches only `CompensationCeilingExceededError`, serializes its three safe money figures into the redirect, and the page renders the exact refreshed TOON copy. Unknown errors remain generic.

- [ ] **Step 5: Run and commit**

```bash
rtk pnpm --filter mi-banquito-web test -- 'src/app/(authenticated)/movimientos/registrar/actions.test.ts' 'src/app/(authenticated)/movimientos/registrar/page.test.tsx'
rtk pnpm --filter mi-banquito-web type-check
rtk git add 'apps/web/src/app/(authenticated)/movimientos/registrar' apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(compensation): show and enforce payable-now ceiling (US-098)"
```

---

### Task 12: Build The BR-16 Transparency Projection And Correct Balances

**Files:**
- Create: `packages/domain/src/transparency.ts`
- Create: `packages/domain/src/transparency.test.ts`
- Create: `packages/db/src/migrations/V20260721140000__sprint9_balance_projections.sql`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing completeness oracle**

Seed one row of every period source plus originals/reversals and a second-tenant sentinel. Assert every `Expense`, every `Transfer`, every collection line, and the collection-linked payout appears exactly once:

```ts
expect(result.rows.map((row) => `${row.sourceKind}:${row.sourceId}`)).toEqual([
  `expense:${bankFeeId}`,
  `transfer:${regularizationId}`,
  `collection_line:${collectionLineId}`,
  `collection_line:${collectionLineReversalId}`,
  `expense:${solidarityPayoutId}`,
  `expense:${treasurerCompPayoutId}`,
]);
expect(result.rows.some((row) => row.sourceId === otherTenantExpenseId)).toBe(false);
```

The seed must also include baseline contribution/repayment/withdrawal/loan-disbursement rows so total balances prove the new union does not erase prior statement content.

- [ ] **Step 2: Define the normalized contract**

```ts
export type TransparencySourceKind =
  | "contribution" | "repayment" | "withdrawal" | "loan_disbursement"
  | "expense" | "transfer" | "collection_line";

export type TransparencyMovement = {
  sourceKind: TransparencySourceKind;
  sourceId: string;
  datedOn: string;
  memberId: string | null;
  collectionId: string | null;
  category: string;
  label: string;
  signedAmount: string;
  reconciliationStatus: "pending" | "regularized" | null;
  reversesId: string | null;
  accountName: string | null;
};

export type PeriodTransparency = {
  rows: TransparencyMovement[];
  netFundBalance: string;
  physicalCashBalance: string;
  collectionCashBalance: string;
  regularizedDistributableBalance: string;
};
```

- [ ] **Step 3: Implement one deterministic tenant-scoped `UNION ALL` read**

Emit originals and reversals; never filter `reverses_id IS NULL`. Normalize reversal signs to `-ABS(amount)`. Order by `dated_on, source_kind, source_id`. A solidarity payout remains one `expense` row with `collectionId` found through `paid_out_expense_id`; do not duplicate it as a synthetic payout row. Member output includes that member's baseline ledger rows, all group expenses/transfers required to reconcile the displayed balance, and collections where the member contributed or is beneficiary.

- [ ] **Step 4: Repair the two balance functions in a new immutable migration**

In `V20260721140000__sprint9_balance_projections.sql`, replace `fund_pool_balance` so it represents regularized core funds and excludes both sides of extraordinary collections: collection lines, `solidarity_payout` expenses, and `collection_surplus_return` transfers. Add `physical_cash_balance` that includes regularized collection cash and subtracts its payout/return. Add `collection_cash_balance` for the earmarked difference. All functions accept `(p_org_id, p_through_date)` and return `numeric(18,4)`. Do not edit the already-applied lifecycle migration.

- [ ] **Step 5: Rebuild the disposable database with both immutable migrations**

Point `DATABASE_URL` at a new empty local test database, then run:

```bash
rtk node packages/db/scripts/apply-local-schema.mjs
rtk node packages/db/scripts/verify-schema.mjs
```

Expected: the full ordered migration set applies once, including the already-committed lifecycle migration and the new projection migration. Never edit or replay either file against a production database by hand.

- [ ] **Step 6: Prove reversal and exclusion properties**

Use fast-check plus real PostgreSQL to prove an original/reversal pair changes all totals by zero, pending non-group inflows never raise distributable balance, collection inflow/payout changes physical cash but not distributable balance, and treasurer compensation reduces distributable balance exactly once.

- [ ] **Step 7: Run and commit**

```bash
rtk pnpm --filter @mi-banquito/db test -- src/sprint9-schema.test.ts
rtk pnpm --filter @mi-banquito/domain test -- src/transparency.test.ts
rtk git add packages/domain/src/transparency.ts packages/domain/src/transparency.test.ts packages/domain/src/index.ts packages/db/src/migrations/V20260721140000__sprint9_balance_projections.sql
rtk git commit -m "feat(transparency): project every append-only movement (US-099)"
```

---

### Task 13: Feed Statements, Archive, PDF, And Public Verify From Transparency

**Files:**
- Modify: `packages/domain/src/member-statements.ts`
- Modify: `packages/domain/src/member-statements.test.ts`
- Modify: `packages/domain/src/reporting.ts`
- Modify: `packages/domain/src/reporting.test.ts`
- Modify: `apps/web/src/app/(authenticated)/estados/statement-preview.tsx`
- Modify: `apps/web/src/app/(authenticated)/estados/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/estados/page.test.tsx`
- Create: `apps/web/src/app/verify/[hash]/page.tsx`
- Delete: `apps/web/src/app/verify/[hash]/route.ts`
- Modify: `apps/web/src/app/verify/[hash]/page.test.tsx`
- Modify: `apps/web/src/lib/monthly-member-artifact.tsx`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write a cross-surface canonical golden**

```ts
const preview = await statements.preview({ orgId, periodCloseId, memberId, statementCopy });
const expectedIds = transparency.rows.map((row) => row.sourceId);
expect(preview.payload.verificationMovements.map((row) => row.sourceId)).toEqual(expectedIds);
expect(monthlyMemberPdfRows(artifactInput(preview)).map((row) => row.sourceId).filter(Boolean)).toEqual(expectedIds);

const verified = verifyResultFromArchivedPayload({
  canonicalPayloadHash: preview.canonicalPayloadHash,
  canonicalPayload: preview.payload,
  generatedAt: NOW,
});
expect(verified.matched && verified.movements.map((row) => row.sourceId)).toEqual(expectedIds);
```

- [ ] **Step 2: Extend the canonical payload once**

Replace `StatementReconciliationMovement` with `TransparencyMovement` in the preview builder. Add one `fund-movements` section containing category, account, status, signed amount, and reversal reference. Preserve existing contributions, received-payment allocations, withdrawals, branding, opening, and closing sections from US-048.

- [ ] **Step 3: Replace the conflicting verifier route with the nav-map page**

Delete `apps/web/src/app/verify/[hash]/route.ts`. Create an async public `page.tsx` that validates `params.hash` with `verifyHashSchema`, calls `createReportingService().verifyStatementHash()`, invokes `notFound()` for invalid/unmatched hashes, and renders `<main data-screen="SCR-public-verify-pdf">`. `StatementPreview`, `monthlyMemberPdfRows`, and the public page must iterate the canonical `verificationMovements` array, not issue live ledger queries. Show every reversal row explicitly with its negative amount and reversal label; React escapes all rendered strings. Rewrite `page.test.tsx` as a real-PostgreSQL page integration test with no owned-service mock.

- [ ] **Step 4: Add the archive summary metrics**

For the latest closed period, `/estados` shows `members`, `in`, `out`, `movements`, and `saldo` from the same period transparency projection, matching `SCR-statements-archive.json`. No metric may use a separate gross-only calculation.

- [ ] **Step 5: Run and commit**

```bash
rtk pnpm --filter @mi-banquito/domain test -- src/member-statements.test.ts src/reporting.test.ts src/transparency.test.ts
rtk pnpm --filter mi-banquito-web test -- 'src/app/(authenticated)/estados/page.test.tsx' 'src/app/verify/[hash]/page.test.tsx'
rtk git add packages/domain/src/member-statements.ts packages/domain/src/member-statements.test.ts packages/domain/src/reporting.ts packages/domain/src/reporting.test.ts 'apps/web/src/app/(authenticated)/estados' 'apps/web/src/app/verify/[hash]' apps/web/src/lib/monthly-member-artifact.tsx apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(statements): render complete transparent movements (US-048, US-097, US-098, US-099)"
```

---

### Task 14: Correct Liquidity And Share-Out Consumers

**Files:**
- Modify: `packages/domain/src/liquidity.ts`
- Modify: `packages/domain/src/liquidity.test.ts`
- Modify: `packages/domain/src/shareout.ts`
- Modify: `packages/domain/src/shareout.test.ts`
- Modify: `apps/web/src/app/(authenticated)/liquidez/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/liquidez/page.test.tsx`
- Modify: `apps/web/src/app/(authenticated)/reparto/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/reparto/page.test.tsx`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write failing balance consumer tests**

```ts
expect(await liquidity.getProjection(orgId)).toMatchObject({
  physicalCashBalance: "130.0000",
  collectionCashBalance: "30.0000",
  poolBalance: "100.0000",
  regularizedDistributableBalance: "100.0000",
});
```

Then seed a `25.0000` solidarity payout and assert physical collection cash falls to `5.0000` while distributable remains `100.0000`. Seed a `10.0000` treasurer-comp payout and assert distributable becomes `90.0000`.

- [ ] **Step 2: Extend `LiquidityProjection` without changing sandbox semantics**

```ts
export type LiquidityProjection = {
  physicalCashBalance: string;
  collectionCashBalance: string;
  regularizedDistributableBalance: string;
  availableCapital: string;
  poolBalance: string;
  baseFundPool: string;
  commitment: string;
  hypotheticalLoanTerms: Required<HypotheticalLoanTerms>;
  series: LiquidityPoint[];
  narrative: string;
};
```

The projected lending series starts from spendable `poolBalance`, not physical cash or earmarked collection cash.

- [ ] **Step 3: Guard share-out draft creation with the live regularized balance**

Inside the existing writable transaction, query `fund_pool_balance(orgId, closeDate)` before inserting the draft. If approved `repartoTotal` exceeds it, throw `share_out_exceeds_regularized_balance`. Store that exact ceiling in `totalPoolAtRun`; do not later reinterpret it from a changed live value.

- [ ] **Step 4: Render distinct metrics and blocked states**

`/liquidez` labels physical cash, earmarked collection cash, spendable fund, and base-fund commitment. `/reparto` shows `Fondo regularizado disponible` and the localized exact error when governance asks to distribute more than that amount.

- [ ] **Step 5: Run and commit**

```bash
rtk pnpm --filter @mi-banquito/domain test -- src/liquidity.test.ts src/shareout.test.ts src/transparency.test.ts
rtk pnpm --filter mi-banquito-web test -- 'src/app/(authenticated)/liquidez/page.test.tsx' 'src/app/(authenticated)/reparto/page.test.tsx'
rtk git add packages/domain/src/liquidity.ts packages/domain/src/liquidity.test.ts packages/domain/src/shareout.ts packages/domain/src/shareout.test.ts 'apps/web/src/app/(authenticated)/liquidez' 'apps/web/src/app/(authenticated)/reparto' apps/web/src/lib/i18n/en-US.json
rtk git commit -m "feat(finance): separate physical and distributable funds (US-099)"
```

---

### Task 15: Add The Sprint 9 Desktop And Mobile Critical Journey

**Files:**
- Create: `apps/web/e2e/sprint9-financial-transparency.spec.ts`
- Modify: `apps/web/playwright.config.ts`

- [ ] **Step 1: Write the seeded solidarity journey**

```ts
test("collect, regularize, pay, archive, and publicly verify", async ({ page }) => {
  await page.goto("/colectas");
  await page.getByLabel("Motivo de la colecta").fill("Calamidad doméstica");
  await page.getByLabel("Beneficiaria").selectOption({ label: "Rosa Tituaña" });
  await page.getByRole("button", { name: "Abrir colecta" }).click();
  await page.getByLabel("Socia").selectOption({ label: "María Quishpe" });
  await page.getByLabel("Monto (USD)").fill("30.00");
  await page.getByLabel("¿En qué cuenta entró?").selectOption({ label: "Cuenta personal de la tesorera" });
  await page.getByRole("button", { name: "Agregar aporte" }).click();
  await expect(page.getByText("Pendiente de regularizar")).toBeVisible();
  await page.getByRole("link", { name: "Regularizar" }).click();
  await page.getByLabel("Hacia la cuenta").selectOption({ label: "Banco del grupo" });
  await page.getByRole("button", { name: "Confirmar regularización" }).click();
  await page.goto("/colectas");
  await page.getByLabel("Monto a pagar (USD)").fill("25.00");
  await page.getByLabel("Si sobra dinero").selectOption("retained");
  await page.getByLabel("Referencia de la votación").fill("Acta julio 2026");
  await page.getByRole("button", { name: "Registrar pago y cerrar colecta" }).click();
  await expect(page.getByText("Colecta cerrada")).toBeVisible();
});
```

Continue through member-statement generation and the public hash URL; assert the collection line, payout, category, and signed totals appear.

- [ ] **Step 2: Add the compensation regression journey**

Seed a cron withdrawal and recognition collection, open `/movimientos/registrar`, assert the three figures, attempt an over-ceiling payout and see `compensation_ceiling_exceeded` copy, then submit exactly `payableNow` and assert the exhausted state after reload.

- [ ] **Step 3: Add adversarial browser cases**

Assert pending collections cannot pay, closed collections expose no controls, retained surplus requires a motive, wrong-role navigation is denied, and meaningful nav icons remain non-`Circle` through their accessible labels. Use deterministic fixture ids/names and no uncontrolled live network.

- [ ] **Step 4: Run desktop and mobile projects**

```bash
rtk pnpm --filter mi-banquito-web exec playwright test e2e/sprint9-financial-transparency.spec.ts --project=chromium
rtk pnpm --filter mi-banquito-web exec playwright test e2e/sprint9-financial-transparency.spec.ts --project=mobile-chrome
```

Expected: both projects pass at desktop and 390×844 viewports.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/e2e/sprint9-financial-transparency.spec.ts apps/web/playwright.config.ts
rtk git commit -m "test(sprint9): verify financial transparency journey (US-048, US-096, US-097, US-098, US-099)"
```

---

### Task 16: Run Adversarial AC Verification And Close Sprint 9

**Files:**
- Modify: `.nous-feedback.jsonl`
- Verify: all files listed in this plan

- [ ] **Step 1: Run reconciliation and generated-artifact checks**

```bash
rtk python3 docs/scripts/nous_api_reconcile.py --target . --json
rtk ./infra/scripts/validate-routes.sh
rtk ./infra/scripts/regenerate-sidebar.py --check
rtk pnpm --filter mi-banquito-web test -- src/components/shell/nav-items.test.ts
```

Expected: no API or route drift and no icon fallback/regeneration diff.

If route validation still reports any of the three known pre-existing paths, stop final closure, append a `blocked` event naming the missing Nous nav entries, and do not append `done`. Do not work around the invariant locally.

- [ ] **Step 2: Run the full uncached build gate**

With a reachable empty disposable PostgreSQL `DATABASE_URL` and the required local secrets:

```bash
rtk pnpm exec turbo run type-check --force
rtk pnpm exec turbo run lint --force
rtk pnpm exec turbo run test --force --concurrency=1
rtk pnpm exec turbo run build --force
rtk node packages/db/scripts/apply-local-schema.mjs
rtk pnpm --dir packages/db drizzle-kit push
rtk node packages/db/scripts/verify-schema.mjs
```

Expected: every command exits zero. No schema, auth, route, icon, lint, test, or webpack failure is acceptable.

- [ ] **Step 3: Run diff-scoped mutation testing for BR-12/14/15/16**

Use the repository's configured Stryker command. If the root script is absent, invoke the checked-in config directly and record that exact command; do not claim a pass from coverage:

```bash
rtk pnpm exec stryker run
```

Expected: at least 80% on changed critical-path code. Kill non-equivalent survivors; annotate an equivalent mutant only with reason and reviewer sign-off.

- [ ] **Step 4: Adversarially verify every acceptance criterion**

For each AC, attempt to break it:

- US-048: no close, foreign close/member, inactive member, concurrent replay, audit failure, shuffled input/hash, private artifact, unauthenticated/wrong role, P95 evidence.
- US-096: invalid kind/year pairing, year update, wrong tenant/member/account, negative/overflow, first-line transition, state skip/regression, line mutation/delete, reversal-of-reversal, share-out exclusion.
- US-097: effective pending balance, over-ceiling, zero surplus metadata, returned without account, retained without motive, cancellation with funds, repeated payout, expense mutation, public/member visibility.
- US-098: cron already paid, larger recognition max fence, prior-year carry, solidarity ignored, reversed payment, concurrent stale ceiling, exact replay, tenant sentinel, exhausted reason.
- US-099: omit each expense/transfer/collection branch in turn, original plus reversal, pending inflow, collection exclusion, compensation deduction, archived/public canonical consistency.

- [ ] **Step 5: Append structured evidence and done events**

Append one `ac_pass` and one adversarial `ac_verify` per acceptance criterion, then:

```jsonl
{"story":"US-048","event":"build_pass","notes":"full uncached gate, real PostgreSQL statement tests, deterministic hash/idempotency, and PDF P95 evidence passed"}
{"story":"US-096","event":"build_pass","notes":"full uncached gate, CHG-011 schema/trigger tests, BR-12 property tests, and desktop/mobile journey passed"}
{"story":"US-097","event":"build_pass","notes":"full uncached gate, payout/surplus lifecycle, append-only transparency, and desktop/mobile journey passed"}
{"story":"US-098","event":"build_pass","notes":"full uncached gate, BR-15 property and real-PostgreSQL AC-9 regression fence passed"}
{"story":"US-099","event":"build_pass","notes":"full uncached gate, BR-16 completeness oracle, balance properties, and all reporting surfaces passed"}
{"story":"US-048","event":"done"}
{"story":"US-096","event":"done"}
{"story":"US-097","event":"done"}
{"story":"US-098","event":"done"}
{"story":"US-099","event":"done"}
{"story":"SPRINT-9","event":"done","notes":"All five stories passed adversarial AC verification, critical-path mutation testing, fresh schema verification, full build, and desktop/mobile E2E."}
```

- [ ] **Step 6: Commit only final evidence**

```bash
rtk git add .nous-feedback.jsonl
rtk git commit -m "chore(sprint): record Sprint 9 verification (US-048, US-096, US-097, US-098, US-099)"
```

---

## Self-Review Result

- **US-048:** Tasks 2–3 cover closed-period CTA, batch and individual generation, active-member count, real PDF generation, canonical hash, append-only unique archive, audit rollback, preview before/after, tenant/role denial, idempotency, and P95 evidence.
- **US-096:** Tasks 4–7 and 9 cover exact money, recognition year, schema fields, legal/illegal transitions, required account, pending derivation, progress, audit, reversal, cancellation, BR-12 regularization, tenant isolation, and share-out exclusion.
- **US-097:** Tasks 5, 8–9, and 13 cover the paid expense, ceiling, no-pending guard, legal close sequence, exact returned/retained surplus columns, motive/transfer requirements, reversal visibility, statement, and public verification.
- **US-098:** Tasks 10–11 and 13–14 implement the normative cumulative formula, per-year max, cron/manual shared entitlement, carry, typed error figures, no-TOCTOU transaction, exact replay, UI exhausted state, share-out deduction, statement, and public verification.
- **US-099:** Tasks 12–15 cover every expense/transfer/collection row, signed reversals, decimal math, physical versus distributable balances, pending exclusion, collection exclusion, archive/PDF/public consistency, and desktop/mobile verification.
- **Icons:** Tasks 1 and 16 preserve the refreshed generated solution and the existing meaningful-icon expectations. The plan contains no icon implementation edit.
- **Testing:** Critical BR-09/12/14/15/16 paths use property or behavioral oracles as generated; database and owned services are real; tenant sentinels are mandatory; mutation score is the gate and coverage is not.
- **Migration safety:** `V20260721130000__extraordinary_collection_lifecycle.sql` is completed and committed once for US-096; `V20260721140000__sprint9_balance_projections.sql` is a later independent projection migration. The init migration and every applied migration remain immutable.
