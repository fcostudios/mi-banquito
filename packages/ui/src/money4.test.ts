import { describe, expect, it } from "vitest";

import { formatUsdMoney4 } from "./money4";

describe("formatUsdMoney4", () => {
  it.each([
    ["1.9999", "USD 2.00", "$2,00"],
    ["-0.0001", "USD 0.00", "$0,00"],
    ["0.0050", "USD 0.01", "$0,01"],
    ["-0.0050", "USD -0.01", "-$0,01"],
    ["99999999999999.9999", "USD 100000000000000.00", "$100.000.000.000.000,00"],
  ])("rounds %s to display cents exactly", (value, code, symbol) => {
    expect(formatUsdMoney4(value, "code")).toBe(code);
    expect(formatUsdMoney4(value)).toBe(symbol);
  });
});
