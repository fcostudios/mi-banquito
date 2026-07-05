import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ScrCashFlowProjectionPage from "./page";

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => Promise.resolve({
    orgId: "11111111-1111-4111-8111-111111111111",
    actorId: "33333333-3333-4333-8333-333333333333",
  }),
}));

const getProjection = vi.fn();

vi.mock("@mi-banquito/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mi-banquito/domain")>();
  return {
    ...actual,
    createLiquidityService: () => ({
      getProjection,
    }),
  };
});

describe("ScrCashFlowProjectionPage", () => {
  it("renders projected liquidity with a sandbox instead of the scaffold", async () => {
    getProjection.mockResolvedValueOnce({
      availableCapital: "740.0000",
      poolBalance: "900.0000",
      baseFundPool: "160.0000",
      commitment: "250.0000",
      hypotheticalLoanTerms: {
        rateValue: "5.0000",
        termPeriods: 10,
      },
      series: [
        { monthOn: "2026-07-01", projectedBalance: "300.0000" },
        { monthOn: "2026-08-01", projectedBalance: "260.0000" },
        { monthOn: "2026-09-01", projectedBalance: "420.0000" },
      ],
      narrative: "Tu mes mínimo es agosto con $260,00.",
    });

    const { container } = render(await ScrCashFlowProjectionPage());

    expect(getProjection).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(container.querySelector("[data-scaffold]")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Liquidez proyectada" })).toBeInTheDocument();
    expect(screen.getByText("$740,00")).toBeInTheDocument();
    expect(screen.getByText("$900,00")).toBeInTheDocument();
    expect(screen.getByText("$160,00")).toBeInTheDocument();
    expect(screen.getByText("Tu mes mínimo es agosto con $260,00.")).toBeInTheDocument();

    const sandbox = screen.getByRole("region", { name: "Considerar un préstamo" });
    expect(within(sandbox).getByLabelText("Monto del préstamo de prueba")).toBeInTheDocument();
    expect(within(sandbox).getByText("Parámetros de simulación")).toBeInTheDocument();
    expect(within(sandbox).getByText("5,00%")).toBeInTheDocument();
    expect(within(sandbox).getByText("10 periodos")).toBeInTheDocument();
    expect(within(sandbox).getByText(/Resta el capital del préstamo/)).toBeInTheDocument();
    expect(within(sandbox).getByText("2026-08-01")).toBeInTheDocument();
    expect(within(sandbox).getByText("$260,00")).toBeInTheDocument();
  });
});
