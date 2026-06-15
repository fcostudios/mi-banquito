// apply-local-schema.mjs — apply the full local DB substrate.
//
// Drizzle push is not enough for local development because the committed SQL
// migration carries RLS policies and triggers. This script applies that SQL and
// then installs update timestamp triggers derived from the current migration.
import { config } from "dotenv";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import {
  collectSchemaHealth,
  evaluateSchemaHealth,
  EXPECTED_FORCED_RLS_TABLE_NAMES,
  EXPECTED_UPDATED_AT_TABLES,
  readMigrationSql,
} from "./verify-schema.mjs";

for (const path of [
  new URL("../../../.env", import.meta.url),
  new URL("../../../.env.local", import.meta.url),
  new URL("../.env", import.meta.url),
  new URL("../.env.local", import.meta.url),
  new URL("../../../apps/web/.env", import.meta.url),
  new URL("../../../apps/web/.env.local", import.meta.url),
]) {
  config({ path: fileURLToPath(path), override: true });
}

function assertLocalDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
  if (localHosts.has(parsed.hostname)) {
    return;
  }
  if (process.env.ALLOW_NON_LOCAL_SCHEMA_APPLY === "1") {
    return;
  }
  throw new Error(
    `refusing to apply local schema to non-local host ${parsed.hostname}; set ALLOW_NON_LOCAL_SCHEMA_APPLY=1 to override`
  );
}

async function currentSchemaHealth(databaseUrl) {
  try {
    const actual = await collectSchemaHealth(databaseUrl, process.env.DB_DRIVER);
    return evaluateSchemaHealth(actual);
  } catch {
    return null;
  }
}

async function installUpdatedAtTriggers(pool) {
  if (EXPECTED_UPDATED_AT_TABLES.length === 0) {
    return;
  }

  const statements = [
    `CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;`,
  ];

  for (const tableName of EXPECTED_UPDATED_AT_TABLES) {
    statements.push(
      `DROP TRIGGER IF EXISTS ${tableName}_set_updated_at ON ${tableName};`,
      `CREATE TRIGGER ${tableName}_set_updated_at
  BEFORE UPDATE ON ${tableName}
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();`
    );
  }

  await pool.query(statements.join("\n"));
}

async function forceRls(pool) {
  if (EXPECTED_FORCED_RLS_TABLE_NAMES.length === 0) {
    return;
  }

  await pool.query(
    EXPECTED_FORCED_RLS_TABLE_NAMES
      .map((tableName) => `ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;`)
      .join("\n"),
  );
}

export async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    return 1;
  }

  try {
    assertLocalDatabaseUrl(databaseUrl);
  } catch (err) {
    console.error(`✗ local schema apply: ${err.message}`);
    return 1;
  }

  const existingHealth = await currentSchemaHealth(databaseUrl);
  if (existingHealth?.ok) {
    console.log("local schema already verified");
    return 0;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const onlyMissingUpdatedAtTriggers =
    existingHealth?.errors.length === 1 &&
    existingHealth.errors[0].startsWith("missing updated_at update triggers on:");
  const onlyMissingForcedRls =
    existingHealth?.errors.length > 0 &&
    existingHealth.errors.every((error) => error.includes("forced RLS tables"));

  if (onlyMissingUpdatedAtTriggers) {
    try {
      await installUpdatedAtTriggers(pool);
      console.log("local updated_at triggers applied");
      return 0;
    } catch (err) {
      console.error(`✗ local updated_at trigger apply failed: ${err.message}`);
      return 1;
    } finally {
      await pool.end();
    }
  }
  if (onlyMissingForcedRls) {
    try {
      await forceRls(pool);
      console.log("local forced RLS applied");
      return 0;
    } catch (err) {
      console.error(`✗ local forced RLS apply failed: ${err.message}`);
      return 1;
    } finally {
      await pool.end();
    }
  }

  const sql = readMigrationSql();
  try {
    await pool.query(sql);
    await installUpdatedAtTriggers(pool);
    console.log("local SQL migration applied");
    return 0;
  } catch (err) {
    console.error(`✗ local schema apply failed: ${err.message}`);
    console.error(
      "  If the public schema is partially applied, run infra/scripts/reset-db.sh against a local DB."
    );
    return 1;
  } finally {
    await pool.end();
  }
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  process.exitCode = await main();
}
