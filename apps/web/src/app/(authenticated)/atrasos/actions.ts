"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { chaseAttemptFormSchema, currentEcuadorDateString, markPromiseFormSchema } from "@mi-banquito/contracts";
import {
  createCollectionsService,
  type DateOnlyString,
} from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";
import messages from "@/lib/i18n/en-US.json";

const copy = messages.atrasos;

function validationMessage(error: unknown): string {
  if (error instanceof ZodError) {
    const message = error.issues[0]?.message;
    return message?.startsWith("Elige ") || message?.startsWith("La fecha ")
      ? message
      : copy.actionInvalid;
  }
  if (error instanceof Error) {
    if (error.message === "collections_obligation_not_found") {
      return copy.missingSource;
    }
    if (error.message === "collections_obligation_kind_not_supported") {
      return copy.unsupportedSource;
    }
    if (error.message === copy.missingContact) {
      return copy.missingContact;
    }
    return copy.actionFailed;
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
      periodLabel: parsed.periodLabel,
      promisedOn: parsed.promisedOn as DateOnlyString,
      note: parsed.note,
      todayIso: currentEcuadorDateString() as DateOnlyString,
    });
  } catch (error) {
    redirect(`/atrasos?error=${encodeURIComponent(validationMessage(error))}`);
  }

  revalidateCollectionsViews();
  redirect("/atrasos?promise=1");
}

export async function recordChaseAttemptAction(formData: FormData) {
  const session = await requireTreasurer();
  const values = formDataToObject(formData);
  let rowWhatsappUrl: string | null = null;

  try {
    const parsed = chaseAttemptFormSchema.parse(values);
    const service = createCollectionsService();
    const target = await service.buildChaseAttempt({
      orgId: session.orgId,
      memberId: parsed.memberId,
      loanId: parsed.loanId,
      cycleId: parsed.cycleId,
      periodLabel: parsed.periodLabel,
    });
    rowWhatsappUrl = target.whatsappUrl;
    if (!rowWhatsappUrl) {
      throw new Error(copy.missingContact);
    }

    await service.recordChaseAttempt({
      orgId: session.orgId,
      actorId: session.actorId,
      memberId: parsed.memberId,
      loanId: parsed.loanId,
      cycleId: parsed.cycleId,
      message: target.message,
      periodLabel: parsed.periodLabel,
    });
  } catch (error) {
    redirect(`/atrasos?error=${encodeURIComponent(validationMessage(error))}`);
  }

  revalidateCollectionsViews();
  redirect(rowWhatsappUrl);
}
