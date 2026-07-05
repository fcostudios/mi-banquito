import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ScrMonthlyClosePage from "./page";

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => Promise.resolve({
    orgId: "11111111-1111-4111-8111-111111111111",
    actorId: "33333333-3333-4333-8333-333333333333",
  }),
}));

vi.mock("./actions", () => ({
  annotateReconciliationAction: vi.fn(),
  closePeriodAction: vi.fn(),
  executeReconciliationAction: vi.fn(),
  shareMonthlyCloseAction: vi.fn(),
}));

const getMonthlyCloseState = vi.fn();

vi.mock("@mi-banquito/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mi-banquito/domain")>();
  return {
    ...actual,
    createReconciliationService: () => ({
      getMonthlyCloseState,
    }),
  };
});

const baseState = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  orgId: "11111111-1111-4111-8111-111111111111",
  cycleId: "22222222-2222-4222-8222-222222222222",
  cycleLabel: "julio 2026",
  declaredBankBalance: "300.0000",
  computedPoolBalance: "300.0000",
  discrepancyAmount: "0.0000",
  toleranceAmount: "1.0000",
  status: "within_tolerance",
  closeAllowed: true,
  resolutionKind: "auto_within_tolerance",
  resolutionNote: null,
  periodCloseId: null,
  monthlyCloseStatementId: null,
  monthlyClosePdfUri: null,
  canonicalPayloadHash: null,
} as const;

describe("ScrMonthlyClosePage", () => {
  it("keeps close disabled before a saved reconciliation row exists", async () => {
    getMonthlyCloseState.mockResolvedValueOnce({
      ...baseState,
      id: "",
      closeAllowed: false,
    });

    render(await ScrMonthlyClosePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Cierre del mes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar mes" })).toBeDisabled();
    expect(screen.getByText("Primero guarda una conciliación dentro de tolerancia o una nota de aceptación.")).toBeInTheDocument();
  });

  it("keeps close disabled for a reconciliation that is not in a closeable past period", async () => {
    getMonthlyCloseState.mockResolvedValueOnce({
      ...baseState,
      closeAllowed: false,
    });

    render(await ScrMonthlyClosePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("button", { name: "Cerrar mes" })).toBeDisabled();
    expect(screen.getByText("Primero guarda una conciliación dentro de tolerancia o una nota de aceptación.")).toBeInTheDocument();
  });

  it("shows archived PDF and WhatsApp controls after closing", async () => {
    getMonthlyCloseState.mockResolvedValueOnce({
      ...baseState,
      status: "closed",
      periodCloseId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      monthlyCloseStatementId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      monthlyClosePdfUri: "/statement-archive/monthly-close/f4".padEnd(96, "a"),
      canonicalPayloadHash: "f4".padEnd(64, "a"),
    });

    render(await ScrMonthlyClosePage({ searchParams: Promise.resolve({ closed: "1" }) }));

    expect(screen.getByText("Mes cerrado.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir PDF" })).toHaveAttribute(
      "href",
      expect.stringContaining("/statement-archive/monthly-close/"),
    );
    expect(screen.getByRole("button", { name: "Compartir por WhatsApp" })).toBeInTheDocument();
  });
});
