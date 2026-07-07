"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { chaseAttemptFormSchema, currentEcuadorDateString, markPromiseFormSchema } from "@mi-banquito/contracts";
import {
  createCollectionsService,
  type DateOnlyString,
  type PromiseOutcome,
} from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";
import messages from "@/lib/i18n/en-US.json";

const copy = messages.atrasos;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    if (error.message === "promise_not_found") {
      return copy.promiseNotFound;
    }
    if (error.message === "promise_not_open") {
      return copy.promiseNotOpen;
    }
    if (error.message === "promise_outcome_invalid") {
      return copy.actionInvalid;
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

function parsePromiseOutcome(values: Record<string, FormDataEntryValue>): {
  promiseId: string;
  outcome: PromiseOutcome;
} {
  const promiseId = String(values.promiseId ?? "");
  const outcome = String(values.outcome ?? "");
  if (!uuidPattern.test(promiseId) || (outcome !== "kept" && outcome !== "broken")) {
    throw new Error("promise_outcome_invalid");
  }
  return { promiseId, outcome };
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

export async function markPromiseOutcomeAction(formData: FormData) {
  const session = await requireTreasurer();
  let outcome: PromiseOutcome = "kept";

  try {
    const parsed = parsePromiseOutcome(formDataToObject(formData));
    outcome = parsed.outcome;
    await createCollectionsService().markPromiseOutcome({
      orgId: session.orgId,
      actorId: session.actorId,
      promiseId: parsed.promiseId,
      outcome: parsed.outcome,
      todayIso: currentEcuadorDateString() as DateOnlyString,
    });
  } catch (error) {
    redirect(`/atrasos?error=${encodeURIComponent(validationMessage(error))}`);
  }

  revalidateCollectionsViews();
  redirect(`/atrasos?promiseOutcome=${outcome}`);
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
