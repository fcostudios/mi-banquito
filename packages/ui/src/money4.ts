const MONEY4_PATTERN = /^(-?)(\d{1,14})(?:[.,](\d{1,4}))?$/;
const RATIO_PATTERN = /^(-?)(\d{1,14})(?:[.,](\d{1,10}))?$/;
const HUNDRED = BigInt(100);
const MONEY4_SCALE = BigInt(10_000);

function parseMoney4Display(value: string | null | undefined) {
  const normalized = String(value ?? "0.0000").trim();
  const match = MONEY4_PATTERN.exec(normalized);
  if (!match) throw new Error("money4_invalid");
  const magnitude = BigInt(match[2]) * MONEY4_SCALE
    + BigInt((match[3] ?? "").padEnd(4, "0"));
  const roundedCents = (magnitude + BigInt(50)) / HUNDRED;
  return { negative: match[1] === "-" && roundedCents !== BigInt(0), roundedCents };
}

function displayParts(input: { negative: boolean; roundedCents: bigint }) {
  return {
    sign: input.negative ? "-" : "",
    whole: String(input.roundedCents / HUNDRED),
    hundredths: String(input.roundedCents % HUNDRED).padStart(2, "0"),
  };
}

/** Formats Money4 with deterministic half-away-from-zero cent rounding. */
export function formatUsdMoney4(
  value: string | null | undefined,
  style: "symbol" | "code" = "symbol",
): string {
  const { sign, whole, hundredths } = displayParts(parseMoney4Display(value));
  if (style === "code") return `USD ${sign}${whole}.${hundredths}`;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}$${grouped},${hundredths}`;
}

export function formatPercent4(value: string | null | undefined): string {
  const { sign, whole, hundredths } = displayParts(parseMoney4Display(value));
  return `${sign}${whole},${hundredths}%`;
}

export function formatRatioPercent(value: string | null | undefined): string {
  const normalized = String(value ?? "0.0000").trim();
  const match = RATIO_PATTERN.exec(normalized);
  if (!match) throw new Error("money4_invalid");
  const fraction = match[3] ?? "";
  const unsigned = BigInt(`${match[2]}${fraction}`);
  const divisor = BigInt(10) ** BigInt(fraction.length);
  const roundedCents = (unsigned * BigInt(10_000) + divisor / BigInt(2)) / divisor;
  const { sign, whole, hundredths } = displayParts({
    negative: match[1] === "-" && roundedCents !== BigInt(0),
    roundedCents,
  });
  return `${sign}${whole},${hundredths}%`;
}
