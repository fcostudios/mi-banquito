import { loadEnvFile } from "node:process";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile(".env.local");
  } catch {
    // beforeAll reports the missing integration configuration.
  }
}

let db: typeof import("@mi-banquito/db")["db"];
let refreshDerivedViews: typeof import("./handler")["refreshDerivedViews"];

describe("derived materialized view refresh with Postgres", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for derived view refresh integration tests");
    }
    ({ db } = await import("@mi-banquito/db"));
    ({ refreshDerivedViews } = await import("./handler"));
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
});
