"use server";

import { revalidatePath } from "next/cache";
import { baseFundQuotaPaymentFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function recordBaseFundQuotaPaymentAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = baseFundQuotaPaymentFormSchema.parse(formDataToObject(formData));
  await createLedgerService().recordBaseFundQuotaPayment(session.orgId, session.actorId, parsed);
  revalidatePath("/cuota-base/registrar");
}
