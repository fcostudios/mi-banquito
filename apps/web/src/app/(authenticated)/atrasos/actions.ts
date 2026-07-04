"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { chaseAttemptFormSchema, markPromiseFormSchema } from "@mi-banquito/contracts";
import { buildChaseMessage, createCollectionsService, type DateOnlyString } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";
import messages from "@/lib/i18n/en-US.json";

const copy = messages.atrasos;

function validationMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? copy.actionInvalid;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return copy.actionFailed;
}

function revalidateCollectionsViews() {
  revalidatePath("/atrasos");
  revalidatePath("/historial");
}

export async function markPromiseAction(formData: FormData) {
  const session = await requireTreasurer();

  try {
    const parsed = markPromiseFormSchema.parse(formDataToObject(formData));
    await createCollectionsService().markPromise({
      orgId: session.orgId,
      actorId: session.actorId,
      memberId: parsed.memberId,
      loanId: parsed.loanId,
      cycleId: parsed.cycleId,
      promisedOn: parsed.promisedOn as DateOnlyString,
      note: parsed.note,
    });
  } catch (error) {
    redirect(`/atrasos?error=${encodeURIComponent(validationMessage(error))}`);
  }

  revalidateCollectionsViews();
}

export async function recordChaseAttemptAction(formData: FormData) {
  const session = await requireTreasurer();
  const values = formDataToObject(formData);

  try {
    const parsed = chaseAttemptFormSchema.parse(values);
    const memberName = values.memberName?.trim() || copy.genericMember;
    const message = buildChaseMessage({
      memberName,
      reasonKind: parsed.reasonKind,
      periodLabel: parsed.periodLabel,
    });

    await createCollectionsService().recordChaseAttempt({
      orgId: session.orgId,
      actorId: session.actorId,
      memberId: parsed.memberId,
      loanId: parsed.loanId,
      cycleId: parsed.cycleId,
      message,
    });
  } catch (error) {
    redirect(`/atrasos?error=${encodeURIComponent(validationMessage(error))}`);
  }

  revalidateCollectionsViews();
}
