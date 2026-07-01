"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { loanOriginationFormSchema } from "@mi-banquito/contracts";
import { createLoanService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

const isSpanishEligibilityMessage = (message: string): boolean => {
  return /[áéíóúñ]|No hay|Selecciona|El monto|Configura/i.test(message);
};

export async function originateLoanAction(formData: FormData) {
  const session = await requireTreasurer();
  let loanId: string;
  try {
    const parsed = loanOriginationFormSchema.parse(formDataToObject(formData));
    const result = await createLoanService().originateLoan({
      ...parsed,
      orgId: session.orgId,
      actorId: session.actorId,
    });
    loanId = result.loanId;
  } catch (error) {
    const message = error instanceof ZodError
      ? "Revisa los datos del préstamo antes de continuar."
      : error instanceof Error
        ? isSpanishEligibilityMessage(error.message)
          ? error.message
          : "No se pudo registrar el préstamo. Revisa la socia, la garante y los datos requeridos."
        : "No se pudo registrar el préstamo.";
    redirect(`/prestamos/nuevo?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/prestamos");
  redirect(`/prestamos/${loanId}`);
}
