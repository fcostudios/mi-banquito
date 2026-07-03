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

export const REQUIRED_FUNCTIONS = [
  "enforce_period_lock",
  "raise_append_only_violation",
];

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function pgIdentifierName(value) {
  return value.slice(0, 63);
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
  const materializedViewNames = uniqueSorted(
    [...sql.matchAll(/CREATE MATERIALIZED VIEW\s+([a-z_]+)\s+AS/g)].map(
      (match) => match[1]
    )
  );
  const indexNames = uniqueSorted(
    [...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX IF NOT EXISTS\s+([a-z_]+)\s+/g)]
      .map((match) => pgIdentifierName(match[1]))
  );
  const checkConstraintNames = uniqueSorted(
    [...sql.matchAll(/ADD CONSTRAINT\s+([a-z_]+)\s+CHECK\s*\(/g)]
      .map((match) => pgIdentifierName(match[1]))
  );
  const uniqueConstraintNames = uniqueSorted(
    [...sql.matchAll(/CONSTRAINT\s+([a-z_]+)\s+UNIQUE\s*\(/g)]
      .map((match) => pgIdentifierName(match[1]))
  );
  const foreignKeyConstraintNames = uniqueSorted(
    [...sql.matchAll(/ADD CONSTRAINT\s+([a-z_]+)\s+FOREIGN KEY\s*\(/g)]
      .map((match) => pgIdentifierName(match[1]))
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
    materializedViewNames,
    indexNames,
    checkConstraintNames,
    uniqueConstraintNames,
    foreignKeyConstraintNames,
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
export const EXPECTED_MATERIALIZED_VIEW_NAMES = EXPECTED_SCHEMA.materializedViewNames;
export const EXPECTED_INDEX_NAMES = EXPECTED_SCHEMA.indexNames;
export const EXPECTED_CHECK_CONSTRAINT_NAMES = EXPECTED_SCHEMA.checkConstraintNames;
export const EXPECTED_UNIQUE_CONSTRAINT_NAMES = EXPECTED_SCHEMA.uniqueConstraintNames;
export const EXPECTED_FOREIGN_KEY_CONSTRAINT_NAMES = EXPECTED_SCHEMA.foreignKeyConstraintNames;
export const EXPECTED_UPDATED_AT_TABLES = EXPECTED_SCHEMA.updatedAtTables;

export const EXPECTED_TABLES = EXPECTED_TABLE_NAMES.length;
export const EXPECTED_RLS_TABLES = EXPECTED_RLS_TABLE_NAMES.length;
export const EXPECTED_FORCED_RLS_TABLES = EXPECTED_FORCED_RLS_TABLE_NAMES.length;
export const EXPECTED_POLICIES = EXPECTED_POLICY_TABLES.length;
export const EXPECTED_TRIGGERS = EXPECTED_TRIGGER_TABLES.length;
export const EXPECTED_MATERIALIZED_VIEWS = EXPECTED_MATERIALIZED_VIEW_NAMES.length;
export const EXPECTED_INDEXES = EXPECTED_INDEX_NAMES.length;
export const EXPECTED_CHECK_CONSTRAINTS = EXPECTED_CHECK_CONSTRAINT_NAMES.length;
export const EXPECTED_UNIQUE_CONSTRAINTS = EXPECTED_UNIQUE_CONSTRAINT_NAMES.length;
export const EXPECTED_FOREIGN_KEY_CONSTRAINTS = EXPECTED_FOREIGN_KEY_CONSTRAINT_NAMES.length;
export const EXPECTED_UPDATED_AT_TRIGGERS = EXPECTED_UPDATED_AT_TABLES.length;
export const EXPECTED_FUNCTIONS = REQUIRED_FUNCTIONS.length;

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
  assertExpectedObjects({
    label: "materialized views",
    expectedNames: expected.materializedViewNames,
    actualValue: actual.materializedViewNames ?? actual.materializedViewCount,
    errors,
  });
  assertExpectedObjects({
    label: "indexes",
    expectedNames: expected.indexNames,
    actualValue: actual.indexNames ?? actual.indexCount,
    errors,
  });
  assertExpectedObjects({
    label: "check constraints",
    expectedNames: expected.checkConstraintNames,
    actualValue: actual.checkConstraintNames ?? actual.checkConstraintCount,
    errors,
  });
  assertExpectedObjects({
    label: "unique constraints",
    expectedNames: expected.uniqueConstraintNames,
    actualValue: actual.uniqueConstraintNames ?? actual.uniqueConstraintCount,
    errors,
  });
  assertExpectedObjects({
    label: "foreign key constraints",
    expectedNames: expected.foreignKeyConstraintNames,
    actualValue: actual.foreignKeyConstraintNames ?? actual.foreignKeyConstraintCount,
    errors,
  });
  assertExpectedObjects({
    label: "required functions",
    expectedNames: REQUIRED_FUNCTIONS,
    actualValue: actual.functionNames ?? actual.functionCount ?? [],
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
    (SELECT array_agg(c.relname::text ORDER BY c.relname::text)
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'm'),
    ARRAY[]::text[]
  ) AS materialized_view_names,
  COALESCE(
    (SELECT array_agg(indexname::text ORDER BY indexname::text)
       FROM pg_indexes
      WHERE schemaname = 'public'),
    ARRAY[]::text[]
  ) AS index_names,
  COALESCE(
    (SELECT array_agg(conname::text ORDER BY conname::text)
       FROM pg_constraint con
       JOIN pg_namespace n ON n.oid = con.connamespace
      WHERE n.nspname = 'public'
        AND con.contype = 'c'),
    ARRAY[]::text[]
  ) AS check_constraint_names,
  COALESCE(
    (SELECT array_agg(conname::text ORDER BY conname::text)
       FROM pg_constraint con
       JOIN pg_namespace n ON n.oid = con.connamespace
      WHERE n.nspname = 'public'
        AND con.contype = 'u'),
    ARRAY[]::text[]
  ) AS unique_constraint_names,
  COALESCE(
    (SELECT array_agg(conname::text ORDER BY conname::text)
       FROM pg_constraint con
       JOIN pg_namespace n ON n.oid = con.connamespace
      WHERE n.nspname = 'public'
        AND con.contype = 'f'),
    ARRAY[]::text[]
  ) AS foreign_key_constraint_names,
  COALESCE(
    (SELECT array_agg(p.proname::text ORDER BY p.proname::text)
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'),
    ARRAY[]::text[]
  ) AS function_names,
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
    materializedViewNames: parsePgArray(row.materialized_view_names),
    indexNames: parsePgArray(row.index_names),
    checkConstraintNames: parsePgArray(row.check_constraint_names),
    uniqueConstraintNames: parsePgArray(row.unique_constraint_names),
    foreignKeyConstraintNames: parsePgArray(row.foreign_key_constraint_names),
    functionNames: parsePgArray(row.function_names),
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
      `${EXPECTED_MATERIALIZED_VIEWS} materialized views,`,
      `${EXPECTED_INDEXES} indexes,`,
      `${EXPECTED_CHECK_CONSTRAINTS} check constraints,`,
      `${EXPECTED_UNIQUE_CONSTRAINTS} unique constraints,`,
      `${EXPECTED_FOREIGN_KEY_CONSTRAINTS} foreign key constraints,`,
      `${EXPECTED_FUNCTIONS} required functions,`,
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
