import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScrRecordRepaymentPage from "./page";

const previewMemberPayment = vi.fn();
const getLoanDetail = vi.fn();

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
    getLoanDetail,
  }),
  createPaymentService: () => ({
    previewMemberPayment,
  }),
}));

describe("ScrRecordRepaymentPage", () => {
  beforeEach(() => {
    previewMemberPayment.mockReset();
    getLoanDetail.mockReset();
    getLoanDetail.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      borrowerName: "Pancho",
      borrowerKind: "member",
      borrowerMemberId: "22222222-2222-4222-8222-222222222222",
      principalAmount: "100.0000",
      currencyCode: "USD",
      status: "activo",
      rateValue: "5.0000",
      rateModel: "declining_balance",
      termPeriods: 10,
      originatedOn: "2026-07-02",
      schedule: [],
      fees: [],
      repayments: [],
      accruals: [],
    });
  });

  it("discloses when BR-26 will cover higher-priority obligations before the target loan principal", async () => {
    previewMemberPayment.mockResolvedValue({
      receiptId: "",
      allocations: [
        {
          kind: "loan_fee",
          amount: "1.0000",
          loanId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          sortOrder: 1,
          currencyCode: "USD",
          brId: "BR-26",
          groupConfigVersion: 3,
        },
        {
          kind: "loan_principal",
          amount: "1.0000",
          loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          sortOrder: 2,
          currencyCode: "USD",
          brId: "BR-26",
          groupConfigVersion: 3,
        },
      ],
      unappliedAmount: "0.0000",
      requiresExtraDecision: false,
    });

    render(await ScrRecordRepaymentPage({
      params: Promise.resolve({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    }));

    expect(previewMemberPayment).toHaveBeenCalledWith(expect.objectContaining({
      memberId: "22222222-2222-4222-8222-222222222222",
      targetLoanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      extraDecision: "loan_principal",
    }));
    expect(screen.getByRole("status")).toHaveTextContent("BR-26 puede aplicar este pago primero");
  });

  it("uses the guarantor member id for non-member loan disclosure preview", async () => {
    getLoanDetail.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      borrowerName: "Cliente externo",
      borrowerKind: "non_member",
      borrowerMemberId: null,
      guarantorMemberId: "99999999-9999-4999-8999-999999999999",
      principalAmount: "100.0000",
      currencyCode: "USD",
      status: "activo",
      rateValue: "5.0000",
      rateModel: "declining_balance",
      termPeriods: 10,
      originatedOn: "2026-07-02",
      schedule: [],
      fees: [],
      repayments: [],
      accruals: [],
    });
    previewMemberPayment.mockResolvedValue({
      receiptId: "",
      allocations: [
        {
          kind: "loan_interest",
          amount: "1.0000",
          loanId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          sortOrder: 1,
          currencyCode: "USD",
          brId: "BR-26",
          groupConfigVersion: 3,
        },
      ],
      unappliedAmount: "0.0000",
      requiresExtraDecision: false,
    });

    render(await ScrRecordRepaymentPage({
      params: Promise.resolve({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    }));

    expect(previewMemberPayment).toHaveBeenCalledWith(expect.objectContaining({
      memberId: "99999999-9999-4999-8999-999999999999",
      targetLoanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
