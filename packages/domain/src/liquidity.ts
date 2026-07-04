import { asc, eq } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import { availableCapital, projectedLiquidity } from "@mi-banquito/db/schema";
import { liquidityNarrative, type LiquidityPoint } from "./liquidity-client";

export { applyHypotheticalLoan, liquidityNarrative, type LiquidityPoint } from "./liquidity-client";

export type LiquidityProjection = {
  availableCapital: string;
  poolBalance: string;
  baseFundPool: string;
  commitment: string;
  series: LiquidityPoint[];
  narrative: string;
};

export interface LiquidityService {
  readonly context: "liquidity";
  getProjection(orgId: string): Promise<LiquidityProjection>;
}

function dateColumnToString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export function createLiquidityService(): LiquidityService {
  return {
    context: "liquidity",
    async getProjection(orgId) {
      const [capital] = await db.select().from(availableCapital)
        .where(eq(availableCapital.orgId, orgId));
      const rows = await db.select().from(projectedLiquidity)
        .where(eq(projectedLiquidity.orgId, orgId))
        .orderBy(asc(projectedLiquidity.monthOn));
      const series = rows.map((row) => ({
        monthOn: dateColumnToString(row.monthOn),
        projectedBalance: String(row.projectedBalance),
      }));
      const latestProjectedRow = rows[rows.length - 1];
      const commitment = String(latestProjectedRow?.baseFundPool ?? capital?.baseFundPool ?? "0.0000");

      return {
        availableCapital: String(capital?.availableCapital ?? "0.0000"),
        poolBalance: String(capital?.poolBalance ?? "0.0000"),
        baseFundPool: String(capital?.baseFundPool ?? "0.0000"),
        commitment,
        series,
        narrative: liquidityNarrative({ series, commitment }),
      };
    },
  };
}
