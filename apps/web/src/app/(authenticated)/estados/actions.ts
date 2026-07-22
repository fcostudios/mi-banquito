"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createReportingService } from "@mi-banquito/domain";

import { requireTreasurer } from "@/lib/auth/require-session";
import { deleteMonthlyMemberArtifact, uploadMonthlyMemberArtifact } from "@/lib/monthly-member-artifact";
import { ROUTE_SCR_STATEMENTS_ARCHIVE } from "@/lib/routes";
import { executeGenerateMemberStatementsAction } from "./generate-statements";

export async function generateMemberStatementsAction(formData: FormData) {
  await executeGenerateMemberStatementsAction(formData, uploadMonthlyMemberArtifact, deleteMonthlyMemberArtifact);
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
  revalidatePath(ROUTE_SCR_STATEMENTS_ARCHIVE);
}
