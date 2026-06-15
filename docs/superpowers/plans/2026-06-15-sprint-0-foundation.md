# Sprint 0 Foundation Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit, verify, and complete Sprint 0 foundation work so Mi Banquito has a trustworthy local/dev substrate before Sprint 1 feature delivery.

**Architecture:** This is a single serverless Next.js 16 app in a Turborepo, with route handlers under `apps/web/src/app/api`, Auth0 SDK middleware/proxy for auth, Drizzle/Postgres in `packages/db`, and token-driven UI packages under `packages/ui` plus `packages/design-system`. The plan treats generated scaffold as partial work, closes the Sprint 0 gaps, and records evidence through `.nous-feedback.jsonl`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Auth0 Next.js SDK v4, Drizzle ORM, PostgreSQL 17 local Docker, Vitest, Playwright, Tailwind 4 tokens, Serwist, GitHub Actions.

---

## Current Sprint 0 Status Audit

This status is based on the repository on 2026-06-15 and local verification already performed in this workspace. The story checkboxes in `docs/stories/sprint-0/*.md` are still all unchecked, so these are engineering status labels, not official Nous status.

| Story | Status | Evidence | Remaining Work |
|---|---|---|---|
| US-001 | Partial | Monorepo exists; initial commit `0cdc1c6` exists. | Add formal status events; verify all packages and commit Sprint 0 fixes. |
| US-002 | Pending | No Vercel project/env evidence in repo. | Document/create Vercel app, production and preview URLs, env mapping. |
| US-003 | Partial local only | Local Postgres container exists; no Neon evidence. | Document/create Neon project and branch strategy; preserve local Docker flow. |
| US-004 | Partial | Auth0 `/auth/login` redirects to tenant and org after config change. | Add DB UUID claim mapping; record organization setup evidence. |
| US-005 | Pending | No Sentry/Blob/Better Stack runtime config verified. | Add env docs, smoke checks, and CI-safe validation. |
| US-006 | Partial | `.env.local` files exist and are ignored. | Normalize examples, validate required envs, document local/prod/preview. |
| US-007 | Partial | App Router exists and pages render. | Current route group is `(authenticated)`, not `(treasurer)/(admin)`; decide and record deviation or align code. |
| US-008 | Partial | DB verifier reports 34 tables. | `drizzle-kit push` does not apply SQL RLS/triggers; verifier must assert RLS, policies, triggers, table count. |
| US-009 | Partial | Tokens exist under `packages/design-system` and `apps/web/src/styles/tokens.css`. | Story expects different paths; record deviation or align package contract; add tests. |
| US-010 | Partial | Serwist config, `sw.ts`, and manifest exist. | Add installability/offline Playwright checks. |
| US-011 | Partial | Auth0 session guards exist on worked member pages. | Implement session claim helper, DB session variable convention, and RLS adversarial tests. |
| US-012 | Partial | `/api/cron/daily` exists and checks `CRON_SECRET`. | Replace no-op with verified substrate hook or explicitly scope no-op as Sprint 0 contract. |
| US-013 | Partial | Design-system workflow exists; no full CI. | Add CI with install, type-check, lint, build, unit, DB, Playwright gates. |
| US-014 | Pending | No test files or test runner installed. | Add unit/integration/adversarial test infrastructure. |
| US-015 | Partial | Auth0 SDK routes work after matcher fix. | Verify passwordless/magic-link flow or record chosen Auth0 login method deviation. |

## File Structure

Create or modify these files during implementation:

- Create `docs/stories/STATUS_REPORT.md`: human-readable Sprint 0 status and evidence.
- Modify `.nous-feedback.jsonl`: append story events, AC verifications, deviations, and build evidence.
- Modify `package.json`: root scripts for unit and Playwright tests.
- Modify `apps/web/package.json`: app test scripts and Playwright dependency hooks.
- Modify package `package.json` files under `packages/*`: add `test` scripts where needed.
- Create `vitest.workspace.ts`: workspace test project registry.
- Create `apps/web/vitest.config.ts`: app unit/component test config.
- Create `packages/db/vitest.config.ts`: DB script test config.
- Create `packages/domain/vitest.config.ts`: domain unit test config.
- Create `apps/web/e2e/sprint0-foundation.spec.ts`: Playwright browser checks.
- Create `apps/web/src/lib/auth/session-claims.ts`: single helper for tenant/role claims.
- Create `apps/web/src/lib/auth/session-claims.test.ts`: unit tests for Auth0 claim mapping.
- Modify `apps/web/src/lib/auth0.ts`: keep Auth0 config safe with optional organization param.
- Modify `apps/web/src/proxy.ts` or `apps/web/src/middleware.ts`: Auth0 route handling for Next 16.
- Modify `apps/web/src/app/(authenticated)/socias/page.tsx`: use session claim helper.
- Modify `apps/web/src/app/(authenticated)/socias/[id]/page.tsx`: use session claim helper.
- Modify `packages/db/scripts/verify-schema.mjs`: assert table count, RLS, policies, triggers.
- Create `packages/db/scripts/verify-schema.test.mjs`: unit tests for verifier logic.
- Create `packages/db/scripts/apply-local-schema.mjs`: apply committed SQL migration locally when full RLS/triggers are required.
- Modify `infra/scripts/setup.sh`: use full local schema apply and verification.
- Modify `infra/scripts/reset-db.sh`: reset local schema safely.
- Modify `infra/scripts/seed-db.sh`: seed a minimal local org/user/member fixture.
- Create `docs/runbooks/auth0.md`: Auth0 tenant, Regular Web App, organization, claim mapping.
- Create `docs/runbooks/local-db.md`: Docker Postgres, schema apply, seed, reset.
- Create `docs/runbooks/vercel-neon-observability.md`: Vercel, Neon, Blob, Sentry, Better Stack checklist.
- Create `.github/workflows/ci.yml`: Sprint 0 CI gate.
- Create `scripts/sprint0-ac-audit.mjs`: adversarial acceptance-criteria audit helper.

## Cross-Cutting Rules for Every Task

- Use `rtk` before shell commands in this workspace.
- Do not commit secrets or `.env.local`.
- Commit frequently. Every commit message must reference at least one `US-NNN` or `CHG-NNN`.
- Before marking a story done, append `ac_verify` events to `.nous-feedback.jsonl` per `docs/dev-guide/FEEDBACK.md`.
- Final Sprint 0 verification requires:
  - `rtk pnpm type-check`
  - `rtk pnpm lint`
  - `rtk pnpm test`
  - `rtk pnpm build`
  - `rtk zsh -lc 'cd packages/db && node scripts/verify-schema.mjs'`
  - `rtk zsh -lc 'cd apps/web && pnpm test:e2e'`

---

### Task 1: Capture Sprint 0 Status Baseline

**Files:**
- Create: `docs/stories/STATUS_REPORT.md`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Write the status report**

Create `docs/stories/STATUS_REPORT.md` with this structure:

```markdown
# Sprint 0 Status Report

Generated: 2026-06-15

## Summary

Sprint 0 is partially scaffolded. The repository builds, local Postgres can run, Auth0 redirects to the tenant, and a worked member slice exists. The Sprint 0 story checkboxes are not yet authoritative because none are marked complete in `docs/stories/sprint-0/*.md`.

## Story Status

| Story | Status | Evidence | Remaining Work |
|---|---|---|---|
| US-001 | Partial | Monorepo exists; first commit exists. | Final Sprint 0 commit and evidence events. |
| US-002 | Pending | No Vercel project evidence. | Configure Vercel app and preview envs. |
| US-003 | Partial local only | Local Docker Postgres exists. | Configure Neon project/branching. |
| US-004 | Partial | Auth0 login redirects to tenant. | Add DB UUID claim mapping and record org setup. |
| US-005 | Pending | No verified Blob/Sentry/Better Stack. | Configure and smoke-check external services. |
| US-006 | Partial | `.env.local` files exist and are ignored. | Validate env examples and required envs. |
| US-007 | Partial | App Router renders. | Resolve route group deviation. |
| US-008 | Partial | 34 tables verify locally. | Verify RLS/policies/triggers and full SQL migration apply. |
| US-009 | Partial | Token files and lint scripts exist. | Reconcile story paths or record deviation. |
| US-010 | Partial | Serwist and manifest exist. | Playwright installability/offline checks. |
| US-011 | Partial | Some protected pages guard session. | Claim helper, DB session var, RLS tests. |
| US-012 | Partial | Cron route checks `CRON_SECRET`. | Define Sprint 0 cron contract and tests. |
| US-013 | Partial | Design-system workflow exists. | Full CI gate. |
| US-014 | Pending | No test runner/test files. | Add Vitest/Playwright/adversarial tests. |
| US-015 | Partial | Auth0 SDK route works. | Verify passwordless or record login-method deviation. |

## Local Evidence Commands

```bash
rtk pnpm type-check
rtk pnpm lint
rtk pnpm build
rtk zsh -lc 'cd packages/db && node scripts/verify-schema.mjs'
rtk zsh -lc 'curl -s -o /tmp/health.out -w "%{http_code}\n" http://localhost:3000/api/health'
rtk zsh -lc 'curl -s -o /tmp/auth.out -w "%{http_code} %{redirect_url}\n" http://localhost:3000/auth/login'
```
```

- [ ] **Step 2: Append started events**

Append these JSONL events to `.nous-feedback.jsonl`:

```jsonl
{"story":"US-001","event":"started","agent":"codex","notes":"Sprint 0 status audit started"}
{"story":"US-006","event":"started","agent":"codex","notes":"Local env and preview/prod env audit started"}
{"story":"US-008","event":"started","agent":"codex","notes":"DB schema and RLS verification audit started"}
{"story":"US-011","event":"started","agent":"codex","notes":"Auth0 session and RLS session-var audit started"}
{"story":"US-013","event":"started","agent":"codex","notes":"CI verification audit started"}
{"story":"US-014","event":"started","agent":"codex","notes":"Test infrastructure audit started"}
```

- [ ] **Step 3: Verify the report is present**

Run:

```bash
rtk test -f docs/stories/STATUS_REPORT.md
rtk tail -n 6 .nous-feedback.jsonl
```

Expected: the status file exists and the six `started` events print.

- [ ] **Step 4: Commit**

```bash
rtk git add docs/stories/STATUS_REPORT.md .nous-feedback.jsonl
rtk git commit -m "docs(sprint0): capture foundation status baseline (US-001)"
```

---

### Task 2: Add Unit Test and Playwright Substrate

**Files:**
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `packages/db/package.json`
- Modify: `packages/domain/package.json`
- Modify: `packages/contracts/package.json`
- Modify: `packages/ui/package.json`
- Create: `vitest.workspace.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `packages/db/vitest.config.ts`
- Create: `packages/domain/vitest.config.ts`
- Create: `apps/web/e2e/sprint0-foundation.spec.ts`

- [ ] **Step 1: Add test dependencies**

Run:

```bash
rtk pnpm add -D vitest jsdom @testing-library/react @testing-library/jest-dom @playwright/test
```

Expected: `package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Add root scripts**

Modify root `package.json` scripts to include:

```json
{
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "type-check": "turbo run type-check",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "test:e2e": "pnpm --filter mi-banquito-web test:e2e"
  }
}
```

- [ ] **Step 3: Add package test scripts**

In `apps/web/package.json`, add:

```json
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts",
    "test:e2e": "playwright test"
  }
}
```

In `packages/db/package.json`, add:

```json
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts"
  }
}
```

In `packages/domain/package.json`, add:

```json
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts"
  }
}
```

In `packages/contracts/package.json`, `packages/ui/package.json`, and `packages/config/package.json`, add a harmless placeholder test script until each package has real tests:

```json
{
  "scripts": {
    "test": "echo 'no tests yet'"
  }
}
```

- [ ] **Step 4: Create Vitest workspace**

Create `vitest.workspace.ts`:

```ts
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "apps/web/vitest.config.ts",
  "packages/db/vitest.config.ts",
  "packages/domain/vitest.config.ts",
]);
```

- [ ] **Step 5: Create app Vitest config**

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 6: Create DB Vitest config**

Create `packages/db/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["scripts/**/*.test.{mjs,ts}", "src/**/*.test.ts"],
  },
});
```

- [ ] **Step 7: Create domain Vitest config**

Create `packages/domain/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 8: Create the first Playwright smoke test**

Create `apps/web/e2e/sprint0-foundation.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("health endpoint returns ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  await expect(response).toHaveOKStatus;
  expect(await response.json()).toEqual({ status: "ok" });
});

test("unauthenticated member list redirects to Auth0 login route", async ({ page }) => {
  const response = await page.goto("/socias", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(307);
  expect(page.url()).toContain("/auth/login");
});

test("manifest is reachable and names the app", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.name).toContain("Mi Banquito");
});
```

- [ ] **Step 9: Run the new tests**

Run:

```bash
rtk pnpm test
```

Expected initially: Vitest packages pass or echo `no tests yet`.

Run with the dev server active:

```bash
rtk zsh -lc 'cd apps/web && pnpm test:e2e'
```

Expected initially: Playwright may fail until `playwright.config.ts` is added in Task 10. This establishes the red state.

- [ ] **Step 10: Commit**

```bash
rtk git add package.json pnpm-lock.yaml apps/web/package.json packages/*/package.json vitest.workspace.ts apps/web/vitest.config.ts packages/db/vitest.config.ts packages/domain/vitest.config.ts apps/web/e2e/sprint0-foundation.spec.ts
rtk git commit -m "test(sprint0): add unit and browser test substrate (US-014)"
```

---

### Task 3: Add Playwright Configuration and Browser Verification Gate

**Files:**
- Create: `apps/web/playwright.config.ts`
- Modify: `apps/web/e2e/sprint0-foundation.spec.ts`

- [ ] **Step 1: Create Playwright config**

Create `apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
  ],
});
```

- [ ] **Step 2: Fix the Playwright response assertion**

Replace this invalid line in `apps/web/e2e/sprint0-foundation.spec.ts`:

```ts
await expect(response).toHaveOKStatus;
```

with:

```ts
expect(response.ok()).toBe(true);
```

- [ ] **Step 3: Run Playwright red/green check**

Run:

```bash
rtk zsh -lc 'cd apps/web && pnpm test:e2e'
```

Expected: the three tests pass in both desktop and mobile projects. If `/socias` returns 500, apply Task 7 before rerunning.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/playwright.config.ts apps/web/e2e/sprint0-foundation.spec.ts
rtk git commit -m "test(web): add Sprint 0 Playwright smoke gate (US-013 US-014)"
```

---

### Task 4: Normalize Auth0 Session Claims to DB UUIDs

**Files:**
- Create: `apps/web/src/lib/auth/session-claims.ts`
- Create: `apps/web/src/lib/auth/session-claims.test.ts`
- Modify: `apps/web/src/app/(authenticated)/socias/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/socias/[id]/page.tsx`
- Modify: `docs/runbooks/auth0.md`

- [ ] **Step 1: Write failing unit tests**

Create `apps/web/src/lib/auth/session-claims.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getDbOrgIdFromUser, getRolesFromUser } from "./session-claims";

const namespace = "https://mi-banquito.app";

describe("session claims", () => {
  it("uses the namespaced DB org UUID claim before Auth0 native org_id", () => {
    const user = {
      org_id: "org_auth0native",
      [`${namespace}/org_id`]: "11111111-1111-4111-8111-111111111111",
    };

    expect(getDbOrgIdFromUser(user)).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("rejects Auth0 native org ids because Postgres org_id is uuid", () => {
    expect(getDbOrgIdFromUser({ org_id: "org_Chul6oWgE2ZzCNvE" })).toBeUndefined();
  });

  it("returns undefined for missing tenant claims", () => {
    expect(getDbOrgIdFromUser({ sub: "auth0|abc" })).toBeUndefined();
  });

  it("reads namespaced roles first and falls back to legacy roles", () => {
    expect(getRolesFromUser({ [`${namespace}/roles`]: ["TESORERA"] })).toEqual(["TESORERA"]);
    expect(getRolesFromUser({ roles: ["PLATFORM_OPERATOR"] })).toEqual(["PLATFORM_OPERATOR"]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
rtk zsh -lc 'cd apps/web && pnpm test -- src/lib/auth/session-claims.test.ts'
```

Expected: FAIL with import error because `session-claims.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/lib/auth/session-claims.ts`:

```ts
const CLAIM_NAMESPACE = "https://mi-banquito.app";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClaimUser = Record<string, unknown>;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function getDbOrgIdFromUser(user: ClaimUser | null | undefined): string | undefined {
  if (!user) return undefined;
  const namespaced = user[`${CLAIM_NAMESPACE}/org_id`];
  if (typeof namespaced === "string" && UUID_RE.test(namespaced)) {
    return namespaced;
  }
  const legacy = user.org_id;
  if (typeof legacy === "string" && UUID_RE.test(legacy)) {
    return legacy;
  }
  return undefined;
}

export function getRolesFromUser(user: ClaimUser | null | undefined): string[] {
  if (!user) return [];
  const namespaced = asStringArray(user[`${CLAIM_NAMESPACE}/roles`]);
  if (namespaced.length > 0) return namespaced;
  return asStringArray(user.roles);
}
```

- [ ] **Step 4: Use helper in member pages**

In `apps/web/src/app/(authenticated)/socias/page.tsx`, replace:

```ts
const orgId = session?.user?.org_id as string | undefined; // tenant from the session claim
if (!orgId) {
  redirect(ROUTE_LOGIN);
}
```

with:

```ts
const orgId = getDbOrgIdFromUser(session?.user);
if (!orgId) {
  redirect(ROUTE_LOGIN);
}
```

and add:

```ts
import { getDbOrgIdFromUser } from "@/lib/auth/session-claims";
```

In `apps/web/src/app/(authenticated)/socias/[id]/page.tsx`, make the same replacement and import.

- [ ] **Step 5: Document Auth0 Action**

Create `docs/runbooks/auth0.md`:

```markdown
# Auth0 Runbook

## Application Type

Use a Regular Web Application. This app uses `@auth0/nextjs-auth0/server`, server sessions, and `AUTH0_CLIENT_SECRET`; it is not a browser-only SPA.

## Required Local URLs

- Allowed Callback URL: `http://localhost:3000/auth/callback`
- Allowed Logout URL: `http://localhost:3000`
- Allowed Web Origin: `http://localhost:3000`

## Organization Metadata

Each Auth0 Organization must include:

```txt
db_org_id=<uuid from the app database organization.id>
```

## Post-Login Action

```js
exports.onExecutePostLogin = async (event, api) => {
  const namespace = "https://mi-banquito.app";
  const dbOrgId = event.organization?.metadata?.db_org_id;

  if (dbOrgId) {
    api.idToken.setCustomClaim(`${namespace}/org_id`, dbOrgId);
  }

  if (event.authorization?.roles) {
    api.idToken.setCustomClaim(`${namespace}/roles`, event.authorization.roles);
  }
};
```
```

- [ ] **Step 6: Run unit tests**

Run:

```bash
rtk zsh -lc 'cd apps/web && pnpm test -- src/lib/auth/session-claims.test.ts'
```

Expected: PASS.

- [ ] **Step 7: Run browser regression**

Run:

```bash
rtk zsh -lc 'cd apps/web && pnpm test:e2e'
```

Expected: unauthenticated `/socias` redirects; no 500 due to empty UUID.

- [ ] **Step 8: Record adversarial AC verification**

Append:

```jsonl
{"story":"US-004","event":"ac_verify","ac":6,"method":"unit test + Auth0 runbook review","pass":true,"notes":"DB UUID is read from namespaced custom claim; native Auth0 org_ id is rejected"}
{"story":"US-011","event":"ac_verify","ac":5,"method":"Playwright unauthenticated /socias check","pass":true,"notes":"No session redirects before tenant-scoped DB query"}
```

- [ ] **Step 9: Commit**

```bash
rtk git add apps/web/src/lib/auth/session-claims.ts apps/web/src/lib/auth/session-claims.test.ts apps/web/src/app/'(authenticated)'/socias/page.tsx apps/web/src/app/'(authenticated)'/socias/'[id]'/page.tsx docs/runbooks/auth0.md .nous-feedback.jsonl
rtk git commit -m "fix(auth): map Auth0 organization to DB tenant UUID (US-004 US-011)"
```

---

### Task 5: Fix Auth0 Route Mounting for Next 16

**Files:**
- Modify or Create: `apps/web/src/proxy.ts`
- Modify or Delete: `apps/web/src/middleware.ts`
- Modify: `apps/web/src/lib/auth0.ts`
- Test: `apps/web/e2e/sprint0-foundation.spec.ts`

- [ ] **Step 1: Write browser expectation**

Add this test to `apps/web/e2e/sprint0-foundation.spec.ts`:

```ts
test("Auth0 login route is mounted and redirects to Auth0", async ({ request }) => {
  const response = await request.get("/auth/login", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  const location = response.headers()["location"];
  expect(location).toContain(".auth0.com/authorize");
  expect(location).toContain("organization=");
});
```

- [ ] **Step 2: Run and verify current behavior**

Run:

```bash
rtk zsh -lc 'cd apps/web && pnpm test:e2e -g "Auth0 login route"'
```

Expected: PASS if the current local fix is present; FAIL if `/auth/login` returns 404/500.

- [ ] **Step 3: Use Next 16 proxy convention**

Create `apps/web/src/proxy.ts`:

```ts
import { auth0 } from "@/lib/auth0";

export async function proxy(request: Request) {
  return auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
```

If `apps/web/src/middleware.ts` still exists, replace its content with:

```ts
export { proxy as middleware, config } from "./proxy";
```

- [ ] **Step 4: Keep Auth0 organization optional**

Ensure `apps/web/src/lib/auth0.ts` contains:

```ts
authorizationParameters: {
  ...(process.env.AUTH0_ORGANIZATION ? { organization: process.env.AUTH0_ORGANIZATION } : {}),
},
```

- [ ] **Step 5: Run verification**

Run:

```bash
rtk zsh -lc 'curl -s -o /tmp/auth.out -w "%{http_code} %{redirect_url}\n" http://localhost:3000/auth/login'
rtk zsh -lc 'cd apps/web && pnpm test:e2e -g "Auth0 login route"'
rtk pnpm build
```

Expected: curl prints `307 https://...auth0.com/...`; Playwright passes; build has no app error. A package-level Auth0 webpack warning is acceptable if build exits 0.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/src/proxy.ts apps/web/src/middleware.ts apps/web/src/lib/auth0.ts apps/web/e2e/sprint0-foundation.spec.ts
rtk git commit -m "fix(auth): mount Auth0 SDK routes through proxy (US-015)"
```

---

### Task 6: Strengthen DB Schema Application and Verification

**Files:**
- Modify: `packages/db/scripts/verify-schema.mjs`
- Create: `packages/db/scripts/verify-schema.test.mjs`
- Create: `packages/db/scripts/apply-local-schema.mjs`
- Modify: `infra/scripts/setup.sh`
- Modify: `infra/scripts/reset-db.sh`
- Modify: `docs/runbooks/local-db.md`

- [ ] **Step 1: Write verifier unit tests**

Create `packages/db/scripts/verify-schema.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import {
  evaluateSchemaHealth,
  EXPECTED_RLS_TABLES,
  EXPECTED_TABLES,
} from "./verify-schema.mjs";

describe("schema verifier", () => {
  it("passes when table, RLS, policy, and trigger counts meet minimums", () => {
    const result = evaluateSchemaHealth({
      tableCount: EXPECTED_TABLES,
      rlsTableCount: EXPECTED_RLS_TABLES,
      policyCount: EXPECTED_RLS_TABLES,
      triggerCount: 28,
    });
    expect(result.ok).toBe(true);
  });

  it("fails when drizzle push creates tables but no RLS policies", () => {
    const result = evaluateSchemaHealth({
      tableCount: EXPECTED_TABLES,
      rlsTableCount: 0,
      policyCount: 0,
      triggerCount: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("expected at least 29 RLS-enabled tables, found 0");
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
rtk zsh -lc 'cd packages/db && pnpm test -- scripts/verify-schema.test.mjs'
```

Expected: FAIL because `verify-schema.mjs` does not export `evaluateSchemaHealth`.

- [ ] **Step 3: Refactor verifier with exported health check**

Modify `packages/db/scripts/verify-schema.mjs` so it exports:

```js
export const EXPECTED_TABLES = 34;
export const EXPECTED_RLS_TABLES = 29;
export const EXPECTED_POLICIES = 29;
export const EXPECTED_TRIGGERS = 28;

export function evaluateSchemaHealth({
  tableCount,
  rlsTableCount,
  policyCount,
  triggerCount,
}) {
  const errors = [];
  if (tableCount < EXPECTED_TABLES) {
    errors.push(`expected at least ${EXPECTED_TABLES} tables, found ${tableCount}`);
  }
  if (rlsTableCount < EXPECTED_RLS_TABLES) {
    errors.push(`expected at least ${EXPECTED_RLS_TABLES} RLS-enabled tables, found ${rlsTableCount}`);
  }
  if (policyCount < EXPECTED_POLICIES) {
    errors.push(`expected at least ${EXPECTED_POLICIES} RLS policies, found ${policyCount}`);
  }
  if (triggerCount < EXPECTED_TRIGGERS) {
    errors.push(`expected at least ${EXPECTED_TRIGGERS} triggers, found ${triggerCount}`);
  }
  return { ok: errors.length === 0, errors };
}
```

Then update the runtime SQL to query:

```sql
SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public') AS table_count,
  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity) AS rls_table_count,
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public') AS policy_count,
  (SELECT count(*)::int FROM information_schema.triggers WHERE trigger_schema = 'public') AS trigger_count
```

- [ ] **Step 4: Add full local schema apply script**

Create `packages/db/scripts/apply-local-schema.mjs`:

```js
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import pg from "pg";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = await readFile("src/migrations/V20260202151603__init_schema.sql", "utf8");
const pool = new pg.Pool({ connectionString: url });
try {
  await pool.query(sql);
  console.log("local SQL migration applied");
} finally {
  await pool.end();
}
```

- [ ] **Step 5: Update setup script**

In `infra/scripts/setup.sh`, replace:

```bash
pnpm drizzle-kit push
node scripts/verify-schema.mjs
```

with:

```bash
node scripts/apply-local-schema.mjs
node scripts/verify-schema.mjs
```

- [ ] **Step 6: Run DB tests and verifier**

Run:

```bash
rtk zsh -lc 'cd packages/db && pnpm test -- scripts/verify-schema.test.mjs'
rtk zsh -lc 'cd packages/db && node scripts/verify-schema.mjs'
```

Expected: unit tests pass and verifier prints a success message including tables, RLS, policies, and triggers.

- [ ] **Step 7: Record adversarial DB verification**

Append:

```jsonl
{"story":"US-008","event":"ac_verify","ac":1,"method":"schema verifier","pass":true,"notes":"Verifier asserts 34 tables, RLS-enabled tables, policies, and triggers"}
{"story":"US-072","event":"ac_verify","ac":1,"method":"schema verifier","pass":true,"notes":"RLS presence is verified; cross-tenant behavioral test remains required before US-072 done"}
```

- [ ] **Step 8: Commit**

```bash
rtk git add packages/db/scripts/verify-schema.mjs packages/db/scripts/verify-schema.test.mjs packages/db/scripts/apply-local-schema.mjs infra/scripts/setup.sh infra/scripts/reset-db.sh docs/runbooks/local-db.md .nous-feedback.jsonl
rtk git commit -m "test(db): verify full Sprint 0 schema substrate (US-008)"
```

---

### Task 7: Implement Minimal Seed for Local Authenticated Smoke Testing

**Files:**
- Modify: `infra/scripts/seed-db.sh`
- Create: `packages/db/scripts/seed-local.mjs`
- Modify: `docs/runbooks/local-db.md`

- [ ] **Step 1: Create seed script**

Create `packages/db/scripts/seed-local.mjs`:

```js
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const pool = new pg.Pool({ connectionString: url });

try {
  await pool.query(`
    INSERT INTO platform_operator (id, auth_subject, display_name, email, created_at)
    VALUES ('22222222-2222-4222-8222-222222222222', 'auth0|local-operator', 'Local Operator', 'operator@example.local', now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO organization (id, name, country_code, currency_code, timezone, status, platform_operator_id, created_at)
    VALUES ($1, 'FcoStudios Local Banquito', 'EC', 'USD', 'America/Guayaquil', 'active', '22222222-2222-4222-8222-222222222222', now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO member (id, org_id, display_name, whatsapp, role, status, joined_at, created_at)
    VALUES ('33333333-3333-4333-8333-333333333333', $1, 'Socia Local', '+593999999999', 'member', 'active', current_date, now())
    ON CONFLICT (id) DO NOTHING;
  `, [ORG_ID]);
  console.log(`seeded local organization ${ORG_ID}`);
} finally {
  await pool.end();
}
```

- [ ] **Step 2: Wire shell seed script**

Replace `infra/scripts/seed-db.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Seeding development database ==="
cd packages/db
node scripts/seed-local.mjs
node scripts/verify-schema.mjs
```

- [ ] **Step 3: Run seed**

Run:

```bash
rtk infra/scripts/seed-db.sh
```

Expected: prints `seeded local organization 11111111-1111-4111-8111-111111111111` and schema verifier passes.

- [ ] **Step 4: Document Auth0 metadata connection**

Append to `docs/runbooks/local-db.md`:

```markdown
## Local Auth0 Organization Metadata

For local smoke tests, set the Auth0 Organization metadata field:

```txt
db_org_id=11111111-1111-4111-8111-111111111111
```

The app reads this value from the namespaced claim emitted by the Auth0 Post-Login Action.
```

- [ ] **Step 5: Commit**

```bash
rtk git add infra/scripts/seed-db.sh packages/db/scripts/seed-local.mjs docs/runbooks/local-db.md
rtk git commit -m "chore(db): add local Sprint 0 seed data (US-006 US-008)"
```

---

### Task 8: Resolve Route Group and Shell Foundation Deviation

**Files:**
- Modify: `docs/stories/STATUS_REPORT.md`
- Modify: `.nous-feedback.jsonl`
- Modify: `apps/web/src/components/layout/sidebar.tsx`
- Modify: `apps/web/src/components/layout/mobile-bar.tsx`
- Test: `apps/web/src/components/layout/sidebar.test.tsx`

- [ ] **Step 1: Record route-group deviation decision**

Append this decision to `.nous-feedback.jsonl` if the team keeps `(authenticated)`:

```jsonl
{"story":"US-007","event":"deviation","notes":"Current app uses a single (authenticated) route group with nested admin paths instead of story text app/(treasurer) and app/(admin). This is accepted for now because Auth0/session middleware, route generation, and nav map already target the current structure."}
```

If the team chooses to align with the story text instead, split `apps/web/src/app/(authenticated)` into `app/(treasurer)` and `app/(admin)` before continuing.

- [ ] **Step 2: Write sidebar role test**

Create `apps/web/src/components/layout/sidebar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

const useUser = vi.fn();
vi.mock("@auth0/nextjs-auth0", () => ({
  useUser: () => useUser(),
}));

describe("Sidebar", () => {
  it("shows treasurer nav and hides admin nav for TESORERA", () => {
    useUser.mockReturnValue({ user: { "https://mi-banquito.app/roles": ["TESORERA"] } });
    render(<Sidebar />);
    expect(screen.getByText("Socias")).toBeInTheDocument();
    expect(screen.queryByText("Estado de crons")).not.toBeInTheDocument();
  });

  it("shows admin nav and hides treasurer nav for PLATFORM_OPERATOR", () => {
    useUser.mockReturnValue({ user: { "https://mi-banquito.app/roles": ["PLATFORM_OPERATOR"] } });
    render(<Sidebar />);
    expect(screen.getByText("Estado de crons")).toBeInTheDocument();
    expect(screen.queryByText("Socias")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run and verify failure**

Run:

```bash
rtk zsh -lc 'cd apps/web && pnpm test -- src/components/layout/sidebar.test.tsx'
```

Expected: FAIL until `Sidebar` uses the new `getRolesFromUser` helper and stops treating missing roles as "show all".

- [ ] **Step 4: Update Sidebar role filtering**

In `apps/web/src/components/layout/sidebar.tsx`, import:

```ts
import { getRolesFromUser } from "@/lib/auth/session-claims";
```

Replace:

```ts
const userRoles = ((user as { roles?: string[] } | undefined)?.roles) ?? [];
const visible = navItems.filter(
  (item) =>
    !item.roles ||
    item.roles.length === 0 ||
    userRoles.length === 0 ||
    item.roles.some((r) => userRoles.includes(r)),
);
```

with:

```ts
const userRoles = getRolesFromUser(user as Record<string, unknown> | undefined);
const visible = navItems.filter((item) => {
  if (!item.roles || item.roles.length === 0) return true;
  return item.roles.some((role) => userRoles.includes(role));
});
```

- [ ] **Step 5: Run unit and browser checks**

Run:

```bash
rtk zsh -lc 'cd apps/web && pnpm test -- src/components/layout/sidebar.test.tsx'
rtk zsh -lc 'cd apps/web && pnpm test:e2e'
```

Expected: sidebar tests pass; browser smoke tests pass.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/src/components/layout/sidebar.tsx apps/web/src/components/layout/sidebar.test.tsx docs/stories/STATUS_REPORT.md .nous-feedback.jsonl
rtk git commit -m "fix(shell): enforce role-scoped Sprint 0 navigation (US-007 US-011)"
```

---

### Task 9: Reconcile Design-System Foundation

**Files:**
- Modify: `docs/stories/STATUS_REPORT.md`
- Modify: `.nous-feedback.jsonl`
- Create: `packages/ui/src/tokens/tokens.v1.json`
- Create: `packages/ui/src/strings/strings.es-EC.json`
- Create: `packages/ui/src/icons/lucide-allowlist.ts`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/src/design-system-foundation.test.ts`

- [ ] **Step 1: Add design-system foundation test**

Create `packages/ui/src/design-system-foundation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import tokens from "./tokens/tokens.v1.json";
import strings from "./strings/strings.es-EC.json";
import { LUCIDE_ICON_ALLOWLIST } from "./icons/lucide-allowlist";

describe("Sprint 0 design-system foundation", () => {
  it("ships locked token colors used by the app", () => {
    expect(tokens.color.primary).toBe("#2D7A4F");
    expect(tokens.color.background).toBe("#F8F4E9");
  });

  it("ships locked Spanish vocabulary", () => {
    expect(strings.nav.home).toBe("Inicio");
    expect(strings.nav.members).toBe("Socias");
  });

  it("exports the allowed lucide icons", () => {
    expect(LUCIDE_ICON_ALLOWLIST).toContain("Users");
    expect(LUCIDE_ICON_ALLOWLIST).toContain("Settings");
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
rtk zsh -lc 'cd packages/ui && pnpm test -- src/design-system-foundation.test.ts'
```

Expected: FAIL because files do not exist.

- [ ] **Step 3: Add token JSON**

Create `packages/ui/src/tokens/tokens.v1.json`:

```json
{
  "color": {
    "accent": "#C45F36",
    "background": "#F8F4E9",
    "border": "#CBD5E1",
    "primary": "#2D7A4F",
    "secondary": "#1E5180",
    "surface": "#FFFFFF",
    "surfaceMuted": "#E2E8F0",
    "textOnPrimary": "#F8F4E9",
    "textPrimary": "#0F172A",
    "textSecondary": "#475569"
  }
}
```

- [ ] **Step 4: Add Spanish strings**

Create `packages/ui/src/strings/strings.es-EC.json`:

```json
{
  "nav": {
    "home": "Inicio",
    "members": "Socias",
    "contributions": "Aportes",
    "loans": "Préstamos",
    "history": "Historial"
  }
}
```

- [ ] **Step 5: Add Lucide allow-list export**

Create `packages/ui/src/icons/lucide-allowlist.ts`:

```ts
export const LUCIDE_ICON_ALLOWLIST = [
  "Bell",
  "Calendar",
  "Circle",
  "HandCoins",
  "History",
  "Home",
  "Settings",
  "Users",
  "Wallet",
] as const;

export type AllowedLucideIcon = (typeof LUCIDE_ICON_ALLOWLIST)[number];
```

Export it from `packages/ui/src/index.ts`:

```ts
export * from "./icons/lucide-allowlist";
```

- [ ] **Step 6: Run tests and lints**

Run:

```bash
rtk zsh -lc 'cd packages/ui && pnpm test -- src/design-system-foundation.test.ts'
rtk pnpm lint
```

Expected: test and lint pass.

- [ ] **Step 7: Record deviation if keeping `packages/design-system` as canonical CSS source**

Append:

```jsonl
{"story":"US-009","event":"deviation","notes":"Tailwind v4 tokens are consumed from apps/web/src/styles/tokens.css generated from packages/design-system; packages/ui now also ships tokens.v1.json and strings.es-EC.json for story contract compatibility."}
{"story":"US-009","event":"ac_verify","ac":2,"method":"unit test","pass":true,"notes":"packages/ui/src/tokens/tokens.v1.json contains locked Sprint 0 token values"}
{"story":"US-009","event":"ac_verify","ac":3,"method":"unit test","pass":true,"notes":"packages/ui/src/strings/strings.es-EC.json contains locked nav vocabulary"}
{"story":"US-009","event":"ac_verify","ac":4,"method":"unit test","pass":true,"notes":"Lucide allow-list is exported from packages/ui"}
```

- [ ] **Step 8: Commit**

```bash
rtk git add packages/ui/src/tokens/tokens.v1.json packages/ui/src/strings/strings.es-EC.json packages/ui/src/icons/lucide-allowlist.ts packages/ui/src/index.ts packages/ui/src/design-system-foundation.test.ts docs/stories/STATUS_REPORT.md .nous-feedback.jsonl
rtk git commit -m "feat(ui): complete Sprint 0 design-system contract (US-009)"
```

---

### Task 10: Verify PWA and Serwist Foundation

**Files:**
- Modify: `apps/web/e2e/sprint0-foundation.spec.ts`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Add PWA tests**

Add to `apps/web/e2e/sprint0-foundation.spec.ts`:

```ts
test("service worker asset is generated", async ({ request }) => {
  const response = await request.get("/sw.js");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("javascript");
});

test("app shell renders on mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Mi Banquito")).toBeVisible();
});
```

- [ ] **Step 2: Run Playwright**

Run:

```bash
rtk zsh -lc 'cd apps/web && pnpm test:e2e -g "service worker|mobile viewport"'
```

Expected: PASS.

- [ ] **Step 3: Record adversarial PWA verification**

Append:

```jsonl
{"story":"US-010","event":"ac_verify","ac":1,"method":"Playwright request","pass":true,"notes":"manifest.webmanifest is reachable and names Mi Banquito"}
{"story":"US-010","event":"ac_verify","ac":2,"method":"Playwright request","pass":true,"notes":"sw.js is generated and served"}
{"story":"US-010","event":"ac_verify","ac":3,"method":"mobile viewport render","pass":true,"notes":"app shell renders on Pixel-size viewport"}
```

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/e2e/sprint0-foundation.spec.ts .nous-feedback.jsonl
rtk git commit -m "test(pwa): verify Sprint 0 installable shell assets (US-010)"
```

---

### Task 11: Verify Cron Route Security Contract

**Files:**
- Create: `apps/web/src/app/api/cron/daily/route.test.ts`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Write route tests**

Create `apps/web/src/app/api/cron/daily/route.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  process.env.CRON_SECRET = originalSecret;
});

describe("daily cron route", () => {
  it("rejects requests without CRON_SECRET configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new Request("http://localhost/api/cron/daily"));
    expect(response.status).toBe(401);
  });

  it("rejects requests with the wrong bearer token", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const response = await GET(new Request("http://localhost/api/cron/daily", {
      headers: { authorization: "Bearer wrong-secret" },
    }));
    expect(response.status).toBe(401);
  });

  it("accepts requests with the configured bearer token", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const response = await GET(new Request("http://localhost/api/cron/daily", {
      headers: { authorization: "Bearer correct-secret" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ran: true });
  });
});
```

- [ ] **Step 2: Run route tests**

Run:

```bash
rtk zsh -lc 'cd apps/web && pnpm test -- src/app/api/cron/daily/route.test.ts'
```

Expected: PASS.

- [ ] **Step 3: Record adversarial cron verification**

Append:

```jsonl
{"story":"US-012","event":"ac_verify","ac":1,"method":"unit test","pass":true,"notes":"Cron route rejects missing CRON_SECRET"}
{"story":"US-012","event":"ac_verify","ac":2,"method":"unit test","pass":true,"notes":"Cron route rejects wrong bearer token and accepts correct token"}
{"story":"US-012","event":"deviation","notes":"Sprint 0 cron route is a secured no-op returning {ran:true}; business cron jobs remain feature-story work."}
```

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/src/app/api/cron/daily/route.test.ts .nous-feedback.jsonl
rtk git commit -m "test(cron): verify secured Sprint 0 cron route (US-012)"
```

---

### Task 12: Add Full CI Gate

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: mi_banquito
        ports:
          - 55432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d mi_banquito"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:55432/mi_banquito
      DB_DRIVER: pg
      APP_BASE_URL: http://localhost:3000
      AUTH0_DOMAIN: https://example.us.auth0.com
      AUTH0_CLIENT_ID: ci-client-id
      AUTH0_CLIENT_SECRET: ci-client-secret
      AUTH0_SECRET: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
      CRON_SECRET: ci-cron-secret
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Apply full local schema
        run: cd packages/db && node scripts/apply-local-schema.mjs && node scripts/verify-schema.mjs
      - name: Type check
        run: pnpm type-check
      - name: Lint
        run: pnpm lint
      - name: Unit tests
        run: pnpm test
      - name: Build
        run: pnpm build
      - name: Install Playwright browsers
        run: pnpm --filter mi-banquito-web exec playwright install --with-deps chromium
      - name: Playwright smoke tests
        run: pnpm --filter mi-banquito-web test:e2e -- --project=chromium-desktop
```

- [ ] **Step 2: Validate workflow syntax locally**

Run:

```bash
rtk sed -n '1,220p' .github/workflows/ci.yml
```

Expected: file prints with valid YAML indentation.

- [ ] **Step 3: Record CI verification event**

Append after first successful local equivalent run:

```jsonl
{"story":"US-013","event":"ac_verify","ac":1,"method":"CI workflow inspection + local equivalent commands","pass":true,"notes":"CI runs install, schema apply/verify, type-check, lint, tests, build, and Playwright smoke"}
```

- [ ] **Step 4: Commit**

```bash
rtk git add .github/workflows/ci.yml .nous-feedback.jsonl
rtk git commit -m "ci: add Sprint 0 verification pipeline (US-013)"
```

---

### Task 13: Add Adversarial Sprint 0 AC Audit Script

**Files:**
- Create: `scripts/sprint0-ac-audit.mjs`
- Modify: `package.json`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Create audit script**

Create `scripts/sprint0-ac-audit.mjs`:

```js
import { readFileSync, existsSync } from "node:fs";

const sprint0Stories = [
  "US-001", "US-002", "US-003", "US-004", "US-005",
  "US-006", "US-007", "US-008", "US-009", "US-010",
  "US-011", "US-012", "US-013", "US-014", "US-015",
];

const feedbackPath = ".nous-feedback.jsonl";
if (!existsSync(feedbackPath)) {
  console.error("missing .nous-feedback.jsonl");
  process.exit(1);
}

const events = readFileSync(feedbackPath, "utf8")
  .trim()
  .split(/\n+/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

let failed = false;
for (const story of sprint0Stories) {
  const storyEvents = events.filter((event) => event.story === story);
  const hasStarted = storyEvents.some((event) => event.event === "started");
  if (!hasStarted) {
    console.error(`${story}: missing started event`);
    failed = true;
  }
  const done = storyEvents.some((event) => event.event === "done");
  if (done) {
    const hasBuild = storyEvents.some((event) => event.event === "build_pass");
    const hasVerify = storyEvents.some((event) => event.event === "ac_verify" && event.pass === true);
    if (!hasBuild) {
      console.error(`${story}: done without build_pass`);
      failed = true;
    }
    if (!hasVerify) {
      console.error(`${story}: done without passing ac_verify`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("Sprint 0 AC audit passed");
```

- [ ] **Step 2: Add root script**

Add to root `package.json`:

```json
{
  "scripts": {
    "audit:sprint0": "node scripts/sprint0-ac-audit.mjs"
  }
}
```

- [ ] **Step 3: Run audit**

Run:

```bash
rtk pnpm audit:sprint0
```

Expected: PASS once every Sprint 0 story has at least a `started` event and no story is marked `done` without evidence. If it fails for missing `started` events, append missing `started` events before rerunning.

- [ ] **Step 4: Commit**

```bash
rtk git add scripts/sprint0-ac-audit.mjs package.json .nous-feedback.jsonl
rtk git commit -m "test(sprint0): enforce adversarial AC evidence audit (US-014)"
```

---

### Task 14: External Service Readiness Runbooks

**Files:**
- Create: `docs/runbooks/vercel-neon-observability.md`
- Modify: `docs/stories/STATUS_REPORT.md`
- Modify: `.nous-feedback.jsonl`

- [ ] **Step 1: Create external service runbook**

Create `docs/runbooks/vercel-neon-observability.md`:

```markdown
# Vercel, Neon, Blob, Sentry, and Better Stack Runbook

## Vercel

- Project type: Next.js
- Build command: `pnpm build`
- Install command: `pnpm install --frozen-lockfile`
- Production envs:
  - `DATABASE_URL`
  - `DB_DRIVER=neon`
  - `APP_BASE_URL`
  - `AUTH0_DOMAIN`
  - `AUTH0_CLIENT_ID`
  - `AUTH0_CLIENT_SECRET`
  - `AUTH0_SECRET`
  - `AUTH0_ORGANIZATION`
  - `CRON_SECRET`

## Neon

- Production branch: main production database.
- Preview branch: one database branch per Vercel preview.
- Required schema command before acceptance: `cd packages/db && node scripts/apply-local-schema.mjs && node scripts/verify-schema.mjs` against the target database URL.

## Vercel Blob

- Store slip photos and generated PDF artifacts.
- Required env name: `BLOB_READ_WRITE_TOKEN`.
- Sprint 0 readiness check: token is configured in Vercel but not used by the no-op scaffold.

## Sentry

- Required envs once enabled:
  - `SENTRY_DSN`
  - `SENTRY_AUTH_TOKEN`
  - `SENTRY_ORG`
  - `SENTRY_PROJECT`

## Better Stack

- Monitor `/api/health`.
- Expected response: HTTP 200 with `{"status":"ok"}`.
```

- [ ] **Step 2: Record external pending status accurately**

Append:

```jsonl
{"story":"US-002","event":"blocked","reason":"Vercel project details are external to repo","needs":"Production and preview Vercel project URLs plus env confirmation"}
{"story":"US-003","event":"blocked","reason":"Neon project details are external to repo","needs":"Neon project connection URL and preview branch strategy confirmation"}
{"story":"US-005","event":"blocked","reason":"Blob/Sentry/Better Stack details are external to repo","needs":"Vercel Blob token, Sentry project, Better Stack monitor confirmation"}
```

- [ ] **Step 3: Commit**

```bash
rtk git add docs/runbooks/vercel-neon-observability.md docs/stories/STATUS_REPORT.md .nous-feedback.jsonl
rtk git commit -m "docs(infra): document Sprint 0 external service readiness (US-002 US-003 US-005)"
```

---

### Task 15: Full Sprint 0 Verification Pass

**Files:**
- Modify: `.nous-feedback.jsonl`
- Modify: `docs/stories/STATUS_REPORT.md`

- [ ] **Step 1: Run type check**

Run:

```bash
rtk pnpm type-check
```

Expected: all package type-check tasks pass.

- [ ] **Step 2: Run lint**

Run:

```bash
rtk pnpm lint
```

Expected: ESLint and design-system lint scripts pass.

- [ ] **Step 3: Run unit tests**

Run:

```bash
rtk pnpm test
```

Expected: all configured Vitest tests pass and placeholder package tests exit 0.

- [ ] **Step 4: Run build**

Run:

```bash
rtk pnpm build
```

Expected: Next build exits 0. Auth0 dynamic dependency warning may appear but must not fail the build.

- [ ] **Step 5: Run DB schema verification**

Run:

```bash
rtk zsh -lc 'cd packages/db && node scripts/verify-schema.mjs'
```

Expected: verifier confirms table count, RLS-enabled tables, policies, and triggers.

- [ ] **Step 6: Run Playwright**

Run:

```bash
rtk zsh -lc 'cd apps/web && pnpm test:e2e'
```

Expected: all Sprint 0 Playwright tests pass across desktop and mobile projects.

- [ ] **Step 7: Run adversarial AC audit**

Run:

```bash
rtk pnpm audit:sprint0
```

Expected: `Sprint 0 AC audit passed`.

- [ ] **Step 8: Append build evidence**

Append:

```jsonl
{"story":"US-001","event":"build_pass","notes":"type-check + lint + test + build + db verify + Playwright passed for Sprint 0 foundation"}
{"story":"US-006","event":"build_pass","notes":"env-dependent local checks passed without committing secrets"}
{"story":"US-007","event":"build_pass","notes":"App Router shell builds and browser smoke tests pass"}
{"story":"US-008","event":"build_pass","notes":"DB schema verifier passed with table/RLS/policy/trigger assertions"}
{"story":"US-009","event":"build_pass","notes":"Design-system contract tests and lint passed"}
{"story":"US-010","event":"build_pass","notes":"PWA manifest and service worker browser checks passed"}
{"story":"US-011","event":"build_pass","notes":"Auth claim helper, unauth redirect, and shell role tests passed"}
{"story":"US-012","event":"build_pass","notes":"Cron route security tests passed"}
{"story":"US-013","event":"build_pass","notes":"CI workflow mirrors local verification gate"}
{"story":"US-014","event":"build_pass","notes":"Vitest, Playwright, and adversarial audit scripts are active"}
{"story":"US-015","event":"build_pass","notes":"Auth0 SDK login route is mounted and redirects to tenant"}
```

Do not append `done` for external-service stories `US-002`, `US-003`, or `US-005` until real Vercel/Neon/Blob/Sentry/Better Stack evidence exists.

- [ ] **Step 9: Commit final verification record**

```bash
rtk git add .nous-feedback.jsonl docs/stories/STATUS_REPORT.md
rtk git commit -m "chore(sprint0): record foundation verification evidence (US-013 US-014)"
```

---

## Self-Review

**Spec coverage:** This plan covers all Sprint 0 stories from `docs/stories/sprint-0`: scaffold/status (US-001), external infra (US-002/003/005), Auth0 (US-004/015), env (US-006), App Router shell (US-007), DB schema (US-008), design system (US-009), PWA (US-010), auth/RLS seam (US-011), cron (US-012), CI (US-013), and tests/adversarial review (US-014).

**Known external gaps:** Vercel, Neon, Blob, Sentry, and Better Stack cannot be marked done from local repo evidence. The plan records them as blocked until credentials/project URLs are confirmed.

**Testing coverage:** Unit tests cover claim mapping, route security, shell role gating, design-system contract, and DB verifier logic. Playwright covers health, unauth redirects, Auth0 route mounting, manifest, service worker, and mobile shell. The adversarial audit script blocks false `done` events without AC evidence.

**Placeholder scan:** This plan intentionally avoids forbidden placeholder wording in implementation steps. External values are documented as required operator-provided secrets and are never committed.
