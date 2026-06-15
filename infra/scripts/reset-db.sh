#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "=== Resetting local database schema ==="
cd "$ROOT_DIR/packages/db"

if [ ! -f .env.local ] && [ -f .env.example ]; then
  cp .env.example .env.local
  echo "Created packages/db/.env.local from .env.example."
fi

node --input-type=module <<'NODE'
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required in packages/db/.env.local");
  process.exit(1);
}

const parsed = new URL(databaseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
if (!localHosts.has(parsed.hostname) && process.env.CONFIRM_RESET_NON_LOCAL !== "1") {
  console.error(`Refusing to reset non-local database host ${parsed.hostname}.`);
  console.error("Set CONFIRM_RESET_NON_LOCAL=1 only if this is an intentional dev reset.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  await pool.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `);
  console.log("public schema recreated");
} finally {
  await pool.end();
}
NODE

node scripts/apply-local-schema.mjs
node scripts/verify-schema.mjs

echo "Schema reset. Run 'infra/scripts/seed-db.sh' to reseed."
