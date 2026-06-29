"use server";

import { redirect } from "next/navigation";
import { addMemberFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function addMemberAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = addMemberFormSchema.parse(formDataToObject(formData));
  const row = await createLedgerService().createMemberWithAudit(session.orgId, session.actorId, parsed);
  redirect(`/socias?nueva=${row.id}`);
}
