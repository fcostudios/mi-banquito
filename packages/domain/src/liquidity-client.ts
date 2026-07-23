import { formatMoney4Units, parseMoney4Units } from "./money4";

export type LiquidityPoint = {
  monthOn: string;
  projectedBalance: string;
};

export type HypotheticalLoanTerms = {
  rateValue?: string;
  termPeriods?: number;
};

const MONEY4_CENT_UNITS = BigInt(100);
const PERCENT_MONEY4_DENOMINATOR = BigInt(1_000_000);

function formatMoneyUnits(value: bigint): string {
  const absolute = value < BigInt(0) ? -value : value;
  const roundedCents = (absolute + BigInt(50)) / MONEY4_CENT_UNITS;
  const sign = value < BigInt(0) && roundedCents !== BigInt(0) ? "-" : "";
  const whole = String(roundedCents / BigInt(100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cents = String(roundedCents % BigInt(100)).padStart(2, "0");
  return `${sign}$${whole},${cents}`;
}

function monthName(monthOn: string): string {
  const date = new Date(`${monthOn}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("es-EC", {
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

function roundNonNegative(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / BigInt(2)) / denominator;
}

function cumulativeScheduledCollections(input: {
  loanUnits: bigint;
  rateUnits: bigint;
  termPeriods: number;
}): bigint[] {
  const principalCents = roundNonNegative(input.loanUnits, MONEY4_CENT_UNITS);
  const periods = BigInt(input.termPeriods);
  const basePrincipalCents = principalCents / periods;
  const remainderCents = principalCents % periods;
  let remainingPrincipalCents = principalCents;
  let cumulativeCents = BigInt(0);

  return Array.from({ length: input.termPeriods }, (_, index) => {
    const principalDueCents = basePrincipalCents + (BigInt(index) < remainderCents ? BigInt(1) : BigInt(0));
    const interestDueCents = roundNonNegative(
      remainingPrincipalCents * input.rateUnits,
      PERCENT_MONEY4_DENOMINATOR,
    );
    remainingPrincipalCents -= principalDueCents;
    cumulativeCents += principalDueCents + interestDueCents;
    return cumulativeCents;
  });
}

export function applyHypotheticalLoan(
  series: LiquidityPoint[],
  amount: string,
  terms: HypotheticalLoanTerms = {},
): LiquidityPoint[] {
  let loanUnits: bigint;
  try {
    loanUnits = parseMoney4Units(amount || "0.0000");
  } catch {
    return series;
  }
  if (loanUnits <= BigInt(0)) return series;

  const termPeriods = terms.termPeriods ?? 10;
  if (termPeriods <= 0 || termPeriods % 1 !== 0) {
    throw new Error("termPeriods must be a positive integer");
  }
  const rateUnits = parseMoney4Units(terms.rateValue ?? "0.0000");
  if (rateUnits < BigInt(0)) throw new Error("ratePerPeriod must be zero or greater");
  const cumulativeCents = cumulativeScheduledCollections({ loanUnits, rateUnits, termPeriods });

  return series.map((row, index) => {
    const collectedCents = index <= 0
      ? BigInt(0)
      : cumulativeCents[Math.min(index, termPeriods) - 1] ?? BigInt(0);
    return {
      ...row,
      projectedBalance: formatMoney4Units(
        parseMoney4Units(row.projectedBalance) - loanUnits + collectedCents * MONEY4_CENT_UNITS,
      ),
    };
  });
}

export function liquidityNarrative(input: { series: LiquidityPoint[]; commitment: string }): string {
  const [firstPoint] = input.series;
  if (!firstPoint) {
    return "No hay datos de liquidez proyectada todavía.";
  }

  const minimumPoint = input.series.reduce((current, row) => (
    parseMoney4Units(row.projectedBalance) < parseMoney4Units(current.projectedBalance) ? row : current
  ), firstPoint);
  const yearEndPoint = input.series[input.series.length - 1] ?? firstPoint;
  const delta = parseMoney4Units(yearEndPoint.projectedBalance) - parseMoney4Units(input.commitment);
  const direction = delta < BigInt(0) ? "por debajo" : "por encima";

  return [
    `Tu mes mínimo es ${monthName(minimumPoint.monthOn)} con ${formatMoneyUnits(parseMoney4Units(minimumPoint.projectedBalance))}.`,
    `Llegarás a fin de año con ${formatMoneyUnits(parseMoney4Units(yearEndPoint.projectedBalance))},`,
    `lo cual está ${formatMoneyUnits(delta < BigInt(0) ? -delta : delta)} ${direction} del compromiso.`,
  ].join(" ");
}
