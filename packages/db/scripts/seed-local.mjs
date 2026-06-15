import { config } from "dotenv";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { main as verifySchema } from "./verify-schema.mjs";

config({ path: ".env.local" });
config({ path: ".env" });

export const LOCAL_ORG_ID = "11111111-1111-4111-8111-111111111111";
const PLATFORM_OPERATOR_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const USER_ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP_ID = "55555555-5555-4555-8555-555555555555";

export async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    return 1;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query(
      `
      INSERT INTO platform_operator (
        id, display_name, email, auth_subject, status, created_at, updated_at
      )
      VALUES (
        $1, 'Local Operator', 'operator@example.local', 'auth0|local-operator', 'active', now(), now()
      )
      ON CONFLICT (id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          email = EXCLUDED.email,
          auth_subject = EXCLUDED.auth_subject,
          status = EXCLUDED.status,
          updated_at = now();
      `,
      [PLATFORM_OPERATOR_ID],
    );

    await pool.query(
      `
      INSERT INTO organization (
        id, display_name, country_code, currency_code, timezone,
        default_language, status, created_at, created_by, created_by_kind,
        updated_at, updated_by, platform_operator_id
      )
      VALUES (
        $1, 'FcoStudios Local Banquito', 'EC', 'USD', 'America/Guayaquil',
        'es-EC', 'active', now(), $2, 'platform_operator', now(), $2, $2
      )
      ON CONFLICT (id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          country_code = EXCLUDED.country_code,
          currency_code = EXCLUDED.currency_code,
          timezone = EXCLUDED.timezone,
          default_language = EXCLUDED.default_language,
          status = EXCLUDED.status,
          updated_at = now(),
          updated_by = EXCLUDED.updated_by,
          platform_operator_id = EXCLUDED.platform_operator_id;
      `,
      [LOCAL_ORG_ID, PLATFORM_OPERATOR_ID],
    );

    await pool.query(
      `
      INSERT INTO member (
        id, org_id, display_name, whatsapp_number, joined_on, role, status,
        auth_subject, initial_savings_balance, notes, created_at, created_by,
        created_by_kind, updated_at, updated_by
      )
      VALUES (
        $1, $2, 'Socia Local', '+593999999999', current_date, 'tesorera', 'activo',
        'auth0|local-treasurer', 0, 'Local seed fixture', now(), $3,
        'platform_operator', now(), $3
      )
      ON CONFLICT (id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          whatsapp_number = EXCLUDED.whatsapp_number,
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          auth_subject = EXCLUDED.auth_subject,
          updated_at = now(),
          updated_by = EXCLUDED.updated_by;
      `,
      [MEMBER_ID, LOCAL_ORG_ID, PLATFORM_OPERATOR_ID],
    );

    await pool.query(
      `
      INSERT INTO user_account (
        id, auth_subject, email, display_name, status, created_at, updated_at
      )
      VALUES (
        $1, 'auth0|local-treasurer', 'tesorera@example.local', 'Socia Local', 'active', now(), now()
      )
      ON CONFLICT (id) DO UPDATE
      SET auth_subject = EXCLUDED.auth_subject,
          email = EXCLUDED.email,
          display_name = EXCLUDED.display_name,
          status = EXCLUDED.status,
          updated_at = now();
      `,
      [USER_ACCOUNT_ID],
    );

    await pool.query(
      `
      INSERT INTO user_org_membership (
        id, user_id, org_id, role, status, member_id, granted_at
      )
      VALUES ($1, $2, $3, 'TESORERA', 'active', $4, now())
      ON CONFLICT (id) DO UPDATE
      SET role = EXCLUDED.role,
          status = EXCLUDED.status,
          member_id = EXCLUDED.member_id;
      `,
      [MEMBERSHIP_ID, USER_ACCOUNT_ID, LOCAL_ORG_ID, MEMBER_ID],
    );
  } catch (err) {
    console.error(`✗ local seed failed: ${err.message}`);
    return 1;
  } finally {
    await pool.end();
  }

  console.log(`seeded local organization ${LOCAL_ORG_ID}`);
  return verifySchema();
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  process.exitCode = await main();
}
