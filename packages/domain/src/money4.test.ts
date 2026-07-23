import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  addMoney4,
  compareMoney4,
  formatMoney4Units,
  parseMoney4Units,
  parseNonNegativeMoney4,
  parsePositiveMoney4,
  subtractMoney4,
} from "./money4";
import { parsePositiveMoney4 as parseRootPositiveMoney4 } from "./index";

const MIN_UNITS = BigInt("-999999999999999999");
const MAX_UNITS = BigInt("999999999999999999");

describe("numeric(18,4) arithmetic", () => {
  it("round-trips the complete representable unit range", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: MIN_UNITS, max: MAX_UNITS }), (units) => {
        expect(parseMoney4Units(formatMoney4Units(units))).toBe(units);
      }),
      { seed: 915, numRuns: 2_000 },
    );
  });

  it("is associative and exact above Number.MAX_SAFE_INTEGER", () => {
    expect(addMoney4("90071992547409.9100", "0.0001")).toBe("90071992547409.9101");
    expect(subtractMoney4("10.0000", "10.0000")).toBe("0.0000");
    expect(compareMoney4("10.0001", "10.0000")).toBe(1);
  });

  it("preserves exact addition, subtraction, and associativity within range", () => {
    const smallUnits = fc.bigInt({
      min: BigInt("-300000000000000000"),
      max: BigInt("300000000000000000"),
    });

    fc.assert(
      fc.property(smallUnits, smallUnits, smallUnits, (a, b, c) => {
        const aValue = formatMoney4Units(a);
        const bValue = formatMoney4Units(b);
        const cValue = formatMoney4Units(c);

        expect(parseMoney4Units(addMoney4(aValue, bValue))).toBe(a + b);
        expect(parseMoney4Units(subtractMoney4(aValue, bValue))).toBe(a - b);
        expect(addMoney4(addMoney4(aValue, bValue), cValue)).toBe(
          addMoney4(aValue, addMoney4(bValue, cValue)),
        );
      }),
      { seed: 916, numRuns: 1_000 },
    );
  });

  it("orders values exactly across the representable range", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: MIN_UNITS, max: MAX_UNITS }),
        fc.bigInt({ min: MIN_UNITS, max: MAX_UNITS }),
        (a, b) => {
          const expected = a < b ? -1 : a > b ? 1 : 0;
          expect(compareMoney4(formatMoney4Units(a), formatMoney4Units(b))).toBe(expected);
        },
      ),
      { seed: 917, numRuns: 1_000 },
    );
  });

  it("parses accepted decimal forms and formats canonical four-decimal values", () => {
    expect(parseMoney4Units(" 12 ")).toBe(BigInt(120_000));
    expect(parseMoney4Units("-12.3")).toBe(BigInt(-123_000));
    expect(parseMoney4Units("12,0034")).toBe(BigInt(120_034));
    expect(formatMoney4Units(BigInt(-1))).toBe("-0.0001");
    expect(formatMoney4Units(BigInt(0))).toBe("0.0000");
    expect(formatMoney4Units(MAX_UNITS)).toBe("99999999999999.9999");
    expect(formatMoney4Units(MIN_UNITS)).toBe("-99999999999999.9999");
  });

  it.each([
    "",
    " ",
    "+1",
    ".1",
    "1.",
    "1.00000",
    "1,2.3",
    "1e2",
    "NaN",
    "--1",
  ])("rejects invalid representation %j", (value) => {
    expect(() => parseMoney4Units(value)).toThrowError("money4_invalid");
  });

  it("rejects parse, format, and arithmetic results outside numeric(18,4)", () => {
    expect(() => parseMoney4Units("100000000000000")).toThrowError("money4_out_of_range");
    expect(() => parseMoney4Units("-100000000000000")).toThrowError("money4_out_of_range");
    expect(() => formatMoney4Units(MAX_UNITS + BigInt(1))).toThrowError("money4_out_of_range");
    expect(() => addMoney4("99999999999999.9999", "0.0001")).toThrowError(
      "money4_out_of_range",
    );
    expect(() => subtractMoney4("-99999999999999.9999", "0.0001")).toThrowError(
      "money4_out_of_range",
    );
  });

  it("enforces non-negative and positive amount contracts", () => {
    expect(parseNonNegativeMoney4("0.0000")).toBe("0.0000");
    expect(parseNonNegativeMoney4(" 12,3 ")).toBe("12.3000");
    expect(() => parseNonNegativeMoney4("-0.0001")).toThrowError(
      "money4_non_negative_required",
    );

    expect(parsePositiveMoney4(" 12,3 ")).toBe("12.3000");
    expect(() => parsePositiveMoney4("0.0000")).toThrowError("money4_positive_required");
    expect(() => parsePositiveMoney4("-0.0001")).toThrowError("money4_positive_required");
  });

  it("preserves the package-root movement parser contract", () => {
    expect(parseRootPositiveMoney4("12,3")).toBe("12.3000");
    expect(() => parseRootPositiveMoney4("0.0000")).toThrowError("movement_amount_invalid");
  });
});
