"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createShareOutService } from "@mi-banquito/domain";

import { requireTreasurer } from "@/lib/auth/require-session";
import { uploadYearEndArtifact } from "@/lib/year-end-artifact";

function redirectKnownDraftError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "surplus_governance_decision_required") {
    redirect("/reparto?error=governance-required");
  }
  if (message === "year_end_period_close_required") {
    redirect("/reparto?error=year-end-close-required");
  }
  redirect("/reparto?error=draft-failed");
}

export async function runShareOutDraftAction(formData: FormData) {
  const session = await requireTreasurer();
  const year = Number(formData.get("year"));
  try {
    await createShareOutService().runDraft({ orgId: session.orgId, actorId: session.actorId, year });
  } catch (error) {
    redirectKnownDraftError(error);
  }
  revalidatePath("/reparto");
}

export async function overrideShareOutLineAction(formData: FormData) {
  const session = await requireTreasurer();
  await createShareOutService().overrideLine({
    orgId: session.orgId,
    actorId: session.actorId,
    lineId: String(formData.get("lineId") ?? ""),
    overrideAmount: String(formData.get("overrideAmount") ?? "0"),
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath("/reparto");
}

export async function approveShareOutAction(formData: FormData) {
  const session = await requireTreasurer();
  if (formData.get("confirmApproval") !== "yes") {
    throw new Error("share_out_confirmation_required");
  }
  await createShareOutService().approve({
    orgId: session.orgId,
    actorId: session.actorId,
    shareOutId: String(formData.get("shareOutId") ?? ""),
    createArtifact: uploadYearEndArtifact,
  });
  revalidatePath("/reparto");
  revalidatePath("/estados");
}
