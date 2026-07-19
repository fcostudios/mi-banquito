import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string): never => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const revalidatePath = vi.fn();
const recordMemberPayment = vi.fn();
const requireTreasurer = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("@mi-banquito/domain", () => ({
  createPaymentService: () => ({
    recordMemberPayment,
  }),
}));

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => requireTreasurer(),
}));

function baseFormData() {
  const formData = new FormData();
  formData.set("clientRequestId", "11111111-1111-4111-8111-111111111111");
  formData.set("memberId", "22222222-2222-4222-8222-222222222222");
    formData.set("accountId", "44444444-4444-4444-8444-444444444444");
    formData.set("amount", "10.00");
    formData.set("datedOn", "2026-07-01");
    formData.set("paymentSource", "cash_in_meeting");
    formData.set("notes", "");
    return formData;
}

describe("recordContributionAction", () => {
  beforeEach(() => {
    redirect.mockClear();
    revalidatePath.mockClear();
    recordMemberPayment.mockReset();
    recordMemberPayment.mockResolvedValue({
      receiptId: "66666666-6666-4666-8666-666666666666",
      allocations: [],
      unappliedAmount: "0.0000",
      requiresExtraDecision: false,
    });
    requireTreasurer.mockReset();
    requireTreasurer.mockResolvedValue({
      orgId: "11111111-1111-4111-8111-111111111111",
      actorId: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("redirects validation errors back to the aporte form instead of throwing a page error", async () => {
    const { recordContributionAction } = await import("./actions");
    const formData = baseFormData();
    formData.set("paymentSource", "bank_transfer");
    formData.set("slipPhotoId", "");

    await expect(recordContributionAction(formData)).rejects.toThrow("NEXT_REDIRECT:/aportes/registrar?error=");

    expect(recordMemberPayment).not.toHaveBeenCalled();
    expect(redirect.mock.calls[0]?.[0]).toBe("/aportes/registrar?error=slip-required");
  });

  it("records the BR-26 member payment and opens its persisted allocation history", async () => {
    const { recordContributionAction } = await import("./actions");
    const formData = baseFormData();

    await expect(recordContributionAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/historial?actionKind=payment.receipt.recorded&memberId=22222222-2222-4222-8222-222222222222&saved=66666666-6666-4666-8666-666666666666",
    );

    expect(recordMemberPayment).toHaveBeenCalledWith(expect.objectContaining({
      orgId: "11111111-1111-4111-8111-111111111111",
      actorId: "33333333-3333-4333-8333-333333333333",
      memberId: "22222222-2222-4222-8222-222222222222",
      amount: "10.00",
    }));
    expect(revalidatePath).toHaveBeenCalledWith("/aportes");
    expect(revalidatePath).toHaveBeenCalledWith("/atrasos");
    expect(revalidatePath).toHaveBeenCalledWith("/historial");
    expect(revalidatePath).toHaveBeenCalledWith("/liquidez");
    expect(redirect.mock.calls.at(-1)?.[0]).toContain("memberId=22222222-2222-4222-8222-222222222222");
  });

  it("preserves a safe domain error code when the selected account is unavailable", async () => {
    recordMemberPayment.mockRejectedValue(new Error("deposit_account_unavailable"));
    const { recordContributionAction } = await import("./actions");

    await expect(recordContributionAction(baseFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/aportes/registrar?error=account-unavailable",
    );
  });

  it("redirects to extra-money confirmation when BR-26 needs a decision", async () => {
    recordMemberPayment.mockRejectedValue(new Error("payment_extra_decision_required"));
    const { recordContributionAction } = await import("./actions");
    const formData = baseFormData();
    formData.set("paymentSource", "bank_transfer");
    formData.set("slipPhotoId", "99999999-9999-4999-8999-999999999999");
    formData.set("notes", "Comprobante revisado");

    await expect(recordContributionAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/aportes/registrar?confirm=1",
    );
    expect(redirect.mock.calls[0]?.[0]).toContain("memberId=22222222-2222-4222-8222-222222222222");
    expect(redirect.mock.calls[0]?.[0]).toContain("amount=10.00");
    expect(redirect.mock.calls[0]?.[0]).toContain("slipPhotoId=99999999-9999-4999-8999-999999999999");
    const redirectedTo = redirect.mock.calls[0]?.[0] ?? "";
    const redirectedParams = new URLSearchParams(redirectedTo.split("?")[1]);
    expect(redirectedParams.get("notes")).toBe("Comprobante revisado");
  });
});
