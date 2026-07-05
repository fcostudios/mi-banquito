"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createReconciliationService } from "@mi-banquito/domain";

import { requireTreasurer } from "@/lib/auth/require-session";
import { uploadMonthlyCloseArtifact } from "@/lib/monthly-close-artifact";

function requiredString(formData: FormData, name: string): string {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) {
    throw new Error(`${name}_required`);
  }
  return value;
}

function redirectWithError(message: string): never {
  redirect(`/cierre?error=${encodeURIComponent(message)}`);
}

export async function executeReconciliationAction(formData: FormData) {
  const session = await requireTreasurer();
  try {
    await createReconciliationService().executeReconciliation({
      orgId: session.orgId,
      actorId: session.actorId,
      cycleId: requiredString(formData, "cycleId"),
      declaredBankBalance: requiredString(formData, "declaredBankBalance"),
    });
  } catch {
    redirectWithError("No se pudo guardar la conciliación.");
  }

  revalidatePath("/cierre");
  redirect("/cierre?reconciled=1");
}

export async function annotateReconciliationAction(formData: FormData) {
  const session = await requireTreasurer();
  try {
    await createReconciliationService().annotateReconciliation({
      orgId: session.orgId,
      actorId: session.actorId,
      reconciliationCycleId: requiredString(formData, "reconciliationCycleId"),
      reason: requiredString(formData, "reason"),
    });
  } catch {
    redirectWithError("Escribe una nota clara antes de aceptar la diferencia.");
  }

  revalidatePath("/cierre");
  redirect("/cierre?annotated=1");
}

export async function closePeriodAction(formData: FormData) {
  const session = await requireTreasurer();
  const reconciliationCycleId = requiredString(formData, "reconciliationCycleId");
  try {
    await createReconciliationService({
      monthlyCloseArtifactWriter: uploadMonthlyCloseArtifact,
    }).closePeriod({
      orgId: session.orgId,
      actorId: session.actorId,
      reconciliationCycleId,
    });
  } catch (error) {
    console.error("monthly_close.close_failed", {
      orgId: session.orgId,
      reconciliationCycleId,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    redirectWithError("No se pudo cerrar el mes todavía.");
  }

  revalidatePath("/cierre");
  redirect("/cierre?closed=1");
}

export async function shareMonthlyCloseAction(formData: FormData) {
  const session = await requireTreasurer();
  let whatsappUrl: string;
  try {
    const result = await createReconciliationService().recordMonthlyCloseShareAttempt({
      orgId: session.orgId,
      actorId: session.actorId,
      statementArchiveId: requiredString(formData, "statementArchiveId"),
    });
    whatsappUrl = result.whatsappUrl;
  } catch {
    redirectWithError("No se pudo preparar el enlace de WhatsApp.");
  }

  redirect(whatsappUrl);
}
