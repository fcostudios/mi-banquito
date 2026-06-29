"use server";

import { revalidatePath } from "next/cache";
import { groupConfigFormSchema } from "@mi-banquito/contracts";
import { createPlatformService } from "@mi-banquito/domain";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function saveAdminGroupConfigAction(orgId: string, formData: FormData) {
  const session = await requirePlatformOperator();
  const parsed = groupConfigFormSchema.parse(formDataToObject(formData));
  await createPlatformService().saveGroupConfig(
    orgId,
    parsed,
    session.actorId,
    "platform_operator",
  );
  revalidatePath(`/admin/orgs/${orgId}/config`);
}
