#!/usr/bin/env bash
set -euo pipefail

echo "=== Mi Banquito — Setup ==="

# 1. Install dependencies (pnpm workspace install at root).
#    First run writes pnpm-lock.yaml (repo root); commit it so installs are reproducible
#    (CI can then use `pnpm install --frozen-lockfile`). It is not gitignored.
echo "[1/3] Installing dependencies..."
pnpm install

# 2. Provision the database schema. DATABASE_URL should point at local Docker
#    Postgres for this script. Drizzle push is not enough here: the committed SQL
#    migration carries RLS policies and triggers required by Sprint 0.
echo "[2/3] Provisioning database schema..."
cd packages/db
if [ ! -f .env.local ] && [ -f .env.example ]; then
  cp .env.example .env.local
  echo "  Created .env.local from .env.example (under packages/db)."
fi
if grep -Eq '^DATABASE_URL=.+' .env.local 2>/dev/null; then
  node scripts/apply-local-schema.mjs
  node scripts/verify-schema.mjs
else
  echo "  SKIPPED: set DATABASE_URL in the packages/db .env.local file first"
  echo "  (local Docker Postgres is expected), then re-run."
fi
cd ../..

# 3. Done.
echo "[3/3] Setup complete."
echo "=== Run 'task dev' (or infra/scripts/run-all.sh) to start. ==="
