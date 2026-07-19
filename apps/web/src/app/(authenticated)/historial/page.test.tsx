import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScrHistoryPage from "./page";

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => Promise.resolve({
    orgId: "11111111-1111-4111-8111-111111111111",
    actorId: "33333333-3333-4333-8333-333333333333",
  }),
}));

vi.mock("@mi-banquito/domain", () => ({
  narratedAuditActionKinds: [
    "contribution.create",
    "loan.repayment.create",
    "loan.repayment.data_correction",
  ],
  createAuditService: () => ({
    listNarratedEntries: () => Promise.resolve([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId: "11111111-1111-4111-8111-111111111111",
        actorKind: "member",
        actorId: "33333333-3333-4333-8333-333333333333",
        actionKind: "loan.repayment.create",
        subjectKind: "repayment",
        subjectId: "44444444-4444-4444-8444-444444444444",
        memberId: "m1",
        at: new Date("2026-07-02T10:00:00.000Z"),
        text: "Pancho registró un pago de $16.00 el 2026-07-02.",
        details: [
          { label: "Nota", value: "Pago de atraso 2026-06" },
          { label: "Aplicado a", value: "2026-06" },
        ],
      },
    ]),
  }),
  createLedgerService: () => ({
    listContributions: () => Promise.resolve([{
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      memberName: "Ana",
      amount: "10.0000",
      currencyCode: "USD",
      datedOn: "2026-07-01",
      reversesId: null,
    }]),
  }),
  reversalSentence: () => "Vas a reversar el aporte de Ana por $10.00 registrado el 2026-07-01.",
}));

describe("ScrHistoryPage", () => {
  it("shows the same readable movement name in result cards that filters use", async () => {
    const { container } = render(await ScrHistoryPage({
      searchParams: Promise.resolve({ saved: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    }));
    const card = screen.getByText("Pancho registró un pago de $16.00 el 2026-07-02.").closest("article");

    expect(card).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Pago registrado");
    expect(screen.getByRole("status")).toHaveTextContent("distribución aplicada");
    expect(within(card!).getByText("Pago registrado")).toBeInTheDocument();
    expect(within(card!).getByText("02/07/2026, 05:00")).toBeInTheDocument();
    expect(within(card!).getByText("Nota")).toBeInTheDocument();
    expect(within(card!).getByText("Pago de atraso 2026-06")).toBeInTheDocument();
    expect(within(card!).getByText("Aplicado a")).toBeInTheDocument();
    expect(within(card!).getByText("2026-06")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("loan.repayment.create");
  });

  it("requires a reason before enabling the destructive reversal confirmation", async () => {
    render(await ScrHistoryPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Vas a reversar el aporte de Ana por $10.00 registrado el 2026-07-01.")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Confirmar reversión", hidden: true });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Razón de la reversión"), { target: { value: "Duplicado" } });
    expect(confirm).toBeEnabled();
  });
});
