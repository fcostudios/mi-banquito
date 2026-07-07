import { config } from "dotenv";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

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

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const auth0OrgId = requireEnv("AUTH0_ORGANIZATION");
  const dbOrgId = requireEnv("AUTH0_ORGANIZATION_DB_ORG_ID");

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query(
      `
      UPDATE organization
      SET auth0_org_id = $1,
          updated_at = now()
      WHERE id = $2
        AND (auth0_org_id IS NULL OR auth0_org_id <> $1)
      RETURNING id, display_name, auth0_org_id;
      `,
      [auth0OrgId, dbOrgId],
    );

    if (result.rowCount === 0) {
      const existing = await pool.query(
        "SELECT id, display_name, auth0_org_id FROM organization WHERE id = $1",
        [dbOrgId],
      );
      if (existing.rowCount === 0) {
        throw new Error(`organization ${dbOrgId} was not found`);
      }
      console.log(JSON.stringify({ updated: false, organization: existing.rows[0] }));
      return 0;
    }

    console.log(JSON.stringify({ updated: true, organization: result.rows[0] }));
    return 0;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
