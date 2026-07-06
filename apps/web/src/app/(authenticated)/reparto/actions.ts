"use server";

import { revalidatePath } from "next/cache";
import { createShareOutService } from "@mi-banquito/domain";

import { requireTreasurer } from "@/lib/auth/require-session";
import { uploadYearEndArtifact } from "@/lib/year-end-artifact";

export async function runShareOutDraftAction(formData: FormData) {
  const session = await requireTreasurer();
  const year = Number(formData.get("year"));
  await createShareOutService().runDraft({ orgId: session.orgId, actorId: session.actorId, year });
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
