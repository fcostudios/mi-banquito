"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePlatformOperator } from "@/lib/auth/require-session";
import { generateTenantExport } from "@/lib/admin-export-service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function exportOrgData(formData: FormData) {
  const session = await requirePlatformOperator();
  const orgId = String(formData.get("orgId") ?? "");
  if (!UUID_RE.test(orgId)) redirect("/admin");

  let result;
  try {
    result = await generateTenantExport({
      orgId,
      actorId: session.actorId,
      operatorUserId: session.userId,
    });
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith("statement_artifact_")
      ? "statement_artifact"
      : "generation_failed";
    redirect(`/admin/orgs/${orgId}/export?error=${code}`);
  }

  revalidatePath(`/admin/orgs/${orgId}/export`);
  redirect(`/admin/orgs/${orgId}/export/${result.exportId}`);
}
