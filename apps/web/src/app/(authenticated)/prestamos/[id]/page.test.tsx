import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScrLoanDetailPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => Promise.resolve({
    orgId: "11111111-1111-4111-8111-111111111111",
    actorId: "33333333-3333-4333-8333-333333333333",
  }),
}));

vi.mock("@mi-banquito/domain", () => ({
  createLoanService: () => ({
    getLoanDetail: () => Promise.resolve({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      borrowerName: "Pancho",
      borrowerKind: "member",
      principalAmount: "100.0000",
      currencyCode: "USD",
      status: "activo",
      rateValue: "5.0000",
      rateModel: "declining_balance",
      termPeriods: 10,
      originatedOn: "2026-07-02",
      schedule: [
        {
          periodIndex: 1,
          dueOn: "2026-08-02",
          principalDue: "10.0000",
          interestDue: "5.0000",
          paidPrincipalToDate: "10.0000",
          paidInterestToDate: "5.0000",
          status: "pagado",
        },
        {
          periodIndex: 2,
          dueOn: "2026-09-02",
          principalDue: "10.0000",
          interestDue: "4.5000",
          paidPrincipalToDate: "0.0000",
          paidInterestToDate: "0.0000",
          status: "pendiente",
        },
      ],
      fees: [{ feeKind: "admin", amount: "1.0000", paidToDate: "1.0000", datedOn: "2026-08-02" }],
      repayments: [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        amount: "16.0000",
        appliedToFee: "1.0000",
        appliedToInterest: "5.0000",
        appliedToPrincipal: "10.0000",
        datedOn: "2026-07-02",
        reversesId: null,
        reverseReason: null,
      }],
      accruals: [{
        accruedOn: "2026-08-02",
        interestAmount: "5.0000",
        principalBasis: "100.0000",
      }],
    }),
  }),
}));

describe("ScrLoanDetailPage", () => {
  it("formats loan money and rate values for treasurer readability", async () => {
    const { container } = render(await ScrLoanDetailPage({
      params: Promise.resolve({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      searchParams: Promise.resolve({
        repayment: "1",
        fee: "1.0000",
        interest: "5.0000",
        principal: "10.0000",
        remaining: "90.0000",
      }),
    }));

    expect(screen.getAllByText("$10,00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$5,00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$1,00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Cuota a pagar")).toHaveLength(2);
    expect(screen.getAllByText("$16,00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("$14,50").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Ya registrado")).toHaveLength(2);
    expect(screen.getAllByText("Falta pagar")).toHaveLength(2);
    expect(screen.getAllByText("$0,00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("5%")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("10.0000");
    expect(container).not.toHaveTextContent("5.0000");
    expect(container).not.toHaveTextContent("0.0000");
    expect(container).not.toHaveTextContent("5.0000%");
  });
});
