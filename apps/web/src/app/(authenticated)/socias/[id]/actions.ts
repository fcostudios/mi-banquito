"use server";

import { revalidatePath } from "next/cache";
import { memberStatusTransitionFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function transitionMemberStatusAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = memberStatusTransitionFormSchema.parse(formDataToObject(formData));
  await createLedgerService().transitionMemberStatus(session.orgId, session.actorId, parsed);
  revalidatePath(`/socias/${parsed.memberId}`);
}
