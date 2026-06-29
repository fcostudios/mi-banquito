"use server";

import { revalidatePath } from "next/cache";
import { contributionFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function recordContributionAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = contributionFormSchema.parse(formDataToObject(formData));
  await createLedgerService().recordContribution(session.orgId, session.actorId, parsed);
  revalidatePath("/aportes");
  revalidatePath("/historial");
}
