import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile(".env.local");
  } catch {
    // beforeAll reports the missing integration configuration.
  }
}

let db: typeof import("@mi-banquito/db")["db"];
let refreshDerivedViews: typeof import("./handler")["refreshDerivedViews"];

const orgId = randomUUID();
const memberId = randomUUID();
const loanId = randomUUID();
const scheduleId = randomUUID();
const actorId = randomUUID();

describe("derived materialized view refresh with Postgres", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for derived view refresh integration tests");
    }
    ({ db } = await import("@mi-banquito/db"));
    ({ refreshDerivedViews } = await import("./handler"));
  });

  afterAll(async () => {
    if (!db) return;

    await db.execute(sql`DELETE FROM loan_schedule WHERE org_id = ${orgId}`);
    await db.execute(sql`DELETE FROM loan WHERE org_id = ${orgId}`);
    await db.execute(sql`DELETE FROM member WHERE org_id = ${orgId}`);
    await db.execute(sql`DELETE FROM organization WHERE id = ${orgId}`);
    await db.execute(sql.raw("REFRESH MATERIALIZED VIEW mv_ar_aging"));
    await db.execute(sql.raw("REFRESH MATERIALIZED VIEW mv_available_capital"));
    await db.execute(sql.raw("REFRESH MATERIALIZED VIEW mv_org_health_snapshot"));
    await db.execute(sql.raw("REFRESH MATERIALIZED VIEW mv_liquidez_proyectada"));
  });

  it("refreshes eligible migration-defined derived views and leaves every view queryable", async () => {
    await refreshDerivedViews();

    const result = await db.execute(sql`
      WITH expected(view_name) AS (
        VALUES
          ('mv_available_capital'),
          ('mv_ar_aging'),
          ('mv_org_health_snapshot'),
          ('mv_liquidez_proyectada')
      )
      SELECT
        expected.view_name,
        materialized_view.oid IS NOT NULL AS is_queryable,
        EXISTS (
          SELECT 1
          FROM pg_index unique_index
          WHERE unique_index.indrelid = materialized_view.oid
            AND unique_index.indisunique
            AND unique_index.indisvalid
            AND unique_index.indisready
            AND unique_index.indpred IS NULL
            AND unique_index.indexprs IS NULL
        ) AS supports_concurrent_refresh
      FROM expected
      LEFT JOIN pg_class materialized_view
        ON materialized_view.relname = expected.view_name
       AND materialized_view.relnamespace = current_schema()::regnamespace
       AND materialized_view.relkind = 'm'
      ORDER BY expected.view_name
    `);
    const rowCounts = await db.execute(sql`
      SELECT
        (SELECT count(*)::integer FROM mv_available_capital) AS available_capital,
        (SELECT count(*)::integer FROM mv_ar_aging) AS ar_aging,
        (SELECT count(*)::integer FROM mv_org_health_snapshot) AS org_health_snapshot,
        (SELECT count(*)::integer FROM mv_liquidez_proyectada) AS projected_liquidity
    `);

    expect(result.rows).toEqual([
      { view_name: "mv_ar_aging", is_queryable: true, supports_concurrent_refresh: false },
      { view_name: "mv_available_capital", is_queryable: true, supports_concurrent_refresh: true },
      { view_name: "mv_liquidez_proyectada", is_queryable: true, supports_concurrent_refresh: true },
      { view_name: "mv_org_health_snapshot", is_queryable: true, supports_concurrent_refresh: true },
    ]);
    expect(rowCounts.rows[0]).toEqual({
      available_capital: expect.any(Number),
      ar_aging: expect.any(Number),
      org_health_snapshot: expect.any(Number),
      projected_liquidity: expect.any(Number),
    });
    expect(Object.values(rowCounts.rows[0]).every((count) => Number(count) >= 0)).toBe(true);
  });

  it("refreshes AR before deriving organization health", async () => {
    await db.execute(sql`
      INSERT INTO organization (
        id, display_name, country_code, currency_code, timezone, default_language,
        status, created_at, created_by, created_by_kind
      ) VALUES (
        ${orgId}, 'Refresh order org', 'EC', 'USD', 'America/Guayaquil', 'es-EC',
        'active', now(), ${actorId}, 'system'
      )
    `);
    await db.execute(sql`
      INSERT INTO member (
        id, org_id, display_name, joined_on, role, status, initial_savings_balance,
        created_at, created_by, created_by_kind
      ) VALUES (
        ${memberId}, ${orgId}, 'Refresh order member', '2000-01-01', 'aportante',
        'activo', 0, now(), ${actorId}, 'member'
      )
    `);
    await db.execute(sql`
      INSERT INTO loan (
        id, org_id, member_id, borrower_kind, borrower_member_id, principal_amount,
        currency_code, rate_value, rate_model, term_periods, grace_periods,
        originated_on, status, group_config_version_at_origination,
        created_at, created_by, created_by_kind
      ) VALUES (
        ${loanId}, ${orgId}, ${memberId}, 'member', ${memberId}, 100,
        'USD', 0, 'declining_balance', 1, 0, '2000-01-01', 'activo', 1,
        now(), ${actorId}, 'member'
      )
    `);
    await db.execute(sql`
      INSERT INTO loan_schedule (
        id, org_id, loan_id, period_index, due_on, principal_due, interest_due,
        status, paid_principal_to_date, paid_interest_to_date, created_at, created_by_kind
      ) VALUES (
        ${scheduleId}, ${orgId}, ${loanId}, 1, '2000-01-02', 100, 0,
        'parcial', 0, 0, now(), 'member'
      )
    `);
    await db.execute(sql.raw("REFRESH MATERIALIZED VIEW mv_ar_aging"));
    await db.execute(sql.raw("REFRESH MATERIALIZED VIEW mv_org_health_snapshot"));

    await db.execute(sql`
      UPDATE loan_schedule
      SET paid_principal_to_date = 40
      WHERE id = ${scheduleId} AND org_id = ${orgId}
    `);

    const staleResult = await db.execute(sql`
      SELECT
        (SELECT amount_due FROM mv_ar_aging WHERE org_id = ${orgId}) AS ar_amount_due,
        (SELECT ar_total FROM mv_org_health_snapshot WHERE org_id = ${orgId}) AS health_ar_total
    `);
    expect(staleResult.rows).toEqual([{ ar_amount_due: "100.0000", health_ar_total: "100.0000" }]);

    await refreshDerivedViews();

    const refreshedResult = await db.execute(sql`
      SELECT
        (SELECT amount_due FROM mv_ar_aging WHERE org_id = ${orgId}) AS ar_amount_due,
        (SELECT ar_total FROM mv_org_health_snapshot WHERE org_id = ${orgId}) AS health_ar_total
    `);
    expect(refreshedResult.rows).toEqual([{ ar_amount_due: "60.0000", health_ar_total: "60.0000" }]);
  });
});
