"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { memberPaymentFormSchema } from "@mi-banquito/contracts";
import { createPaymentService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

function contributionErrorCode(error: unknown): string {
  if (error instanceof ZodError) {
    const requiresSlip = error.issues.some((issue) => issue.path[0] === "slipPhotoId");
    return requiresSlip ? "slip-required" : "invalid-form";
  }
  if (error instanceof Error) {
    if (error.message === "deposit_group_account_required") return "group-account-required";
    if (error.message === "deposit_account_unavailable") return "account-unavailable";
    if (error.message === "group_config_not_found") return "group-config-required";
    if (error.message.startsWith("payment_contribution_cycle_required")) return "cycle-required";
    if (error.message === "payment_idempotency_conflict") return "idempotency-conflict";
  }
  return "action-failed";
}

function confirmationRedirect(input: Record<string, unknown>): string {
  const params = new URLSearchParams({ confirm: "1" });
  for (const key of [
    "clientRequestId",
    "memberId",
    "accountId",
    "amount",
    "datedOn",
    "paymentSource",
    "slipPhotoId",
    "notes",
    "targetLoanId",
    "targetCycleId",
  ]) {
    const value = input[key];
    if (typeof value === "string" && value) {
      params.set(key, value);
    }
  }
  return `/aportes/registrar?${params.toString()}`;
}

export async function recordContributionAction(formData: FormData) {
  const session = await requireTreasurer();
  let receiptId: string;
  let memberId: string;
  try {
    const raw = formDataToObject(formData);
    const parsed = memberPaymentFormSchema.parse(raw);
    const result = await createPaymentService().recordMemberPayment({
      ...parsed,
      orgId: session.orgId,
      actorId: session.actorId,
    });
    receiptId = result.receiptId;
    memberId = parsed.memberId;
  } catch (error) {
    if (error instanceof Error && error.message === "payment_extra_decision_required") {
      redirect(confirmationRedirect(formDataToObject(formData)));
    }
    const errorCode = contributionErrorCode(error);
    if (errorCode === "action-failed") {
      console.error("member_payment.record_failed", {
        orgId: session.orgId,
        errorCode,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
    }
    redirect(`/aportes/registrar?error=${errorCode}`);
  }
  revalidatePath("/aportes");
  revalidatePath("/atrasos");
  revalidatePath("/historial");
  revalidatePath("/liquidez");
  redirect(`/historial?actionKind=payment.receipt.recorded&memberId=${memberId}&saved=${receiptId}`);
}
