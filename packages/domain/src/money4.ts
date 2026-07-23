const SCALE = BigInt(10_000);
const MAX_UNITS = BigInt("999999999999999999");
const MONEY4_PATTERN = /^(-?)(\d{1,14})(?:[.,](\d{1,4}))?$/;
const DECIMAL_PATTERN = /^-?\d+(?:[.,]\d{1,4})?$/;

function assertUnitsInRange(units: bigint): void {
  if (units < -MAX_UNITS || units > MAX_UNITS) {
    throw new Error("money4_out_of_range");
  }
}

export function parseMoney4Units(value: string): bigint {
  const normalized = value.trim();
  const match = MONEY4_PATTERN.exec(normalized);

  if (!match) {
    if (DECIMAL_PATTERN.test(normalized)) {
      throw new Error("money4_out_of_range");
    }
    throw new Error("money4_invalid");
  }

  const [, sign, integerPart, fractionPart = ""] = match;
  const fractionUnits = BigInt(fractionPart.padEnd(4, "0"));
  const unsignedUnits = BigInt(integerPart) * SCALE + fractionUnits;
  const units = sign === "-" ? -unsignedUnits : unsignedUnits;

  assertUnitsInRange(units);
  return units;
}

export function formatMoney4Units(units: bigint): string {
  assertUnitsInRange(units);

  const isNegative = units < BigInt(0);
  const magnitude = isNegative ? -units : units;
  const integerPart = magnitude / SCALE;
  const fractionPart = (magnitude % SCALE).toString().padStart(4, "0");

  return `${isNegative ? "-" : ""}${integerPart.toString()}.${fractionPart}`;
}

export function addMoney4(left: string, right: string): string {
  return formatMoney4Units(parseMoney4Units(left) + parseMoney4Units(right));
}

export function subtractMoney4(left: string, right: string): string {
  return formatMoney4Units(parseMoney4Units(left) - parseMoney4Units(right));
}

export function compareMoney4(left: string, right: string): -1 | 0 | 1 {
  const leftUnits = parseMoney4Units(left);
  const rightUnits = parseMoney4Units(right);

  return leftUnits < rightUnits ? -1 : leftUnits > rightUnits ? 1 : 0;
}

export function parseNonNegativeMoney4(value: string): string {
  const units = parseMoney4Units(value);

  if (units < BigInt(0)) {
    throw new Error("money4_non_negative_required");
  }

  return formatMoney4Units(units);
}

export function parsePositiveMoney4(value: string): string {
  const units = parseMoney4Units(value);

  if (units <= BigInt(0)) {
    throw new Error("money4_positive_required");
  }

  return formatMoney4Units(units);
}
