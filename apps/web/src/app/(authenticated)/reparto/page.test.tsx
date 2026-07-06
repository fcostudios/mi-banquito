import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ScrYearEndShareOutPage from "./page";

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => Promise.resolve({
    orgId: "11111111-1111-4111-8111-111111111111",
    actorId: "33333333-3333-4333-8333-333333333333",
  }),
}));

vi.mock("./actions", () => ({
  approveShareOutAction: vi.fn(),
  overrideShareOutLineAction: vi.fn(),
  runShareOutDraftAction: vi.fn(),
}));

const getLatestDraft = vi.fn();

vi.mock("@mi-banquito/domain", () => ({
  createShareOutService: () => ({
    getLatestDraft,
  }),
}));

describe("ScrYearEndShareOutPage", () => {
  it("renders governance prompt, draft grid, override inputs, and approval control", async () => {
    getLatestDraft.mockResolvedValueOnce({
      id: "shareout-1",
      year: 2026,
      status: "draft",
      repartoTotal: "100.0000",
      loanPoolAmount: "30.0000",
      savingsPoolAmount: "70.0000",
      ajusteAmount: "0.0000",
      lines: [{
        id: "line-1",
        memberName: "Ana Mora",
        accumulatedSavingsAtRun: "100.0000",
        loanActivityBasis: "300.0000",
        loanBonusC: "9.0000",
        savingsInterest: "17.5000",
        draftShareAmount: "26.5000",
        overrideReason: null,
        finalShareAmount: "26.5000",
      }],
    });

    render(await ScrYearEndShareOutPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Reparto fin de año" })).toBeInTheDocument();
    expect(screen.getByText("Decisión de gobernanza requerida")).toBeInTheDocument();
    expect(screen.getByText("Ana Mora")).toBeInTheDocument();
    expect(screen.getByLabelText("Monto final Ana Mora")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar override" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprobar reparto" })).toBeInTheDocument();
  });

  it("renders a recoverable message when draft generation is missing prerequisites", async () => {
    getLatestDraft.mockResolvedValueOnce(null);

    render(await ScrYearEndShareOutPage({
      searchParams: Promise.resolve({ error: "governance-required" }),
    }));

    expect(screen.getByText("Antes de generar el reparto, registra y aprueba la decisión de gobernanza del año.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar reparto 2026" })).toBeInTheDocument();
  });
});
