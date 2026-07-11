import { sql } from "drizzle-orm";

import { withTenantTransaction } from "@mi-banquito/db/tenant";
import { liquidityNarrative, type HypotheticalLoanTerms, type LiquidityPoint } from "./liquidity-client";

export { applyHypotheticalLoan, liquidityNarrative, type HypotheticalLoanTerms, type LiquidityPoint } from "./liquidity-client";

const DEFAULT_HYPOTHETICAL_LOAN_TERM_PERIODS = 10;

export type LiquidityProjection = {
  availableCapital: string;
  poolBalance: string;
  baseFundPool: string;
  commitment: string;
  hypotheticalLoanTerms: Required<HypotheticalLoanTerms>;
  series: LiquidityPoint[];
  narrative: string;
};

export interface LiquidityService {
  readonly context: "liquidity";
  getProjection(orgId: string): Promise<LiquidityProjection>;
}

type LiveLiquidityRow = {
  monthOn: string | Date;
  projectedBalance: string;
  poolBalance: string;
  baseFundPool: string;
  availableCapital: string;
  loanRateValue: string;
};

function dateColumnToString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export function createLiquidityService(): LiquidityService {
  return {
    context: "liquidity",
    async getProjection(orgId) {
      const rows = await withTenantTransaction(orgId, async (tx) => {
        const result = await tx.execute<LiveLiquidityRow>(sql`
          WITH movement_pool AS (
            SELECT COALESCE(SUM(delta), 0)::numeric(18, 4) AS pool_balance
            FROM (
              SELECT amount AS delta FROM contribution WHERE org_id = ${orgId}
              UNION ALL
              SELECT amount AS delta FROM repayment WHERE org_id = ${orgId} AND reverses_id IS NULL
              UNION ALL
              SELECT -amount AS delta FROM withdrawal WHERE org_id = ${orgId} AND reverses_id IS NULL
              UNION ALL
              SELECT -amount AS delta FROM expense
                WHERE org_id = ${orgId} AND status = 'paid' AND reverses_id IS NULL
              UNION ALL
              SELECT -amount AS delta FROM loan_disbursement WHERE org_id = ${orgId}
            ) tenant_movement_delta
          ),
          latest_base_fund AS (
            SELECT COALESCE(SUM(amount), 0)::numeric(18, 4) AS base_fund_pool
            FROM base_fund_quota_payment
            WHERE org_id = ${orgId}
              AND fiscal_year = (
                SELECT MAX(fiscal_year) FROM base_fund_quota_payment WHERE org_id = ${orgId}
              )
          ),
          current_config AS (
            SELECT loan_rate_value
            FROM group_config
            WHERE org_id = ${orgId} AND valid_to IS NULL
            ORDER BY version DESC
            LIMIT 1
          ),
          projected_months AS (
            SELECT (date_trunc('month', CURRENT_DATE)::date + (month_offset.n || ' months')::interval)::date AS month_on
            FROM generate_series(0, 11) AS month_offset(n)
          ),
          scheduled_collections AS (
            SELECT GREATEST(date_trunc('month', schedule.due_on)::date, date_trunc('month', CURRENT_DATE)::date) AS month_on,
              COALESCE(SUM(
                GREATEST(0, schedule.principal_due - schedule.paid_principal_to_date)
                + GREATEST(0, schedule.interest_due - schedule.paid_interest_to_date)
              ), 0)::numeric(18, 4) AS amount
            FROM loan_schedule schedule
            JOIN loan ON loan.org_id = ${orgId} AND loan.id = schedule.loan_id
            WHERE schedule.org_id = ${orgId}
              AND loan.status IN ('originated', 'activo', 'en_mora')
              AND schedule.status <> 'pagado'
            GROUP BY GREATEST(date_trunc('month', schedule.due_on)::date, date_trunc('month', CURRENT_DATE)::date)
          )
          SELECT months.month_on AS "monthOn",
            (pool.pool_balance + COALESCE((
              SELECT SUM(collection.amount) FROM scheduled_collections collection
              WHERE collection.month_on <= months.month_on
            ), 0))::numeric(18, 4) AS "projectedBalance",
            pool.pool_balance AS "poolBalance",
            base.base_fund_pool AS "baseFundPool",
            (pool.pool_balance - base.base_fund_pool)::numeric(18, 4) AS "availableCapital",
            COALESCE(config.loan_rate_value, 0)::numeric(8, 4) AS "loanRateValue"
          FROM projected_months months
          CROSS JOIN movement_pool pool
          CROSS JOIN latest_base_fund base
          LEFT JOIN current_config config ON true
          ORDER BY months.month_on
        `);
        return Array.isArray(result) ? result : result.rows ?? [];
      });
      const first = rows[0];
      const series = rows.map((row) => ({
        monthOn: dateColumnToString(row.monthOn),
        projectedBalance: String(row.projectedBalance),
      }));
      const commitment = String(first?.baseFundPool ?? "0.0000");

      return {
        availableCapital: String(first?.availableCapital ?? "0.0000"),
        poolBalance: String(first?.poolBalance ?? "0.0000"),
        baseFundPool: commitment,
        commitment,
        hypotheticalLoanTerms: {
          rateValue: String(first?.loanRateValue ?? "0.0000"),
          termPeriods: DEFAULT_HYPOTHETICAL_LOAN_TERM_PERIODS,
        },
        series,
        narrative: liquidityNarrative({ series, commitment }),
      };
    },
  };
}
