"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { baseFundQuotaPaymentFormSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";
import { deleteExpenseSlip, uploadContributionSlip } from "@/lib/expense-slip-storage";

export async function recordBaseFundQuotaPaymentAction(formData: FormData) {
  const session = await requireTreasurer();
  let uploadedSlip: Awaited<ReturnType<typeof uploadContributionSlip>> | undefined;
  try {
    const raw = formDataToObject(formData);
    const slipValue = formData.get("slipPhoto");
    let slipPhotoId = "";
    if (slipValue instanceof File && slipValue.size > 0) {
      slipPhotoId = randomUUID();
      uploadedSlip = await uploadContributionSlip({
        orgId: session.orgId,
        clientRequestId: randomUUID(),
        file: slipValue,
      });
      raw.slipPhotoId = slipPhotoId;
    }
    const parsed = baseFundQuotaPaymentFormSchema.parse(raw);
    await createLedgerService().recordBaseFundQuotaPayment(session.orgId, session.actorId, {
      ...parsed,
      slipPhoto: uploadedSlip ? { id: slipPhotoId, ...uploadedSlip } : undefined,
    });
    revalidatePath("/cuota-base/registrar");
    revalidatePath("/liquidez");
  } catch (error) {
    if (uploadedSlip) await deleteExpenseSlip(uploadedSlip.uri).catch(() => undefined);
    throw error;
  }
}
