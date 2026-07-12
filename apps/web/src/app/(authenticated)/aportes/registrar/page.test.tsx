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
  createMovementService: () => ({
    listActiveAccounts: () => Promise.resolve([
      { id: "44444444-4444-4444-8444-444444444444", name: "Banco del grupo", last4: "1234", isGroupFund: true },
      { id: "55555555-5555-4555-8555-555555555555", name: "Cuenta personal", last4: null, isGroupFund: false },
    ]),
    listActiveGroupAccounts: () => Promise.resolve([{ id: "44444444-4444-4444-8444-444444444444" }]),
  }),
}));

describe("ScrRecordContributionPage", () => {
  it("defaults aporte payment source to cash in meeting", async () => {
    const { container } = render(await ScrRecordContributionPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Origen del pago")).toBeInTheDocument();
    expect(container.querySelector('select[name="paymentSource"]')).toHaveValue("cash_in_meeting");
    expect(screen.getByRole("combobox", { name: "¿En qué cuenta entró?" })).toHaveValue("44444444-4444-4444-8444-444444444444");
    expect(screen.getByRole("option", { name: /Cuenta personal.*pendiente de regularizar/i })).toBeInTheDocument();
  });

  it("renders one-tap BR-26 extra-money decisions during confirmation", async () => {
    const { container } = render(await ScrRecordContributionPage({
      searchParams: Promise.resolve({
        confirm: "1",
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        memberId: "22222222-2222-4222-8222-222222222222",
        amount: "30.00",
        datedOn: "2026-07-09",
        paymentSource: "bank_transfer",
        slipPhotoId: "99999999-9999-4999-8999-999999999999",
        notes: "Comprobante revisado",
        targetLoanId: "44444444-4444-4444-8444-444444444444",
      }),
    }));

    expect(screen.getByRole("radio", { name: /Aporte extra/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Prepagar aporte/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Abonar a capital/i })).toBeInTheDocument();
    expect(container.querySelector('input[name="slipPhotoId"]')).toHaveValue("99999999-9999-4999-8999-999999999999");
    expect(container.querySelector('input[name="notes"]')).toHaveValue("Comprobante revisado");
  });

  it("does not show loan-principal decision without a target loan", async () => {
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
    expect(screen.queryByRole("radio", { name: /Abonar a capital/i })).not.toBeInTheDocument();
  });
});
