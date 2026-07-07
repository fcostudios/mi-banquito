import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string): never => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const revalidatePath = vi.fn();
const reverseApprovedShareOut = vi.fn();
const requireTreasurer = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("@mi-banquito/domain", () => ({
  createShareOutService: () => ({
    reverseApprovedShareOut,
  }),
}));

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => requireTreasurer(),
}));

function reversalFormData() {
  const formData = new FormData();
  formData.set("shareOutId", "11111111-1111-4111-8111-111111111111");
  formData.set("reason", "Acta corrigió reparto anual");
  return formData;
}

describe("reverseShareOutAction", () => {
  beforeEach(() => {
    redirect.mockClear();
    revalidatePath.mockClear();
    reverseApprovedShareOut.mockReset();
    requireTreasurer.mockReset();
    requireTreasurer.mockResolvedValue({
      orgId: "11111111-1111-4111-8111-111111111111",
      actorId: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("reverses the share-out, revalidates reparto and estados, and redirects with a success flag", async () => {
    reverseApprovedShareOut.mockResolvedValueOnce({ reversed: true });
    const { reverseShareOutAction } = await import("./actions");

    await expect(reverseShareOutAction(reversalFormData())).rejects.toThrow("NEXT_REDIRECT:/reparto?reversed=1");

    expect(reverseApprovedShareOut).toHaveBeenCalledWith({
      orgId: "11111111-1111-4111-8111-111111111111",
      actorId: "33333333-3333-4333-8333-333333333333",
      shareOutId: "11111111-1111-4111-8111-111111111111",
      reason: "Acta corrigió reparto anual",
      createArtifact: expect.any(Function),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/reparto");
    expect(revalidatePath).toHaveBeenCalledWith("/estados");
  });

  it("redirects known reversal errors back to reparto", async () => {
    reverseApprovedShareOut.mockRejectedValueOnce(new Error("share_out_reversal_window_closed"));
    const { reverseShareOutAction } = await import("./actions");

    await expect(reverseShareOutAction(reversalFormData()))
      .rejects.toThrow("NEXT_REDIRECT:/reparto?error=reversal-window-closed");
  });

  it("redirects invalid shareOutId without calling the service", async () => {
    const { reverseShareOutAction } = await import("./actions");
    const formData = reversalFormData();
    formData.set("shareOutId", "");

    await expect(reverseShareOutAction(formData))
      .rejects.toThrow("NEXT_REDIRECT:/reparto?error=reversal-invalid-share-out");

    expect(reverseApprovedShareOut).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
