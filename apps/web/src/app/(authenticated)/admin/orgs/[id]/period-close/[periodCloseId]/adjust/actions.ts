"use server";

import { revalidatePath } from "next/cache";
import { createReconciliationService } from "@mi-banquito/domain";
import { requirePlatformOperator } from "@/lib/auth/require-session";

export async function openAdjustmentPeriodAction(orgId: string, periodCloseId: string, formData: FormData) {
  const session = await requirePlatformOperator();
  await createReconciliationService().openAdjustmentPeriod({
    orgId,
    periodCloseId,
    actorId: session.actorId,
    reason: String(formData.get("reason") ?? ""),
    confirmed: formData.get("confirmed") === "true",
  });
  revalidatePath(`/admin/orgs/${orgId}/period-close/${periodCloseId}/adjust`);
}
