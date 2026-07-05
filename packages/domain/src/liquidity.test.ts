import { describe, expect, it } from "vitest";

import { applyHypotheticalLoan, liquidityNarrative } from "./liquidity";

describe("liquidity projection", () => {
  const series = [
    { monthOn: "2026-07-01", projectedBalance: "300.0000" },
    { monthOn: "2026-08-01", projectedBalance: "260.0000" },
    { monthOn: "2026-09-01", projectedBalance: "420.0000" },
  ];

  it("builds readable narrative for the minimum month and year end", () => {
    expect(liquidityNarrative({ series, commitment: "250.0000" })).toBe(
      "Tu mes mínimo es agosto con $260,00. Llegarás a fin de año con $420,00, lo cual está $170,00 por encima del compromiso.",
    );
  });

  it("applies a hypothetical loan without mutating the original projection", () => {
    const shifted = applyHypotheticalLoan(series, "100.0000");

    expect(shifted.map((row) => row.projectedBalance)).toEqual(["200.0000", "170.0000", "340.0000"]);
    expect(series[0]?.projectedBalance).toBe("300.0000");
  });
});
