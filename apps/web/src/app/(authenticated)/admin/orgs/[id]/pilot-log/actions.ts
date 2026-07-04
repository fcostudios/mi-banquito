"use server";

import { revalidatePath } from "next/cache";
import { pilotLogEntryFormSchema } from "@mi-banquito/contracts";
import { createPilotService } from "@mi-banquito/domain";

import { requirePlatformOperator } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function addPilotLogEntryAction(formData: FormData) {
  const session = await requirePlatformOperator();
  const orgId = String(formData.get("orgId") ?? "");
  const parsed = pilotLogEntryFormSchema.parse(formDataToObject(formData));

  await createPilotService().addEntry({
    orgId,
    actorId: session.actorId,
    observedOn: parsed.observedOn,
    vocabularyAnswer: parsed.vocabularyAnswer,
    paperValue: parsed.paperValue,
    systemValue: parsed.systemValue,
    discrepancy: parsed.discrepancy,
    wouldNotReturnToPaper: parsed.wouldNotReturnToPaper === "yes",
    cleanMonth: parsed.cleanMonth === "yes",
    note: parsed.note || null,
  });

  revalidatePath(`/admin/orgs/${orgId}/pilot-log`);
}
