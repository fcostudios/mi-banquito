import { asc, eq } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import { availableCapital, projectedLiquidity } from "@mi-banquito/db/schema";

export type LiquidityPoint = {
  monthOn: string;
  projectedBalance: string;
};

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

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function formatMoney4(value: number): string {
  return value.toFixed(4);
}

function dateColumnToString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function monthName(monthOn: string): string {
  const date = new Date(`${monthOn}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("es-EC", {
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

export function applyHypotheticalLoan(series: LiquidityPoint[], amount: string): LiquidityPoint[] {
  const loanAmount = Number(amount || 0);
  const normalizedLoanAmount = Number.isFinite(loanAmount) && loanAmount > 0 ? loanAmount : 0;

  return series.map((row) => ({
    ...row,
    projectedBalance: formatMoney4(Number(row.projectedBalance) - normalizedLoanAmount),
  }));
}

export function liquidityNarrative(input: { series: LiquidityPoint[]; commitment: string }): string {
  const [firstPoint] = input.series;
  if (!firstPoint) {
    return "No hay datos de liquidez proyectada todavía.";
  }

  const minimumPoint = input.series.reduce((current, row) => (
    Number(row.projectedBalance) < Number(current.projectedBalance) ? row : current
  ), firstPoint);
  const yearEndPoint = input.series[input.series.length - 1] ?? firstPoint;
  const delta = Number(yearEndPoint.projectedBalance) - Number(input.commitment);
  const direction = delta < 0 ? "por debajo" : "por encima";

  return [
    `Tu mes mínimo es ${monthName(minimumPoint.monthOn)} con ${formatMoney(minimumPoint.projectedBalance)}.`,
    `Llegarás a fin de año con ${formatMoney(yearEndPoint.projectedBalance)},`,
    `lo cual está ${formatMoney(Math.abs(delta))} ${direction} del compromiso.`,
  ].join(" ");
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
