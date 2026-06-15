# Local Database Runbook

Sprint 0 local development uses PostgreSQL from Docker plus the committed SQL
migration in `packages/db/src/migrations/`. `drizzle-kit push` is not enough for
this project because RLS policies and trigger substrate live in SQL.

## Local Docker

Use a port that does not conflict with another PostgreSQL container. The default
example uses `5432`; change the host port if your machine already has Postgres
running.

```bash
docker run --name mi-banquito-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=app \
  -p 5432:5432 \
  -d postgres:17
```

Set `packages/db/.env.local`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app
DB_DRIVER=pg
```

## Apply And Verify

From the repo root:

```bash
rtk bash infra/scripts/setup.sh
```

Or from `packages/db`:

```bash
rtk node scripts/apply-local-schema.mjs
rtk node scripts/verify-schema.mjs
```

The verifier checks the committed migration expectations:

- 34 public tables
- RLS enabled on the tenant tables declared by the migration
- policies present for tenant tables
- trigger tables present
- update triggers present for tables with `updated_at`

## Reset

For a local-only reset:

```bash
rtk bash infra/scripts/reset-db.sh
```

The reset script recreates only the `public` schema, reapplies the committed SQL
migration, installs local `updated_at` triggers derived from the current
migration, and runs the verifier.

The reset script refuses non-local hosts by default. To reset a non-local dev
database intentionally, set `CONFIRM_RESET_NON_LOCAL=1`. Do not use that override
for shared, preview, staging, or production databases.

## Troubleshooting

- If `apply-local-schema.mjs` reports a partially applied schema, run
  `infra/scripts/reset-db.sh` against a local Docker database.
- If another PostgreSQL container is already using `5432`, map Docker to another
  host port and update `DATABASE_URL`, for example
  `postgresql://postgres:postgres@localhost:5433/app`.
- If `verify-schema.mjs` fails on RLS or policies, the database was probably
  created with `drizzle-kit push` instead of the committed SQL migration.
