"use server";

import { redirect } from "next/navigation";
import { firstRunCompleteFormSchema, firstRunNameFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function saveFirstRunNameAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = firstRunNameFormSchema.parse(formDataToObject(formData));
  await createLedgerService().saveFirstRunName(session.orgId, session.actorId, parsed);
  redirect("/bienvenida?paso=reglas");
}

export async function completeFirstRunAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = firstRunCompleteFormSchema.parse(formDataToObject(formData));
  await createLedgerService().completeFirstRun(session.orgId, session.actorId, parsed);
  redirect("/");
}
