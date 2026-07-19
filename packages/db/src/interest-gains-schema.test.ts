import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

config({ path: "../../.env.local" });
config({ path: "../../apps/web/.env.local" });

const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;

const migrationUrl = new URL(
  "./migrations/V20260719115010__interest_gains_fiscal_year_view.sql",
  import.meta.url,
);

describe("US-008 fiscal-year interest gains", () => {
  it("preserves the Drizzle consumer contract for the materialized view", () => {
    const view = (
      schema as typeof schema & {
        interestGainsPerFiscalYear?: {
          orgId: { name: string };
          fiscalYear: { name: string };
          interestGains: { name: string };
          currencyCode: { name: string };
          refreshedAt: { name: string };
        };
      }
    ).interestGainsPerFiscalYear;

    expect(view).toBeDefined();
    expect({
      orgId: view?.orgId.name,
      fiscalYear: view?.fiscalYear.name,
      interestGains: view?.interestGains.name,
      currencyCode: view?.currencyCode.name,
      refreshedAt: view?.refreshedAt.name,
    }).toEqual({
      orgId: "org_id",
      fiscalYear: "fiscal_year",
      interestGains: "interest_gains",
      currencyCode: "currency_code",
      refreshedAt: "refreshed_at",
    });
  });

  it("ships the immutable view and unique refresh index migration", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    const migration = readFileSync(migrationUrl, "utf8");

    expect(migration).toContain(
      "CREATE MATERIALIZED VIEW IF NOT EXISTS mv_interest_gains_per_fiscal_year",
    );
    expect(migration).toContain(
      "idx_mv_interest_gains_per_fiscal_year_org_year",
    );
    expect(migration).toContain("WHERE gc.valid_to IS NULL");
    expect(migration).toContain("SUM(ia.interest_amount)::NUMERIC(18, 4)");
  });

  runIfDatabase(
    "groups exact interest by tenant and configurable fiscal-year boundary",
    async () => {
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      const client = await pool.connect();
      const orgA = randomUUID();
      const orgB = randomUUID();
      const memberA = randomUUID();
      const memberB = randomUUID();
      const loanA = randomUUID();
      const loanB = randomUUID();
      const actor = randomUUID();

      try {
        await client.query("BEGIN");
        await client.query(
          `
            INSERT INTO organization (
              id, display_name, country_code, currency_code, timezone,
              default_language, status, created_at, created_by, created_by_kind
            ) VALUES
              ($1, 'Interest A', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', now(), $3, 'system'),
              ($2, 'Interest B', 'EC', 'EUR', 'America/Guayaquil', 'es-EC', 'active', now(), $3, 'system')
          `,
          [orgA, orgB, actor],
        );
        await client.query(
          `
            INSERT INTO group_config (
              org_id, version, valid_from, contribution_cycle_kind,
              contribution_amount, currency_code, loan_rate_model, loan_rate_value,
              loan_rate_period_unit, loan_grace_periods, loan_to_savings_cap_ratio,
              interest_resolution, repayment_split_rule, pays_savings_interest,
              safety_margin_amount, reconciliation_tolerance_amount,
              late_threshold_days, mora_threshold_days,
              fiscal_year_start_month, fiscal_year_start_day,
              config, created_at, created_by, created_by_kind
            ) VALUES
              ($1, 1, '2026-01-01', 'monthly', 20, 'USD', 'declining_balance', 5,
               'monthly', 0, 2, 'daily', 'interest_first', false, 0, 0.01,
               3, 15, 4, 1, '{}', now(), $3, 'member'),
              ($2, 1, '2026-01-01', 'monthly', 20, 'EUR', 'declining_balance', 5,
               'monthly', 0, 2, 'daily', 'interest_first', false, 0, 0.01,
               3, 15, 4, 1, '{}', now(), $3, 'member')
          `,
          [orgA, orgB, actor],
        );
        await client.query(
          `
            INSERT INTO member (
              id, org_id, display_name, joined_on, role, status,
              initial_savings_balance, created_at, created_by, created_by_kind
            ) VALUES
              ($1, $3, 'Member A', '2026-01-01', 'aportante', 'activo', 0, now(), $5, 'member'),
              ($2, $4, 'Member B', '2026-01-01', 'aportante', 'activo', 0, now(), $5, 'member')
          `,
          [memberA, memberB, orgA, orgB, actor],
        );
        await client.query(
          `
            INSERT INTO loan (
              id, org_id, member_id, borrower_kind, borrower_member_id,
              principal_amount, currency_code, rate_value, rate_model,
              term_periods, grace_periods, originated_on, status,
              group_config_version_at_origination, created_at, created_by, created_by_kind
            ) VALUES
              ($1, $3, $5, 'member', $5, 100, 'USD', 5, 'declining_balance', 12, 0, '2026-01-01', 'activo', 1, now(), $7, 'member'),
              ($2, $4, $6, 'member', $6, 100, 'EUR', 5, 'declining_balance', 12, 0, '2026-01-01', 'activo', 1, now(), $7, 'member')
          `,
          [loanA, loanB, orgA, orgB, memberA, memberB, actor],
        );
        await client.query(
          `
            INSERT INTO interest_accrual (
              org_id, loan_id, accrued_on, principal_basis, period_days,
              rate_value, interest_amount, currency_code, recorded_at,
              created_at, created_by_kind
            ) VALUES
              ($1, $3, '2026-03-31', 100, 1, 5, 10, 'EUR', now(), now(), 'system'),
              ($1, $3, '2026-04-01', 100, 1, 5, 20, 'EUR', now(), now(), 'system'),
              ($1, $3, '2026-04-15', 100, 1, 5, 5.5, 'EUR', now(), now(), 'system'),
              ($2, $4, '2026-04-15', 100, 1, 5, 99, 'USD', now(), now(), 'system')
          `,
          [orgA, orgB, loanA, loanB],
        );

        await client.query(
          "REFRESH MATERIALIZED VIEW mv_interest_gains_per_fiscal_year",
        );
        const rows = await client.query(
          `
            SELECT org_id, fiscal_year, interest_gains, currency_code
            FROM mv_interest_gains_per_fiscal_year
            WHERE org_id = ANY($1::uuid[])
            ORDER BY org_id, fiscal_year
          `,
          [[orgA, orgB]],
        );

        expect(rows.rows).toEqual([
          {
            org_id: orgA,
            fiscal_year: 2025,
            interest_gains: "10.0000",
            currency_code: "USD",
          },
          {
            org_id: orgA,
            fiscal_year: 2026,
            interest_gains: "25.5000",
            currency_code: "USD",
          },
          {
            org_id: orgB,
            fiscal_year: 2026,
            interest_gains: "99.0000",
            currency_code: "EUR",
          },
        ]);
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
        await pool.end();
      }
    },
  );
});
