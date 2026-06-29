"use server";

import { revalidatePath } from "next/cache";
import { groupConfigFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function saveTreasurerGroupConfigAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = groupConfigFormSchema.parse(formDataToObject(formData));
  await createLedgerService().saveTreasurerGroupConfig(session.orgId, session.actorId, parsed);
  revalidatePath("/grupo");
}
