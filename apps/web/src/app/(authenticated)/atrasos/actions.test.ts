import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentEcuadorDateString } from "@mi-banquito/contracts";

const redirect = vi.fn((path: string): never => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const revalidatePath = vi.fn();
const markPromise = vi.fn();
const markPromiseOutcome = vi.fn();
const buildChaseAttempt = vi.fn();
const recordChaseAttempt = vi.fn();
const listAgingRows = vi.fn();
const recordMemberPayment = vi.fn();
const previewMemberPayment = vi.fn();
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
      markPromiseOutcome,
      buildChaseAttempt,
      recordChaseAttempt,
      listAgingRows,
    }),
    createPaymentService: () => ({
      previewMemberPayment,
      recordMemberPayment,
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

function promiseOutcomeFormData(outcome = "kept") {
  const formData = new FormData();
  formData.set("promiseId", "55555555-5555-4555-8555-555555555555");
  formData.set("outcome", outcome);
  return formData;
}

function overdueContributionFormData() {
  const formData = new FormData();
  formData.set("clientRequestId", "77777777-7777-4777-8777-777777777777");
  formData.set("memberId", memberId);
  formData.set("cycleId", "55555555-5555-4555-8555-555555555555");
  return formData;
}

describe("atrasos actions", () => {
  beforeEach(() => {
    redirect.mockClear();
    revalidatePath.mockClear();
    markPromise.mockReset();
    markPromiseOutcome.mockReset();
    buildChaseAttempt.mockReset();
    recordChaseAttempt.mockReset();
    listAgingRows.mockReset();
    recordMemberPayment.mockReset();
    previewMemberPayment.mockReset();
    previewMemberPayment.mockResolvedValue({
      allocations: [
        {
          kind: "contribution_overdue",
          cycleId: "55555555-5555-4555-8555-555555555555",
          amount: "20.0000",
        },
      ],
      unappliedAmount: "0.0000",
      requiresExtraDecision: false,
    });
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

  it("marks a promise outcome and redirects with visible success", async () => {
    const { markPromiseOutcomeAction } = await import("./actions");
    markPromiseOutcome.mockResolvedValue(undefined);

    await expect(markPromiseOutcomeAction(promiseOutcomeFormData("kept")))
      .rejects.toThrow("NEXT_REDIRECT:/atrasos?promiseOutcome=kept");

    expect(markPromiseOutcome).toHaveBeenCalledWith({
      orgId,
      actorId,
      promiseId: "55555555-5555-4555-8555-555555555555",
      outcome: "kept",
      todayIso: currentEcuadorDateString(),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/atrasos");
    expect(revalidatePath).toHaveBeenCalledWith("/historial");
  });

  it("maps malformed promise outcome input to a friendly generic message", async () => {
    const { markPromiseOutcomeAction } = await import("./actions");

    await expect(markPromiseOutcomeAction(promiseOutcomeFormData("unknown")))
      .rejects.toThrow("NEXT_REDIRECT:/atrasos?error=");

    expect(decodeURIComponent(redirect.mock.calls[0]?.[0] ?? "")).toContain(
      "Revisa los datos antes de continuar.",
    );
    expect(markPromiseOutcome).not.toHaveBeenCalled();
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

  it("records an overdue contribution against the source cycle and refreshes collection views", async () => {
    const { recordOverdueContributionAction } = await import("./actions");
    listAgingRows.mockResolvedValue([
      {
        memberId,
        cycleId: "55555555-5555-4555-8555-555555555555",
        periodLabel: "2026-06",
        amountDue: "20.0000",
      },
    ]);
    recordMemberPayment.mockResolvedValue({ receiptId: "66666666-6666-4666-8666-666666666666" });

    await expect(recordOverdueContributionAction(overdueContributionFormData()))
      .rejects.toThrow("NEXT_REDIRECT:/atrasos?payment=1");

    expect(recordMemberPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId,
        actorId,
        clientRequestId: "77777777-7777-4777-8777-777777777777",
        memberId,
        targetCycleId: "55555555-5555-4555-8555-555555555555",
        amount: "20.0000",
        datedOn: currentEcuadorDateString(),
        paymentSource: "cash_in_meeting",
        slipPhotoId: "",
        notes: "Pago desde atrasos: 2026-06",
      }),
    );
    expect(previewMemberPayment).toHaveBeenCalledWith(expect.objectContaining({
      targetCycleId: "55555555-5555-4555-8555-555555555555",
      amount: "20.0000",
    }));
    expect(listAgingRows).toHaveBeenCalledWith(orgId, "aporte");
    expect(revalidatePath).toHaveBeenCalledWith("/atrasos");
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/socias");
    expect(revalidatePath).toHaveBeenCalledWith("/historial");
    expect(revalidatePath).toHaveBeenCalledWith("/aportes");
  });

  it("routes overdue contribution conflicts to BR-26 confirmation with the target cycle preserved", async () => {
    const { recordOverdueContributionAction } = await import("./actions");
    listAgingRows.mockResolvedValue([
      {
        memberId,
        cycleId: "55555555-5555-4555-8555-555555555555",
        periodLabel: "2026-06",
        amountDue: "20.0000",
      },
    ]);
    recordMemberPayment.mockRejectedValue(new Error("payment_extra_decision_required"));

    await expect(recordOverdueContributionAction(overdueContributionFormData()))
      .rejects.toThrow("NEXT_REDIRECT:/aportes/registrar?confirm=1");

    const redirectedTo = redirect.mock.calls[0]?.[0] ?? "";
    const redirectedParams = new URLSearchParams(redirectedTo.split("?")[1]);
    expect(redirectedParams.get("targetCycleId")).toBe("55555555-5555-4555-8555-555555555555");
    expect(redirectedParams.get("amount")).toBe("20.0000");
    expect(redirectedParams.get("notes")).toBe("Pago desde atrasos: 2026-06");
  });

  it("routes higher-priority BR-26 allocation before the target cycle to confirmation", async () => {
    const { recordOverdueContributionAction } = await import("./actions");
    listAgingRows.mockResolvedValue([
      {
        memberId,
        cycleId: "55555555-5555-4555-8555-555555555555",
        periodLabel: "2026-06",
        amountDue: "20.0000",
      },
    ]);
    previewMemberPayment.mockResolvedValue({
      allocations: [
        {
          kind: "loan_interest",
          loanId,
          amount: "20.0000",
        },
        {
          kind: "contribution_overdue",
          cycleId: "55555555-5555-4555-8555-555555555555",
          amount: "5.0000",
        },
      ],
      unappliedAmount: "0.0000",
      requiresExtraDecision: false,
    });

    await expect(recordOverdueContributionAction(overdueContributionFormData()))
      .rejects.toThrow("NEXT_REDIRECT:/aportes/registrar?confirm=1");

    expect(recordMemberPayment).not.toHaveBeenCalled();
    const redirectedTo = redirect.mock.calls[0]?.[0] ?? "";
    const redirectedParams = new URLSearchParams(redirectedTo.split("?")[1]);
    expect(redirectedParams.get("targetCycleId")).toBe("55555555-5555-4555-8555-555555555555");
  });
});
