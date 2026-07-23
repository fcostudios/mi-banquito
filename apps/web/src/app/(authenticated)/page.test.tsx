import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ScrTreasurerHomePage from "./page";

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => Promise.resolve({
    orgId: "11111111-1111-4111-8111-111111111111",
    actorId: "22222222-2222-4222-8222-222222222222",
  }),
}));

vi.mock("@mi-banquito/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mi-banquito/domain")>();
  return {
    ...actual,
    createLedgerService: () => ({
      listComplianceRows: () => Promise.resolve([]),
      searchMembersWithBalance: () => Promise.resolve([]),
    }),
    createMovementService: () => ({
      listPendingDepositsPage: () => Promise.resolve({
        rows: [{ id: "one", sourceKind: "contribution" }],
        nextCursor: { datedOn: "2026-07-21", sourceKind: "contribution", id: "one" },
        totalCount: 137,
      }),
    }),
  };
});

describe("ScrTreasurerHomePage", () => {
  it("shows the live pending-regularization count and warning status", async () => {
    render(await ScrTreasurerHomePage());

    const closeLink = screen.getByRole("link", { name: /Pendientes de regularizar/i });
    expect(closeLink).toHaveAttribute("href", "/movimientos/registrar");
    expect(within(closeLink).getByText("137")).toBeInTheDocument();
    expect(within(closeLink).getByText("Pendiente de regularizar")).toBeInTheDocument();
  });
});
