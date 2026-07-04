import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentEcuadorDateString } from "@mi-banquito/contracts";

const redirect = vi.fn((path: string): never => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const revalidatePath = vi.fn();
const markPromise = vi.fn();
const buildChaseAttempt = vi.fn();
const recordChaseAttempt = vi.fn();
const requireTreasurer = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("@mi-banquito/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mi-banquito/domain")>();
  return {
    ...actual,
    createCollectionsService: () => ({
      markPromise,
      buildChaseAttempt,
      recordChaseAttempt,
    }),
  };
});

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => requireTreasurer(),
}));

const orgId = "11111111-1111-4111-8111-111111111111";
const actorId = "33333333-3333-4333-8333-333333333333";
const memberId = "22222222-2222-4222-8222-222222222222";
const loanId = "44444444-4444-4444-8444-444444444444";

function promiseFormData() {
  const formData = new FormData();
  formData.set("memberId", memberId);
  formData.set("loanId", loanId);
  formData.set("cycleId", "");
  formData.set("periodLabel", "Cuota 2");
  formData.set("promisedOn", "2099-01-01");
  formData.set("note", "Paga en reunion");
  return formData;
}

function chaseFormData() {
  const formData = new FormData();
  formData.set("memberId", memberId);
  formData.set("loanId", loanId);
  formData.set("cycleId", "");
  formData.set("memberName", "Nombre manipulado");
  formData.set("whatsappNumber", "+593000000000");
  formData.set("periodLabel", "Periodo manipulado");
  return formData;
}

describe("atrasos actions", () => {
  beforeEach(() => {
    redirect.mockClear();
    revalidatePath.mockClear();
    markPromise.mockReset();
    buildChaseAttempt.mockReset();
    recordChaseAttempt.mockReset();
    requireTreasurer.mockReset();
    requireTreasurer.mockResolvedValue({ orgId, actorId });
  });

  it("saves a promise with Ecuador-local today and redirects with visible success", async () => {
    const { markPromiseAction } = await import("./actions");
    markPromise.mockResolvedValue({ promiseId: "55555555-5555-4555-8555-555555555555" });

    await expect(markPromiseAction(promiseFormData())).rejects.toThrow("NEXT_REDIRECT:/atrasos?promise=1");

    expect(markPromise).toHaveBeenCalledWith({
      orgId,
      actorId,
      memberId,
      loanId,
      cycleId: "",
      periodLabel: "Cuota 2",
      promisedOn: "2099-01-01",
      note: "Paga en reunion",
      todayIso: currentEcuadorDateString(),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/atrasos");
    expect(revalidatePath).toHaveBeenCalledWith("/historial");
  });

  it("shows friendly promise errors instead of technical domain names", async () => {
    const { markPromiseAction } = await import("./actions");
    markPromise.mockRejectedValue(new Error("collections_obligation_not_found"));

    await expect(markPromiseAction(promiseFormData())).rejects.toThrow("NEXT_REDIRECT:/atrasos?error=");

    expect(decodeURIComponent(redirect.mock.calls[0]?.[0] ?? "")).toContain(
      "No se puede registrar este atraso todavía.",
    );
  });

  it("maps malformed promise input to a friendly generic message", async () => {
    const { markPromiseAction } = await import("./actions");
    const formData = promiseFormData();
    formData.set("memberId", "not-a-uuid");

    await expect(markPromiseAction(formData)).rejects.toThrow("NEXT_REDIRECT:/atrasos?error=");

    expect(decodeURIComponent(redirect.mock.calls[0]?.[0] ?? "")).toContain(
      "Revisa los datos antes de continuar.",
    );
    expect(markPromise).not.toHaveBeenCalled();
  });

  it("recomputes WhatsApp chase details on the server before auditing", async () => {
    const { recordChaseAttemptAction } = await import("./actions");
    buildChaseAttempt.mockResolvedValue({
      message: "Mensaje desde base",
      whatsappUrl: "https://wa.me/593991234567?text=Mensaje%20desde%20base",
    });

    await expect(recordChaseAttemptAction(chaseFormData())).rejects.toThrow(
      "NEXT_REDIRECT:https://wa.me/593991234567?text=Mensaje%20desde%20base",
    );

    expect(buildChaseAttempt).toHaveBeenCalledWith({
      orgId,
      memberId,
      loanId,
      cycleId: "",
      periodLabel: "Periodo manipulado",
    });
    expect(recordChaseAttempt).toHaveBeenCalledWith({
      orgId,
      actorId,
      memberId,
      loanId,
      cycleId: "",
      message: "Mensaje desde base",
      periodLabel: "Periodo manipulado",
    });
  });
});
