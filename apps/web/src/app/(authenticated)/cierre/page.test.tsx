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
  monthlyCloseArtifactStatus: null,
  pendingRegularizations: [],
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

  it("explains that closing the month generates the document after reconciliation is saved", async () => {
    getMonthlyCloseState.mockResolvedValueOnce(baseState);

    render(await ScrMonthlyClosePage({ searchParams: Promise.resolve({ reconciled: "1" }) }));

    expect(screen.getByText("Conciliación guardada. Ahora presiona Cerrar mes para generar el reporte archivado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar mes" })).toBeEnabled();
  });

  it("lists every pending movement above the close action and blocks close with fixed copy", async () => {
    getMonthlyCloseState.mockResolvedValueOnce({
      ...baseState,
      pendingRegularizations: [{
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        kind: "contribution",
        memberId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        memberName: "Ana",
        accountId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        accountName: "Cuenta personal",
        amount: "50.0000",
        datedOn: "2026-06-20",
      }],
    });

    render(await ScrMonthlyClosePage({ searchParams: Promise.resolve({}) }));

    const panel = screen.getByRole("region", { name: "Movimientos pendientes de regularizar" });
    expect(panel).toHaveTextContent("Ana");
    expect(panel).toHaveTextContent("Cuenta personal");
    expect(panel).toHaveTextContent("USD 50.00");
    expect(screen.getByRole("link", { name: "Regularizar" })).toHaveAttribute(
      "href",
      "/movimientos/registrar?regularizesKind=contribution&regularizesId=dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
    expect(screen.getByRole("button", { name: "Cerrar mes" })).toBeDisabled();
    expect(screen.getByText("Regulariza estos depósitos antes de cerrar el mes.")).toBeInTheDocument();
  });

  it("shows archived PDF and WhatsApp controls after closing", async () => {
    getMonthlyCloseState.mockResolvedValueOnce({
      ...baseState,
      status: "closed",
      periodCloseId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      monthlyCloseStatementId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      monthlyClosePdfUri: "/statement-archive/monthly-close/f4".padEnd(96, "a"),
      canonicalPayloadHash: "f4".padEnd(64, "a"),
      monthlyCloseArtifactStatus: "ready",
    });

    render(await ScrMonthlyClosePage({ searchParams: Promise.resolve({ closed: "1" }) }));

    expect(screen.getByText("Mes cerrado.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar conciliación" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar nota" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar mes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Movimientos pendientes de regularizar" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir PDF" })).toHaveAttribute(
      "href",
      expect.stringContaining("/statement-archive/monthly-close/"),
    );
    expect(screen.getByRole("button", { name: "Compartir por WhatsApp" })).toBeInTheDocument();
  });

  it("shows processing without PDF or share controls while the close artifact is pending", async () => {
    getMonthlyCloseState.mockResolvedValueOnce({
      ...baseState,
      status: "closed",
      periodCloseId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      monthlyCloseStatementId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      monthlyClosePdfUri: "/statement-archive/public/f4.pdf",
      canonicalPayloadHash: "f4".padEnd(64, "a"),
      monthlyCloseArtifactStatus: "pending",
    });

    render(await ScrMonthlyClosePage({ searchParams: Promise.resolve({ closed: "1" }) }));

    expect(screen.getByText("El PDF se esta procesando.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Compartir por WhatsApp" })).not.toBeInTheDocument();
  });
});
