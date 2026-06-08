# Package Map — what's live, what's scaffold, and your first delivery

This is a generated Turborepo monorepo. It **builds today** (`pnpm build`), but most
of its surface is an intentional, honestly-tracked scaffold — a Definition-of-Ready
skeleton plus shared libraries. This map tells you what is what, so you can tell a
finished primitive from a seam you are meant to fill.

## Package states

| Package | State | What it is |
|---|---|---|
| `@mi-banquito/db` | **Live** | Drizzle schema + client — the single source of truth for tables/columns. |
| `@mi-banquito/contracts` | Library | drizzle-zod `insert`/`select` schema per table. Import the one your feature validates against (the slice's action does). |
| `@mi-banquito/domain` | Skeleton (DoR) | Typed service interface per bounded context; the operation bodies are dev-team work. The **Ledger** service carries the worked example (live). |
| `@mi-banquito/ui` | Library — 29 rendered + 17 typed-stub (`component-manifest.json`) | Shared component library. Import the atoms/molecules you need; typed-stub organisms get their final layout from the Step-7 mocks. |
| `@mi-banquito/config` | Shared presets | ESLint flat-config preset. |
| `packages/design-system` | Token-asset dir | `tokens.css` / `tokens.json` + the Tailwind preset, consumed by `apps/web` via a relative path. NOT a workspace package — do not `import "@mi-banquito/design-system"`. |
| `apps/web` | **The app** | Your routes, server actions, and route handlers. Holds the worked slice. |

> **Library packages are unconsumed by construction.** `@mi-banquito/contracts` and the
> `@mi-banquito/ui` library start at 0% app-consumption on day one — a feature consumes
> the *specific* schema/component it needs. That is NOT dead code; the worked slice
> below shows the consumption pattern.

## Your first delivery

The generator shipped ONE connected worked example — the **Member** slice — threading
the whole seam `db → contracts → domain → action/read → ui`. Copy it; it is labeled
`TEMPLATE — one shape of many`.

1. **READ (list)** — [`apps/web/src/app/(authenticated)/socias/page.tsx`](../../apps/web/src/app/(authenticated)/socias/page.tsx):
   a `force-dynamic` Server Component that resolves the tenant from the session
   (`auth0.getSession()` → `org_id`, the SECURITY.md pattern), delegates an
   org-scoped list to the `@mi-banquito/domain` service, and renders each row with a
   real `@mi-banquito/ui` component (the **ui render leg** — a presentational atom; a
   Server Component passes no event handlers).
2. **READ (detail, dynamic route)** — `apps/web/src/app/(authenticated)/socias/[id]/page.tsx`:
   the Next 16 async-params shape — `params: Promise<{ id: string }>` + `await
   params` — calling the org-scoped get-by-id method. Copy this signature for every
   `[id]` page (params are a Promise in Next 16; forgetting `await` is a type error).
3. **MUTATION** — `apps/web/src/app/(authenticated)/socias/actions.ts`:
   a server action (`addMember`) validating input with
   `@mi-banquito/contracts` `insertMemberSchema` (orgId injected from the session,
   omitted from the client shape) → the `@mi-banquito/domain` write method.
   The action lives at the **`socias/actions.ts`** route group even though its
   declaring screen is `/socias/nueva` — co-locating server actions at the
   resource group lets both the list page and the create page import them.
4. **DOMAIN** — [`packages/domain/src/ledger.ts`](../../packages/domain/src/ledger.ts):
   the `listMembers` + `getMember` + `createMember` methods the pages and action call,
   consuming `@mi-banquito/db` (every read filters `org_id` — a row id alone never
   crosses tenants).

Build YOUR first feature the same way: pick a screen, pick its entity's table, and
copy the shapes above.


## Which primitive for a screen? (the decision rule)

A cold read of the screens can't tell you which Next.js primitive to reach for. The
rule the slice follows:

- **A list / detail READ** → a **Server Component page**. Add
  `export const dynamic = "force-dynamic"` only when it reads request-time/session
  data (it almost always does — `getSession()` is request-time). See FRONTEND.md.
- **A mutation** (every screen that declares a `server_action:<name>` target) → a
  **server action** (`"use server"`). Validate the input with the `@mi-banquito/contracts`
  insert schema; take the tenant from the session, never the client.
- **A cron job or external webhook** → a **route handler**
  (`apps/web/src/app/api/<resource>/route.ts`).

The screens declare **no REST data endpoints** — reads happen inline in Server
Components and mutations go through server actions, so most features need **no**
route handler. `docs/api-contract-registry.json` is a scaffold for the day a real
external contract appears.
