"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createReportingService } from "@mi-banquito/domain";

import { requireTreasurer } from "@/lib/auth/require-session";
import { uploadMonthlyMemberArtifact } from "@/lib/monthly-member-artifact";

export async function generateMemberStatementsAction(formData: FormData) {
  const session = await requireTreasurer();
  const periodCloseId = String(formData.get("periodCloseId") ?? "");
  await createReportingService().generateMonthlyMemberStatements({
    orgId: session.orgId,
    actorId: session.actorId,
    periodCloseId,
    memberId: String(formData.get("memberId") ?? "") || undefined,
    createArtifact: uploadMonthlyMemberArtifact,
  });
  revalidatePath("/estados");
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
