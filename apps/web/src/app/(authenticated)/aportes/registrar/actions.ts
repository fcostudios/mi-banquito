"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { contributionFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
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

export async function recordContributionAction(formData: FormData) {
  const session = await requireTreasurer();
  try {
    const parsed = contributionFormSchema.parse(formDataToObject(formData));
    await createLedgerService().recordContribution(session.orgId, session.actorId, parsed);
  } catch (error) {
    redirect(`/aportes/registrar?error=${encodeURIComponent(contributionErrorMessage(error))}`);
  }
  revalidatePath("/aportes");
  revalidatePath("/historial");
}
