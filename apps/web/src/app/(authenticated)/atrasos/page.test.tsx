import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScrArAgingPage from "./page";

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => Promise.resolve({
    orgId: "11111111-1111-4111-8111-111111111111",
    actorId: "33333333-3333-4333-8333-333333333333",
  }),
}));

const listAgingRows = vi.fn();

vi.mock("@mi-banquito/domain", () => ({
  createCollectionsService: () => ({
    listAgingRows,
  }),
  buildChaseMessage: ({ memberName, reasonKind, periodLabel }: {
    memberName: string;
    reasonKind: string;
    periodLabel: string;
  }) => `Hola ${memberName}: ${reasonKind} ${periodLabel}`,
  buildWhatsAppChaseUrl: ({ whatsappNumber, message }: {
    whatsappNumber?: string | null;
    message: string;
  }) => whatsappNumber ? `https://wa.me/593991234567?text=${encodeURIComponent(message)}` : null,
  defaultPromiseDate: () => "2026-07-11",
}));

describe("ScrArAgingPage", () => {
  it("renders aging rows with readable amounts, days late, promise form, and audited WhatsApp action", async () => {
    listAgingRows.mockResolvedValueOnce([
      {
        id: "aging-1",
        orgId: "11111111-1111-4111-8111-111111111111",
        memberId: "22222222-2222-4222-8222-222222222222",
        memberName: "Ana Mora",
        whatsappNumber: "+593991234567",
        reasonKind: "cuota",
        cycleId: null,
        loanId: "44444444-4444-4444-8444-444444444444",
        periodLabel: "julio 2026",
        dueDate: "2026-06-20",
        daysLate: 14,
        amountDue: "25.5000",
        lastActionAt: new Date("2026-07-02T15:00:00.000Z"),
      },
    ]);

    const { container } = render(await ScrArAgingPage({
      searchParams: Promise.resolve({}),
    }));

    const row = screen.getByRole("article", { name: /Ana Mora/ });
    expect(within(row).getByText("Cuota")).toBeInTheDocument();
    expect(within(row).getByText("julio 2026")).toBeInTheDocument();
    expect(within(row).getByText("2026-06-20")).toBeInTheDocument();
    expect(within(row).getByText("$25,50")).toBeInTheDocument();
    expect(within(row).getByText("14 días")).toBeInTheDocument();
    expect(within(row).getByText("2026-07-02")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Marcar promesa" })).toBeInTheDocument();
    expect(container.querySelector('input[name="promisedOn"]')).toHaveValue("2026-07-11");
    expect(within(row).queryByRole("link", { name: "Avisar por WhatsApp" })).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Avisar por WhatsApp" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Registrar aviso" })).not.toBeInTheDocument();
    expect(container.querySelector('input[name="whatsappNumber"]')).toHaveValue("+593991234567");
    expect(container.querySelector('input[name="reasonKind"]')).toHaveValue("cuota");
    expect(container.querySelector('input[name="periodLabel"]')).toHaveValue("julio 2026");
    expect(container.querySelector('input[name="memberName"]')).toHaveValue("Ana Mora");
  });

  it("passes the reason filter to the collections service", async () => {
    listAgingRows.mockResolvedValueOnce([]);

    render(await ScrArAgingPage({
      searchParams: Promise.resolve({ reason: "aporte" }),
    }));

    expect(listAgingRows).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "aporte",
    );
  });
});
