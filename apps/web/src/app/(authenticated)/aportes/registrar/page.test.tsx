import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScrRecordContributionPage from "./page";

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => Promise.resolve({
    orgId: "11111111-1111-4111-8111-111111111111",
    actorId: "33333333-3333-4333-8333-333333333333",
  }),
}));

vi.mock("@mi-banquito/domain", () => ({
  createLedgerService: () => ({
    listMembers: () => Promise.resolve([
      {
        id: "22222222-2222-4222-8222-222222222222",
        displayName: "Ana",
        status: "activo",
      },
    ]),
  }),
}));

describe("ScrRecordContributionPage", () => {
  it("defaults aporte payment source to cash in meeting", async () => {
    const { container } = render(await ScrRecordContributionPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Origen del pago")).toBeInTheDocument();
    expect(container.querySelector('select[name="paymentSource"]')).toHaveValue("cash_in_meeting");
  });

  it("renders one-tap BR-26 extra-money decisions during confirmation", async () => {
    render(await ScrRecordContributionPage({
      searchParams: Promise.resolve({
        confirm: "1",
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        memberId: "22222222-2222-4222-8222-222222222222",
        amount: "30.00",
        datedOn: "2026-07-09",
        paymentSource: "cash_in_meeting",
      }),
    }));

    expect(screen.getByRole("radio", { name: /Aporte extra/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Prepagar aporte/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Abonar a capital/i })).toBeInTheDocument();
  });
});
