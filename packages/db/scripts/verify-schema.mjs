// verify-schema.mjs — fail loud when the DB substrate is only partially applied.
//
// Drizzle can create tables without the hand-authored SQL substrate this app
// relies on. The verifier derives the expected objects from the committed SQL
// migration, then checks the target database for tables, RLS, policies, and
// triggers.
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const MIGRATIONS_URL = new URL(
  "../src/migrations/",
  import.meta.url
);

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function parsePgArray(value) {
  if (Array.isArray(value)) {
    return uniqueSorted(value.filter((item) => typeof item === "string"));
  }
  if (typeof value !== "string" || value === "{}") {
    return [];
  }
  return uniqueSorted(
    value
      .replace(/^\{|\}$/g, "")
      .split(",")
      .map((item) => item.replace(/^"|"$/g, ""))
      .filter(Boolean)
  );
}

export function parseExpectedSchema(sql) {
  const tableNames = uniqueSorted(
    [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)\s+\(/g)].map(
      (match) => match[1]
    )
  );
  const rlsTableNames = uniqueSorted(
    [...sql.matchAll(/ALTER TABLE\s+([a-z_]+)\s+ENABLE ROW LEVEL SECURITY;/g)]
      .map((match) => match[1])
  );
  const policyTables = uniqueSorted(
    [...sql.matchAll(/CREATE POLICY\s+[a-z_]+\s+ON\s+([a-z_]+)/g)].map(
      (match) => match[1]
    )
  );
  const forcedRlsTableNames = uniqueSorted(
    [...sql.matchAll(/ALTER TABLE\s+([a-z_]+)\s+FORCE ROW LEVEL SECURITY;/g)]
      .map((match) => match[1])
  );
  const triggerTables = uniqueSorted(
    [...sql.matchAll(/CREATE TRIGGER\s+[a-z_]+[\s\S]*?\bON\s+([a-z_]+)/g)]
      .map((match) => match[1])
  );
  const updatedAtTables = uniqueSorted(
    [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)\s+\(([\s\S]*?)\n\);/g)]
      .filter(([, , body]) => /\bupdated_at\b/.test(body))
      .map((match) => match[1])
  );

  return {
    tableNames,
    rlsTableNames,
    forcedRlsTableNames,
    policyTables,
    triggerTables,
    updatedAtTables,
  };
}

export function readMigrationSql() {
  return readdirSync(MIGRATIONS_URL)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => readFileSync(new URL(fileName, MIGRATIONS_URL), "utf8"))
    .join("\n");
}

const migrationSql = readMigrationSql();
export const EXPECTED_SCHEMA = parseExpectedSchema(migrationSql);
export const EXPECTED_TABLE_NAMES = EXPECTED_SCHEMA.tableNames;
export const EXPECTED_RLS_TABLE_NAMES = EXPECTED_SCHEMA.rlsTableNames;
export const EXPECTED_FORCED_RLS_TABLE_NAMES = EXPECTED_SCHEMA.forcedRlsTableNames;
export const EXPECTED_POLICY_TABLES = EXPECTED_SCHEMA.policyTables;
export const EXPECTED_TRIGGER_TABLES = EXPECTED_SCHEMA.triggerTables;
export const EXPECTED_UPDATED_AT_TABLES = EXPECTED_SCHEMA.updatedAtTables;

export const EXPECTED_TABLES = EXPECTED_TABLE_NAMES.length;
export const EXPECTED_RLS_TABLES = EXPECTED_RLS_TABLE_NAMES.length;
export const EXPECTED_FORCED_RLS_TABLES = EXPECTED_FORCED_RLS_TABLE_NAMES.length;
export const EXPECTED_POLICIES = EXPECTED_POLICY_TABLES.length;
export const EXPECTED_TRIGGERS = EXPECTED_TRIGGER_TABLES.length;
export const EXPECTED_UPDATED_AT_TRIGGERS = EXPECTED_UPDATED_AT_TABLES.length;

function normalizedList(value) {
  if (typeof value === "number") {
    return { count: value, names: [] };
  }
  const names = uniqueSorted(Array.isArray(value) ? value : []);
  return { count: names.length, names };
}

function describeMissing(expected, actual) {
  const actualSet = new Set(actual);
  return expected.filter((name) => !actualSet.has(name));
}

function assertExpectedObjects({
  label,
  expectedNames,
  actualValue,
  errors,
}) {
  const actual = normalizedList(actualValue);
  if (actual.count < expectedNames.length) {
    errors.push(
      `expected ${expectedNames.length} ${label}, found ${actual.count}`
    );
  }
  if (actual.names.length > 0) {
    const missing = describeMissing(expectedNames, actual.names);
    if (missing.length > 0) {
      errors.push(`missing ${label}: ${missing.join(", ")}`);
    }
  }
}

export function evaluateSchemaHealth(actual, expected = EXPECTED_SCHEMA) {
  const errors = [];

  assertExpectedObjects({
    label: "tables",
    expectedNames: expected.tableNames,
    actualValue: actual.tableNames ?? actual.tableCount,
    errors,
  });
  assertExpectedObjects({
    label: "RLS-enabled tables",
    expectedNames: expected.rlsTableNames,
    actualValue: actual.rlsTableNames ?? actual.rlsTableCount,
    errors,
  });
  assertExpectedObjects({
    label: "forced RLS tables",
    expectedNames: expected.forcedRlsTableNames,
    actualValue: actual.forcedRlsTableNames ?? actual.forcedRlsTableCount,
    errors,
  });
  assertExpectedObjects({
    label: "policies on tables",
    expectedNames: expected.policyTables,
    actualValue: actual.policyTables ?? actual.policyCount,
    errors,
  });
  assertExpectedObjects({
    label: "triggers on tables",
    expectedNames: expected.triggerTables,
    actualValue: actual.triggerTables ?? actual.triggerCount,
    errors,
  });

  const updatedAtTables = normalizedList(
    actual.updatedAtTables ?? expected.updatedAtTables
  ).names;
  const updatedAtTriggerTables = normalizedList(
    actual.updatedAtTriggerTables ?? actual.updatedAtTriggerCount
  ).names;
  const missingUpdatedAtTriggers = describeMissing(
    updatedAtTables,
    updatedAtTriggerTables
  );
  if (missingUpdatedAtTriggers.length > 0) {
    errors.push(
      `missing updated_at update triggers on: ${missingUpdatedAtTriggers.join(", ")}`
    );
  }

  return { ok: errors.length === 0, errors };
}

function loadEnv() {
  const paths = [
    new URL("../../../.env", import.meta.url),
    new URL("../../../.env.local", import.meta.url),
    new URL("../.env", import.meta.url),
    new URL("../.env.local", import.meta.url),
    new URL("../../../apps/web/.env", import.meta.url),
    new URL("../../../apps/web/.env.local", import.meta.url),
  ];

  for (const path of paths) {
    config({ path: fileURLToPath(path), override: true });
  }
}

const HEALTH_SQL = `
SELECT
  COALESCE(
    (SELECT array_agg(table_name::text ORDER BY table_name::text)
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'),
    ARRAY[]::text[]
  ) AS table_names,
  COALESCE(
    (SELECT array_agg(c.relname::text ORDER BY c.relname::text)
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relrowsecurity),
    ARRAY[]::text[]
  ) AS rls_table_names,
  COALESCE(
    (SELECT array_agg(c.relname::text ORDER BY c.relname::text)
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relforcerowsecurity),
    ARRAY[]::text[]
  ) AS forced_rls_table_names,
  COALESCE(
    (SELECT array_agg(DISTINCT tablename::text ORDER BY tablename::text)
       FROM pg_policies
      WHERE schemaname = 'public'),
    ARRAY[]::text[]
  ) AS policy_tables,
  COALESCE(
    (SELECT array_agg(DISTINCT event_object_table::text ORDER BY event_object_table::text)
       FROM information_schema.triggers
      WHERE trigger_schema = 'public'),
    ARRAY[]::text[]
  ) AS trigger_tables,
  COALESCE(
    (SELECT array_agg(table_name::text ORDER BY table_name::text)
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'updated_at'),
    ARRAY[]::text[]
  ) AS updated_at_tables,
  COALESCE(
    (SELECT array_agg(DISTINCT t.event_object_table::text ORDER BY t.event_object_table::text)
       FROM information_schema.triggers t
       JOIN information_schema.columns c
         ON c.table_schema = t.event_object_schema
        AND c.table_name = t.event_object_table
        AND c.column_name = 'updated_at'
      WHERE t.trigger_schema = 'public'
        AND t.event_manipulation = 'UPDATE'),
    ARRAY[]::text[]
  ) AS updated_at_trigger_tables
`;

export async function collectSchemaHealth(databaseUrl, driver) {
  const useNeon =
    driver === "neon" ||
    (driver !== "pg" && /neon|vercel/i.test(databaseUrl));

  if (useNeon) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(databaseUrl);
    const [row] = await sql(HEALTH_SQL);
    return normalizeHealthRow(row);
  }

  const pg = await import("pg");
  const pool = new pg.default.Pool({ connectionString: databaseUrl });
  try {
    const { rows } = await pool.query(HEALTH_SQL);
    return normalizeHealthRow(rows[0]);
  } finally {
    await pool.end();
  }
}

function normalizeHealthRow(row = {}) {
  return {
    tableNames: parsePgArray(row.table_names),
    rlsTableNames: parsePgArray(row.rls_table_names),
    forcedRlsTableNames: parsePgArray(row.forced_rls_table_names),
    policyTables: parsePgArray(row.policy_tables),
    triggerTables: parsePgArray(row.trigger_tables),
    updatedAtTables: parsePgArray(row.updated_at_tables),
    updatedAtTriggerTables: parsePgArray(row.updated_at_trigger_tables),
  };
}

export async function main() {
  loadEnv();

  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    console.error("✗ migrate verify: DATABASE_URL is not set.");
    return 1;
  }

  let actual;
  try {
    actual = await collectSchemaHealth(url, process.env.DB_DRIVER);
  } catch (err) {
    console.error(
      `✗ migrate verify: could not query the database after schema apply — ${err.message}`
    );
    return 1;
  }

  const result = evaluateSchemaHealth(actual);
  if (!result.ok) {
    console.error("✗ migrate verify: database schema substrate is incomplete.");
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    return 1;
  }

  console.log(
    [
      "✓ migrate verify:",
      `${EXPECTED_TABLES} tables,`,
      `${EXPECTED_RLS_TABLES} RLS tables,`,
      `${EXPECTED_FORCED_RLS_TABLES} forced RLS tables,`,
      `${EXPECTED_POLICIES} policy tables,`,
      `${EXPECTED_TRIGGERS} trigger tables,`,
      `${EXPECTED_UPDATED_AT_TRIGGERS} updated_at trigger tables`,
      "verified.",
    ].join(" ")
  );
  return 0;
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  process.exitCode = await main();
}
