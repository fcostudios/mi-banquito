# AGENTS.md — Mi Banquito

> Agent coordination rules for AI-assisted multi-agent development.
> This is a **single serverless nextjs app** — no separate backend service.

## Getting Started (read this first)

1. **Onboard:** install + database + the full conventions are in
   [`CLAUDE.md`](CLAUDE.md) (Quick Start). Run `pnpm install`, set
   `DATABASE_URL`, then apply the schema with
   `cd packages/db && pnpm drizzle-kit push && node scripts/verify-schema.mjs`
   (the drizzle config + verifier live with the schema, matching
   DEFINITION_OF_DONE).
2. **Pick work from [`docs/stories/SPRINT_PLAN.md`](docs/stories/SPRINT_PLAN.md)** — the
   sprint-ordered work queue (links to each story spec by sprint). `docs/stories/INDEX.md`
   is a flat catalog, NOT the queue; start from SPRINT_PLAN.
3. **Definition of Done:** a story is done only when
   [`docs/dev-guide/DEFINITION_OF_DONE.md`](docs/dev-guide/DEFINITION_OF_DONE.md) passes —
   `pnpm type-check && pnpm lint && pnpm build`, and `drizzle-kit push` + `verify-schema.mjs`
   apply the schema.
4. **Conventions** (tenant column `org_id`, per-table soft delete, App Router, design tokens)
   live in [`CLAUDE.md`](CLAUDE.md) and `docs/dev-guide/` — follow them verbatim.

## Agent Roles

### App Agent
- **Scope:** `apps/web/`
- **Language:** TypeScript
- **Framework:** nextjs 16 / react
- **Rules:**
  - App Router with Server Components by default; `"use client"` only when needed
  - Import design tokens from `packages/design-system`
  - Use Zustand for client state; validate forms with zod
  - All user-facing strings go in i18n locale files

### API Agent
- **Scope:** `apps/web/src/app/api/`, `packages/db/src/`
- **Rules:**
  - Endpoints are route handlers (`route.ts`); no separate backend service
  - Persist via the shared `drizzle` client; every multi-tenant query filters `org_id` (the generated tenant column — not `tenant_id`); add a soft-delete filter only on a table that declares `deleted_at`
  - Protect handlers with the auth0 session (`auth0.getSession()`)

### Infrastructure Agent
- **Scope:** `infra/`
- **Rules:**
  - Serverless hosting (Vercel) — no containers
  - Shell scripts must be idempotent (`set -euo pipefail`)

### Docs Agent
- **Scope:** `docs/`, `CLAUDE.md`, `AGENTS.md`
- **Rules:**
  - Keep CLAUDE.md in sync with architecture changes
  - Story index must reflect current sprint assignments
  - Decisions must reference their DEC-NNN IDs

## Coordination Rules

1. **No cross-scope changes without discussion.** A new API shape is documented before the UI consumes it.
2. **Shared code lives in `packages/`.** Never duplicate logic between modules.
3. **Migrations are append-only.** Never modify a committed migration under `packages/db/src/migrations/`.
4. **Feature branches follow `feature/<context>/<short-desc>`.** Example: `feature/socias/socia-crud`.
5. **Every PR must reference a story ID** (e.g., US-004).
6. **`pnpm type-check && pnpm lint && pnpm build` must pass** before any PR is merged.

## Sprint Flow

1. **Sprint Planning:** pick stories from `docs/stories/SPRINT_PLAN.md` (the sprint-ordered work queue)
2. **Development:** Agents work on assigned stories within their scope
3. **Integration:** API contracts validated, UI connected
4. **Review:** Cross-agent review for shared boundaries
5. **Demo:** Working feature demonstrated end-to-end

## File References

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project intelligence — architecture, rules, quick start |
| `AGENTS.md` | This file — agent roles and coordination |
| `docs/stories/SPRINT_PLAN.md` | **Work queue** — sprint-ordered stories; start here |
| `docs/stories/INDEX.md` | Flat story catalog (reference, not the queue) |
| `docs/specs/` | ER model, screens, navigation map |
| `docs/decisions/` | Product decision history |
| `Taskfile.yml` | Task runner commands |
| `.env.example` | Required environment variables |

## Communication Protocol

When an agent needs to coordinate with another:

1. **API Contract:** Define the route handler path + shape before implementing
2. **UI Contract:** Define the component props interface before building
3. **Migration Ordering:** Timestamp-slug filenames avoid version conflicts
