import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ScrMemberDetailPage from "./page";

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => Promise.resolve({
    orgId: "11111111-1111-4111-8111-111111111111",
    actorId: "33333333-3333-4333-8333-333333333333",
  }),
}));

vi.mock("./actions", () => ({
  transitionMemberStatusAction: vi.fn(),
}));

vi.mock("../../estados/actions", () => ({
  generateMemberStatementsAction: vi.fn(),
}));

const getMember = vi.fn();
const getMemberBalance = vi.fn();
const listStatementArchive = vi.fn();
const listMemberDeposits = vi.fn();

vi.mock("@mi-banquito/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mi-banquito/domain")>();
  return {
    ...actual,
    createLedgerService: () => ({
      getMember,
      getMemberBalance,
    }),
    createReportingService: () => ({
      listStatementArchive,
    }),
    createMovementService: () => ({
      listMemberDeposits,
    }),
  };
});

describe("ScrMemberDetailPage", () => {
  it("shows the prominent current balance and WhatsApp share affordance", async () => {
    getMember.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
      orgId: "11111111-1111-4111-8111-111111111111",
      displayName: "Ana Mora",
      status: "activo",
      role: "aportante",
      initialSavingsBalance: "40.0000",
    });
    getMemberBalance.mockResolvedValueOnce({
      memberId: "22222222-2222-4222-8222-222222222222",
      displayName: "Ana Mora",
      currentBalance: "120.5000",
      state: "al_dia",
      whatsappNumber: "+593991234567",
      balanceShareUrl: "https://wa.me/593991234567?text=saldo",
    });
    listStatementArchive.mockResolvedValueOnce([{
      id: "close-1",
      kind: "monthly_close",
      periodCloseId: "period-close-1",
      periodLabel: "2026-06",
    }]);
    listMemberDeposits.mockResolvedValueOnce([]);

    render(await ScrMemberDetailPage({
      params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }),
      searchParams: Promise.resolve({}),
    }));

    expect(screen.getByRole("heading", { name: "Ana Mora" })).toBeInTheDocument();
    expect(screen.getByText("Saldo actual")).toBeInTheDocument();
    expect(screen.getByText("USD 120.50")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Compartir saldo por WhatsApp" })).toHaveAttribute("href", "https://wa.me/593991234567?text=saldo");
    expect(screen.getByRole("button", { name: "Generar estado de cuenta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dar de baja" })).toBeInTheDocument();
  });

  it("shows the latest monthly member statement link and generation result on detail", async () => {
    getMember.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
      orgId: "11111111-1111-4111-8111-111111111111",
      displayName: "Ana Mora",
      status: "activo",
      role: "aportante",
      initialSavingsBalance: "40.0000",
    });
    getMemberBalance.mockResolvedValueOnce({
      memberId: "22222222-2222-4222-8222-222222222222",
      displayName: "Ana Mora",
      currentBalance: "120.5000",
      state: "al_dia",
      whatsappNumber: "+593991234567",
      balanceShareUrl: "https://wa.me/593991234567?text=saldo",
    });
    listStatementArchive.mockResolvedValueOnce([
      {
        id: "member-statement-1",
        kind: "monthly_member",
        memberId: "22222222-2222-4222-8222-222222222222",
        periodLabel: "2026-06",
        periodCloseId: "period-close-1",
        pdfUri: "/statement-archive/public/abc.pdf",
      },
      {
        id: "close-1",
        kind: "monthly_close",
        periodCloseId: "period-close-1",
        periodLabel: "2026-06",
      },
    ]);
    listMemberDeposits.mockResolvedValueOnce([]);

    render(await ScrMemberDetailPage({
      params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }),
      searchParams: Promise.resolve({ estado: "generado" }),
    }));

    expect(screen.getByText("Estado de cuenta listo.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir estado de cuenta 2026-06" })).toHaveAttribute(
      "href",
      "/statement-archive/public/abc.pdf",
    );
  });

  it("shows pending, regularized, and legacy-account deposit statuses", async () => {
    getMember.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
      orgId: "11111111-1111-4111-8111-111111111111",
      displayName: "Ana Mora",
      status: "activo",
      role: "aportante",
      initialSavingsBalance: "40.0000",
    });
    getMemberBalance.mockResolvedValueOnce(null);
    listStatementArchive.mockResolvedValueOnce([]);
    listMemberDeposits.mockResolvedValueOnce([
      { id: "one", sourceKind: "contribution", datedOn: "2026-07-10", accountName: "Cuenta personal", amount: "50.0000", reconciliationStatus: "pending" },
      { id: "two", sourceKind: "repayment", datedOn: "2026-07-11", accountName: null, amount: "20.0000", reconciliationStatus: "regularized" },
    ]);

    render(await ScrMemberDetailPage({
      params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }),
      searchParams: Promise.resolve({}),
    }));

    const section = screen.getByRole("region", { name: "Depósitos y regularización" });
    expect(section).toHaveTextContent("Pendiente de regularizar");
    expect(section).toHaveTextContent("Regularizado");
    expect(section).toHaveTextContent("Cuenta histórica sin referencia");
  });
});
