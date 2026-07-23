"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createShareOutService } from "@mi-banquito/domain";

import { requireTreasurer } from "@/lib/auth/require-session";
import { ROUTE_SCR_STATEMENTS_ARCHIVE, ROUTE_SCR_YEAR_END_SHARE_OUT } from "@/lib/routes";
import { uploadYearEndArtifact } from "@/lib/year-end-artifact";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function redirectKnownDraftError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "surplus_governance_decision_required") {
    redirect(`${ROUTE_SCR_YEAR_END_SHARE_OUT}?error=governance-required`);
  }
  if (message === "year_end_period_close_required") {
    redirect(`${ROUTE_SCR_YEAR_END_SHARE_OUT}?error=year-end-close-required`);
  }
  if (message === "share_out_exceeds_regularized_balance") {
    redirect(`${ROUTE_SCR_YEAR_END_SHARE_OUT}?error=regularized-balance`);
  }
  redirect(`${ROUTE_SCR_YEAR_END_SHARE_OUT}?error=draft-failed`);
}

function redirectKnownReversalError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "share_out_reversal_window_closed") {
    redirect(`${ROUTE_SCR_YEAR_END_SHARE_OUT}?error=reversal-window-closed`);
  }
  if (message === "share_out_reversal_reason_min_length") {
    redirect(`${ROUTE_SCR_YEAR_END_SHARE_OUT}?error=reversal-reason-min`);
  }
  if (message === "share_out_not_reversible" || message === "share_out_reversal_approval_date_required") {
    redirect(`${ROUTE_SCR_YEAR_END_SHARE_OUT}?error=reversal-not-allowed`);
  }
  redirect(`${ROUTE_SCR_YEAR_END_SHARE_OUT}?error=reversal-failed`);
}

export async function runShareOutDraftAction(formData: FormData) {
  const session = await requireTreasurer();
  const year = Number(formData.get("year"));
  const clientRequestId = String(formData.get("clientRequestId") ?? "");
  if (!Number.isInteger(year) || !uuidPattern.test(clientRequestId)) {
    redirect(`${ROUTE_SCR_YEAR_END_SHARE_OUT}?error=draft-invalid`);
  }
  try {
    await createShareOutService().runDraft({
      orgId: session.orgId,
      actorId: session.actorId,
      year,
      clientRequestId,
    });
  } catch (error) {
    redirectKnownDraftError(error);
  }
  revalidatePath(ROUTE_SCR_YEAR_END_SHARE_OUT);
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
  revalidatePath(ROUTE_SCR_YEAR_END_SHARE_OUT);
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
  revalidatePath(ROUTE_SCR_YEAR_END_SHARE_OUT);
  revalidatePath(ROUTE_SCR_STATEMENTS_ARCHIVE);
}

export async function reverseShareOutAction(formData: FormData) {
  const session = await requireTreasurer();
  const shareOutId = String(formData.get("shareOutId") ?? "");
  if (!uuidPattern.test(shareOutId)) {
    redirect(`${ROUTE_SCR_YEAR_END_SHARE_OUT}?error=reversal-invalid-share-out`);
  }
  let reversed = false;
  try {
    const result = await createShareOutService().reverseApprovedShareOut({
      orgId: session.orgId,
      actorId: session.actorId,
      shareOutId,
      reason: String(formData.get("reason") ?? ""),
      createArtifact: uploadYearEndArtifact,
    });
    reversed = result.reversed;
  } catch (error) {
    redirectKnownReversalError(error);
  }
  revalidatePath(ROUTE_SCR_YEAR_END_SHARE_OUT);
  revalidatePath(ROUTE_SCR_STATEMENTS_ARCHIVE);
  redirect(`${ROUTE_SCR_YEAR_END_SHARE_OUT}?reversed=${reversed ? "1" : "already"}`);
}
