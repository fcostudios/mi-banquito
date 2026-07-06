"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createReportingService } from "@mi-banquito/domain";

import { requireTreasurer } from "@/lib/auth/require-session";
import { uploadMonthlyMemberArtifact } from "@/lib/monthly-member-artifact";

export async function generateMemberStatementsAction(formData: FormData) {
  const session = await requireTreasurer();
  const periodCloseId = String(formData.get("periodCloseId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "");
  await createReportingService().generateMonthlyMemberStatements({
    orgId: session.orgId,
    actorId: session.actorId,
    periodCloseId,
    memberId: String(formData.get("memberId") ?? "") || undefined,
    createArtifact: uploadMonthlyMemberArtifact,
  });
  revalidatePath("/estados");
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    revalidatePath(returnTo.split("?")[0] || "/");
    redirect(returnTo);
  }
}

export async function shareStatementAction(formData: FormData) {
  const session = await requireTreasurer();
  const statementArchiveId = String(formData.get("statementArchiveId") ?? "");
  const result = await createReportingService().recordStatementShare({
    orgId: session.orgId,
    actorId: session.actorId,
    statementArchiveId,
  });
  if (result.whatsappUrl) {
    redirect(result.whatsappUrl);
  }
  revalidatePath("/estados");
}
