# Frontend Rules — Detailed Reference

Full reference for the Next.js + TypeScript frontend. See `CLAUDE.md` for the summary.

## Architecture Fundamentals

1. **App Router only** — no `pages/` directory.
2. **Server Components by default** — `"use client"` only when using hooks, events, or browser APIs.
3. **Design tokens from `packages/design-system`** — never hardcode colors, spacing, or fonts.
4. **Client state: Zustand only** — no Redux, no Context for global state.
5. **Form validation: Zod schemas** — shared between client and route handlers.
6. **Each screen answers ONE question** — no multi-purpose dashboards.

## Server Components & data fetching (the silent prerender trap)

A page Server Component is **statically prerendered at build** unless it opts into
dynamic rendering. The trap: a page that fetches per-request data for its initial
render but does NOT read a dynamic API renders **once at build** and ships that
snapshot — **stale/empty data, silently** (no error). The precise rule:

- A page (`page.tsx`) that fetches per-request data (from the db or an API) and does
  NOT call a dynamic API → add `export const dynamic = "force-dynamic";` at the top.
  (Or `export const revalidate = <seconds>` for time-based revalidation.)
- A page that calls `auth0.getSession()` (or otherwise reads cookies/headers) is
  **already dynamic** — `force-dynamic` is redundant there. Do NOT sprinkle it on
  every page; it only matters when you fetch without touching a dynamic API.
- **Route handlers (`route.ts`) and server actions are never prerendered** — this is
  a *page* Server Component concern; the rule does not apply to them.

## Design tokens (Tailwind v4 `@theme`)

Tokens are **Tailwind v4 `@theme` variables in `apps/web/src/styles/tokens.css`**
(imported by `globals.css`). The utility classes resolve from there — use them
(`bg-primary`, `text-surface`, …); never hardcode colors, spacing, or fonts.

- To change a token, edit the `@theme` block in `apps/web/src/styles/tokens.css`.
- `tailwind.config.ts` and any `tailwind-preset.js` are **inert under Tailwind v4**
  (build-proven: removing them yields byte-identical CSS) — editing them does NOT
  change tokens. The canonical token data also ships under `packages/design-system`.

## Screen-to-API Wiring (via TOON `dataSource`)

Every TOON section has a `dataSource` (`url` + `method`). When implementing a screen:

1. Read the screen's TOON JSON under `docs/screens/` (one file per `SCR-NN`).
2. For each section with a `dataSource`, call that endpoint via the shared API client.
3. Replace template variables: `{current_user_id}` → from session; `{:paramId}` → from route params.
4. Wire section `states`: loading → skeleton; error → banner with retry; empty → empty state with CTA.
5. If the route handler doesn't exist yet under `apps/web/src/app/api/`, **create it** — never show mock data.

## Visual Fidelity & `data-testid`

- The TOON specs under `docs/screens/` are the **layout source of truth** — match each section's structure, states, and `dataSource`.
- Any HTML prototype is a **visual reference only** — never copy prototype HTML into the app; never use it as fallback UI.
- Every TOON section/card/action/field MUST have `data-testid` matching the TOON `id`.

## i18n

- Never hardcode user-facing strings in JSX (the `check-hardcoded-string` lint rejects bare text nodes).
- Write Spanish copy for non-financial users first: prefer familiar verbs like
  `registrar`, `guardar`, and `pagar`; avoid internal finance terms such as
  `originar`, `capital disponible`, or unexplained protected-fund language in
  buttons, banners, and validation errors.
- **Client Component** (`"use client"`): use `useLocale()` from `@/lib/i18n/use-locale`.
- **Server Component** (default; `async` pages, anything that `await`s): `useLocale()` is a client hook and CANNOT be called here. Import the messages JSON instead — e.g. `import messages from "@/lib/i18n/<lang>.json"` then read `messages.pages[key]?.title` (the `socias` list + `[id]` detail worked examples show the pattern).
- Locale: `en-US` (single-locale project).
- Mixed-language view = i18n setup is broken.

## Authentication & Role Gating

- `hasMinRole(roles, minRole)` from `@/lib/auth/roles`; hierarchy is `ROLE_HIERARCHY` (generated from the nav-map RBAC).
- The highest role sees all menu items.
- User display name from the Auth0 session — never display a raw id as identity.
- Log out via `logout()` from `@/lib/auth/logout`.

## API Client & Error Handling

- ALL `/api/v1/*` calls use the shared client (`@/lib/api/client`) — it attaches the session token.
- Raw `fetch("/api/v1/...")` in a page/component is a bug — use the shared client.
- Every page MUST have loading, empty, and error states. Silent failures are rejection-level defects.

## Banned Patterns (Rejection-Level Defects)

- **Dev mocks / fake auth** — any `if (devMode)` branch returning a fake session.
- **Hardcoded app state** — `onboardingComplete: true`, preset flags, fixture IDs.
- **Hardcoded redirect strings** — use route constants from `@/lib/routes`.
- **Embedded fixture data** — fetch from the API and show an empty state if unavailable.
- **Copied mock HTML in app code** — mocks are visual references only.
