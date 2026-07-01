import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string): never => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const revalidatePath = vi.fn();
const recordContribution = vi.fn();
const requireTreasurer = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("@mi-banquito/domain", () => ({
  createLedgerService: () => ({
    recordContribution,
  }),
}));

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => requireTreasurer(),
}));

function baseFormData() {
  const formData = new FormData();
  formData.set("clientRequestId", "11111111-1111-4111-8111-111111111111");
  formData.set("memberId", "22222222-2222-4222-8222-222222222222");
  formData.set("amount", "10.00");
  formData.set("datedOn", "2026-07-01");
  formData.set("kind", "regular");
  formData.set("notes", "");
  return formData;
}

describe("recordContributionAction", () => {
  beforeEach(() => {
    redirect.mockClear();
    revalidatePath.mockClear();
    recordContribution.mockReset();
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

    expect(recordContribution).not.toHaveBeenCalled();
    expect(decodeURIComponent(redirect.mock.calls[0]?.[0] ?? "")).toContain(
      "Para transferencia bancaria o depósito desde caja chica, registra un comprobante antes de guardar el aporte.",
    );
  });
});
