// apply-local-schema.mjs — apply the full local DB substrate.
//
// Drizzle push is not enough for local development because the committed SQL
// migration carries RLS policies and triggers. This script applies that SQL and
// then installs update timestamp triggers derived from the current migration.
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import {
  collectSchemaHealth,
  collectSchemaHealthWithClient,
  evaluateSchemaHealth,
  EXPECTED_FORCED_RLS_TABLE_NAMES,
  EXPECTED_POLICY_TABLES,
  EXPECTED_RLS_TABLE_NAMES,
  EXPECTED_TABLE_NAMES,
  EXPECTED_TRIGGER_TABLES,
  EXPECTED_UPDATED_AT_TABLES,
  REQUIRED_FUNCTIONS,
  parseExpectedSchema,
  readMigrationSql,
} from "./verify-schema.mjs";

const explicitDatabaseUrl = process.env.DATABASE_URL;
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
if (explicitDatabaseUrl) process.env.DATABASE_URL = explicitDatabaseUrl;

const SPRINT_1_ADDITIVE_MIGRATION_URL = new URL(
  "../src/migrations/V20260629021302__sprint_1_foundation_gaps.sql",
  import.meta.url
);
const ADMIN_AUDIT_READER_MIGRATION_URL = new URL(
  "../src/migrations/V20260713013500__operator_audit_reader_timestamptz.sql",
  import.meta.url
);
const ADMIN_AUDIT_CAPABILITY_MIGRATION_URL = new URL(
  "../src/migrations/V20260713020100__operator_audit_capability_role.sql",
  import.meta.url
);
const BASE_FUND_QUOTA_SLIP_KIND_MIGRATION_URL = new URL(
  "../src/migrations/V20260718133600__base_fund_quota_slip_kind.sql",
  import.meta.url
);
const US_008_INTEREST_GAINS_MIGRATION_URL = new URL(
  "../src/migrations/V20260719115010__interest_gains_fiscal_year_view.sql",
  import.meta.url
);
const US_008_FAIL_CLOSED_RLS_MIGRATION_URL = new URL(
  "../src/migrations/V20260719115020__fail_closed_tenant_policies.sql",
  import.meta.url
);
const MIGRATIONS_URL = new URL("../src/migrations/", import.meta.url);
const SPRINT_9_FIRST_MIGRATION =
  "V20260721125900__extraordinary_collection_upgrade_preflight.sql";
const SPRINT_9_UPGRADE_MIGRATION_URLS = [
  "V20260721125900__extraordinary_collection_upgrade_preflight.sql",
  "V20260721130000__extraordinary_collection_lifecycle.sql",
  "V20260721133000__extraordinary_collection_guard_fixes.sql",
  "V20260721133500__extraordinary_collection_financial_bindings.sql",
  "V20260721134000__collection_tenant_finite_money.sql",
  "V20260721135000__collection_line_open_guard.sql",
  "V20260721135500__collection_regularization_reversal_guards.sql",
  "V20260721135600__regularization_live_source_guards.sql",
  "V20260721135700__collection_payout_replay_correction.sql",
  "V20260721135800__collection_payout_account_required.sql",
  "V20260721135900__unique_active_treasurer.sql",
  "V20260721140000__sprint9_balance_projections.sql",
  "V20260721140100__ledger_reversal_and_collection_binding_guards.sql",
  "V20260721140200__retained_collection_reclassification.sql",
  "V20260721140300__retained_payout_effective_date_binding.sql",
  "V20260721140400__collection_terminal_chronology_and_audit_index.sql",
  "V20260721140500__retained_client_request_uniqueness_fence.sql",
  "V20260721140600__retained_all_command_client_fence.sql",
].map((fileName) => new URL(`../src/migrations/${fileName}`, import.meta.url));
const PRE_SPRINT_9_EXPECTED_SCHEMA = parseExpectedSchema(
  readdirSync(MIGRATIONS_URL)
    .filter(
      (fileName) =>
        fileName.endsWith(".sql") && fileName < SPRINT_9_FIRST_MIGRATION
    )
    .sort()
    .map((fileName) => readFileSync(new URL(fileName, MIGRATIONS_URL), "utf8"))
    .join("\n")
);
const SPRINT_1_ADDITIVE_TABLES = new Set([
  "base_fund_quota_config",
  "base_fund_quota_payment",
]);
const US_008_REPAIR_OBJECTS = {
  "materialized views": new Set(["mv_interest_gains_per_fiscal_year"]),
  indexes: new Set(["idx_mv_interest_gains_per_fiscal_year_org_year"]),
  "fail-closed policies on tables": new Set(EXPECTED_POLICY_TABLES),
};

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

export function isOnlyMissingUs008Repair(existingHealth) {
  const errors = existingHealth?.errors ?? [];
  if (errors.length === 0) {
    return false;
  }

  let sawRepairableGap = false;
  for (const error of errors) {
    const countError = /^expected \d+ (materialized views|indexes|fail-closed policies on tables), found \d+$/.exec(
      error,
    );
    if (countError) {
      sawRepairableGap = true;
      continue;
    }

    const missingError = /^missing (materialized views|indexes|fail-closed policies on tables): (.+)$/.exec(
      error,
    );
    if (!missingError) {
      return false;
    }

    const allowedNames = US_008_REPAIR_OBJECTS[missingError[1]];
    const missingNames = missingError[2]
      .split(",")
      .map((name) => name.trim());
    if (
      missingNames.length === 0 ||
      !missingNames.every((name) => allowedNames.has(name))
    ) {
      return false;
    }
    sawRepairableGap = true;
  }

  return sawRepairableGap;
}

export function isSprint9UpgradeState({
  preSprint9HealthOk,
  headHealthOk,
  hasCollectionTable,
  hasRecognitionFiscalYear,
  hasDispositionEnum,
  hasTerminalAuditIndex,
}) {
  return Boolean(
    preSprint9HealthOk &&
      !headHealthOk &&
      hasCollectionTable &&
      !hasRecognitionFiscalYear &&
      !hasDispositionEnum &&
      !hasTerminalAuditIndex
  );
}

export function isSprint9PartialState({
  preSprint9HealthOk,
  headHealthOk,
  hasRecognitionFiscalYear,
  hasDispositionEnum,
  hasTerminalAuditIndex,
}) {
  return Boolean(
    preSprint9HealthOk &&
      !headHealthOk &&
      (hasRecognitionFiscalYear || hasDispositionEnum || hasTerminalAuditIndex)
  );
}

async function readSprint9UpgradeState(pool) {
  const result = await pool.query(`
SELECT
  to_regclass('public.extraordinary_collection') IS NOT NULL AS has_collection_table,
  EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'extraordinary_collection_disposition_enum'
  ) AS has_disposition_enum,
  to_regclass('public.idx_audit_collection_terminal_lookup') IS NOT NULL AS has_terminal_audit_index,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'extraordinary_collection'
      AND column_name = 'recognition_fiscal_year'
  ) AS has_recognition_fiscal_year
`);
  return {
    hasCollectionTable: result.rows[0]?.has_collection_table === true,
    hasRecognitionFiscalYear:
      result.rows[0]?.has_recognition_fiscal_year === true,
    hasDispositionEnum: result.rows[0]?.has_disposition_enum === true,
    hasTerminalAuditIndex: result.rows[0]?.has_terminal_audit_index === true,
  };
}

async function currentSchemaHealth(databaseUrl, expectedSchema) {
  try {
    const actual = await collectSchemaHealth(databaseUrl, process.env.DB_DRIVER);
    return evaluateSchemaHealth(actual, expectedSchema);
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
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);`,
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

async function applyBaseFundQuotaSlipKind(pool) {
  const result = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'slip_photo_attached_to_kind_enum') AS exists"
  );
  if (!result.rows[0]?.exists) {
    return;
  }

  await pool.query(readFileSync(BASE_FUND_QUOTA_SLIP_KIND_MIGRATION_URL, "utf8"));
}

async function installLocalSubstrate(pool) {
  await installRlsPolicies(pool);
  await forceRls(pool);
  await installAppendOnlyTriggers(pool);
  await installUpdatedAtTriggers(pool);
  await pool.query(readFileSync(ADMIN_AUDIT_READER_MIGRATION_URL, "utf8"));
  await pool.query(readFileSync(ADMIN_AUDIT_CAPABILITY_MIGRATION_URL, "utf8"));
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
  const preSprint9Health = await currentSchemaHealth(
    databaseUrl,
    PRE_SPRINT_9_EXPECTED_SCHEMA
  );
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await applyBaseFundQuotaSlipKind(pool);
  } catch (err) {
    console.error(`✗ local additive migration apply failed: ${err.message}`);
    await pool.end();
    return 1;
  }
  let sprint9UpgradeState;
  try {
    sprint9UpgradeState = await readSprint9UpgradeState(pool);
  } catch (err) {
    console.error(`✗ local Sprint 9 upgrade detection failed: ${err.message}`);
    await pool.end();
    return 1;
  }
  if (isSprint9UpgradeState({
    ...sprint9UpgradeState,
    preSprint9HealthOk: preSprint9Health?.ok === true,
    headHealthOk: existingHealth?.ok === true,
  })) {
    const client = await pool.connect();
    try {
      const sql = SPRINT_9_UPGRADE_MIGRATION_URLS
        .map((migrationUrl) => readFileSync(migrationUrl, "utf8"))
        .join("\n");
      await client.query("BEGIN");
      await client.query(sql);
      const repairedActual = await collectSchemaHealthWithClient(client);
      const repairedHealth = evaluateSchemaHealth(repairedActual);
      if (!repairedHealth?.ok) {
        throw new Error(
          repairedHealth?.errors.join("; ") ?? "health unavailable"
        );
      }
      await client.query("COMMIT");
      console.log("local Sprint 9 additive schema upgrade applied");
      return 0;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`✗ local Sprint 9 schema upgrade failed: ${err.message}`);
      return 1;
    } finally {
      client.release();
      await pool.end();
    }
  }
  if (existingHealth?.ok) {
    try {
      await installRlsPolicies(pool);
      await forceRls(pool);
      await pool.query(readFileSync(ADMIN_AUDIT_CAPABILITY_MIGRATION_URL, "utf8"));
      console.log("local schema already verified; fail-closed RLS policies and operator audit ACL reconciled");
      return 0;
    } catch (err) {
      console.error(`✗ local RLS policy reconcile failed: ${err.message}`);
      return 1;
    } finally {
      await pool.end();
    }
  }

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
  const onlyMissingUs008Repair = isOnlyMissingUs008Repair(existingHealth);

  if (onlyMissingUs008Repair) {
    try {
      await pool.query(
        readFileSync(US_008_INTEREST_GAINS_MIGRATION_URL, "utf8"),
      );
      await pool.query(
        readFileSync(US_008_FAIL_CLOSED_RLS_MIGRATION_URL, "utf8"),
      );
      const repairedHealth = await currentSchemaHealth(databaseUrl);
      if (!repairedHealth?.ok) {
        throw new Error(repairedHealth?.errors.join("; ") ?? "health unavailable");
      }
      console.log("local US-008 interest view and fail-closed RLS repaired");
      return 0;
    } catch (err) {
      console.error(`✗ local US-008 schema repair failed: ${err.message}`);
      return 1;
    } finally {
      await pool.end();
    }
  }

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

  if (isSprint9PartialState({
    ...sprint9UpgradeState,
    preSprint9HealthOk: preSprint9Health?.ok === true,
    headHealthOk: existingHealth?.ok === true,
  })) {
    console.error(
      "✗ local Sprint 9 schema upgrade refused: partial Sprint 9 objects detected"
    );
    await pool.end();
    return 1;
  }

  const sql = readMigrationSql();
  try {
    await pool.query(sql);
    await applyBaseFundQuotaSlipKind(pool);
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
