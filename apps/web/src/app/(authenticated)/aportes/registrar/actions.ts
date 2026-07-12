"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { memberPaymentFormSchema } from "@mi-banquito/contracts";
import { createPaymentService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";
import messages from "@/lib/i18n/en-US.json";

const copy = messages.sprint1.contributions;

function contributionErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    const requiresSlip = error.issues.some((issue) => issue.path[0] === "slipPhotoId");
    return requiresSlip ? copy.slipRequired : copy.invalid;
  }
  return copy.failed;
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
  try {
    const raw = formDataToObject(formData);
    const parsed = memberPaymentFormSchema.parse(raw);
    await createPaymentService().recordMemberPayment({
      ...parsed,
      orgId: session.orgId,
      actorId: session.actorId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "payment_extra_decision_required") {
      redirect(confirmationRedirect(formDataToObject(formData)));
    }
    redirect(`/aportes/registrar?error=${encodeURIComponent(contributionErrorMessage(error))}`);
  }
  revalidatePath("/aportes");
  revalidatePath("/atrasos");
  revalidatePath("/historial");
  revalidatePath("/liquidez");
}
