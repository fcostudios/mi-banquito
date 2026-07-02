"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loanRepaymentFormSchema } from "@mi-banquito/contracts";
import { createLoanService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

export async function recordRepaymentAction(formData: FormData) {
  const session = await requireTreasurer();
  const parsed = loanRepaymentFormSchema.parse(formDataToObject(formData));
  const result = await createLoanService().recordRepayment({
    ...parsed,
    orgId: session.orgId,
    actorId: session.actorId,
  });
  revalidatePath("/prestamos");
  revalidatePath(`/prestamos/${parsed.loanId}`);
  const params = new URLSearchParams({
    repayment: result.repaymentId,
    fee: result.split.appliedToFee,
    interest: result.split.appliedToInterest,
    principal: result.split.appliedToPrincipal,
    remaining: result.split.remainingPrincipal,
  });
  redirect(`/prestamos/${parsed.loanId}?${params.toString()}`);
}
