"use server";

import { revalidatePath } from "next/cache";
import { reverseContributionFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function reverseContributionAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = reverseContributionFormSchema.parse(formDataToObject(formData));
  await createLedgerService().reverseContribution(session.orgId, session.actorId, parsed);
  revalidatePath("/historial");
  revalidatePath("/atrasos");
  revalidatePath("/socias");
  revalidatePath("/");
}
