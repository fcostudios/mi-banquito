import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
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
      },
    ]),
  }),
}));

describe("ScrHistoryPage", () => {
  it("shows the same readable movement name in result cards that filters use", async () => {
    const { container } = render(await ScrHistoryPage({
      searchParams: Promise.resolve({}),
    }));
    const card = screen.getByText("Pancho registró un pago de $16.00 el 2026-07-02.").closest("article");

    expect(card).not.toBeNull();
    expect(within(card!).getByText("Pago registrado")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("loan.repayment.create");
  });
});
