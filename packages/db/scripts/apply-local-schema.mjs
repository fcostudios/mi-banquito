// apply-local-schema.mjs — apply the full local DB substrate.
//
// Drizzle push is not enough for local development because the committed SQL
// migration carries RLS policies and triggers. This script applies that SQL and
// then installs update timestamp triggers derived from the current migration.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import {
  collectSchemaHealth,
  evaluateSchemaHealth,
  EXPECTED_FORCED_RLS_TABLE_NAMES,
  EXPECTED_POLICY_TABLES,
  EXPECTED_RLS_TABLE_NAMES,
  EXPECTED_TABLE_NAMES,
  EXPECTED_TRIGGER_TABLES,
  EXPECTED_UPDATED_AT_TABLES,
  REQUIRED_FUNCTIONS,
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

const SPRINT_1_ADDITIVE_MIGRATION_URL = new URL(
  "../src/migrations/V20260629021302__sprint_1_foundation_gaps.sql",
  import.meta.url
);
const SPRINT_1_ADDITIVE_TABLES = new Set([
  "base_fund_quota_config",
  "base_fund_quota_payment",
]);

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

function isOnlyMissingSprint1AdditiveSchema(existingHealth) {
  const errors = existingHealth?.errors ?? [];
  if (errors.length === 0) {
    return false;
  }

  let sawSprint1MissingObject = false;
  for (const error of errors) {
    if (
      /^expected \d+ (tables|RLS-enabled tables|forced RLS tables|policies on tables), found \d+$/.test(
        error
      )
    ) {
      continue;
    }

    const missing = /^missing (tables|RLS-enabled tables|forced RLS tables|policies on tables): (.+)$/.exec(
      error
    );
    if (!missing) {
      return false;
    }

    const missingNames = missing[2].split(",").map((name) => name.trim());
    if (
      missingNames.length === 0 ||
      !missingNames.every((name) => SPRINT_1_ADDITIVE_TABLES.has(name))
    ) {
      return false;
    }
    sawSprint1MissingObject = true;
  }

  return sawSprint1MissingObject;
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

function assertSafeIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`unsafe SQL identifier: ${identifier}`);
  }
}

async function installRlsPolicies(pool) {
  const statements = [];

  for (const tableName of EXPECTED_RLS_TABLE_NAMES) {
    assertSafeIdentifier(tableName);
    statements.push(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`);
  }

  for (const tableName of EXPECTED_POLICY_TABLES) {
    assertSafeIdentifier(tableName);
    const policyName = `${tableName}_tenant_isolation`;
    assertSafeIdentifier(policyName);
    statements.push(
      `DROP POLICY IF EXISTS ${policyName} ON ${tableName};`,
      `CREATE POLICY ${policyName} ON ${tableName}
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);`,
    );
  }

  if (statements.length > 0) {
    await pool.query(statements.join("\n"));
  }
}

async function installAppendOnlyTriggers(pool) {
  if (EXPECTED_TRIGGER_TABLES.length === 0) {
    return;
  }

  const statements = [
    `CREATE OR REPLACE FUNCTION raise_append_only_violation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'append_only_violation',
    DETAIL = TG_TABLE_NAME || ' rejects ' || TG_OP;
END;
$$ LANGUAGE plpgsql;`,
  ];

  for (const tableName of EXPECTED_TRIGGER_TABLES) {
    assertSafeIdentifier(tableName);
    statements.push(
      `DROP TRIGGER IF EXISTS ${tableName}_no_mutate ON ${tableName};`,
      `CREATE TRIGGER ${tableName}_no_mutate
  BEFORE UPDATE OR DELETE ON ${tableName}
  FOR EACH ROW
  EXECUTE FUNCTION raise_append_only_violation();`,
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

async function installLocalSubstrate(pool) {
  await installRlsPolicies(pool);
  await forceRls(pool);
  await installAppendOnlyTriggers(pool);
  await installUpdatedAtTriggers(pool);
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
  const hasAllExpectedTables =
    existingHealth &&
    !(existingHealth.errors ?? []).some((error) => error.startsWith(`expected ${EXPECTED_TABLE_NAMES.length} tables`)) &&
    !(existingHealth.errors ?? []).some((error) => error.startsWith("missing tables:"));
  const onlyMissingLocalSubstrate =
    hasAllExpectedTables &&
    existingHealth.errors.length > 0 &&
    existingHealth.errors.every((error) =>
      error.includes("RLS-enabled tables") ||
      error.includes("forced RLS tables") ||
      error.includes("policies on tables") ||
      error.includes("triggers on tables") ||
      error.includes("required functions") ||
      error === `missing required functions: ${REQUIRED_FUNCTIONS.join(", ")}` ||
      error.startsWith("missing updated_at update triggers on:")
    );
  const onlyMissingSprint1AdditiveSchema =
    isOnlyMissingSprint1AdditiveSchema(existingHealth);

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
  if (onlyMissingLocalSubstrate) {
    try {
      await installLocalSubstrate(pool);
      console.log("local RLS, policy, trigger substrate applied");
      return 0;
    } catch (err) {
      console.error(`✗ local substrate apply failed: ${err.message}`);
      return 1;
    } finally {
      await pool.end();
    }
  }
  if (onlyMissingSprint1AdditiveSchema) {
    try {
      const sprint1Sql = readFileSync(SPRINT_1_ADDITIVE_MIGRATION_URL, "utf8");
      await pool.query(sprint1Sql);
      await installLocalSubstrate(pool);
      console.log("local Sprint 1 additive schema applied");
      return 0;
    } catch (err) {
      console.error(`✗ local Sprint 1 additive schema apply failed: ${err.message}`);
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
