"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePlatformOperator } from "@/lib/auth/require-session";
import { createTenantExportRequest } from "@/lib/admin-export-service";

const UUID = z.string().uuid();

export async function exportOrgData(formData: FormData) {
  const session = await requirePlatformOperator();
  const orgId = String(formData.get("orgId") ?? "");
  if (!UUID.safeParse(orgId).success) redirect("/admin");
  const exportId = randomUUID();
  const request = createTenantExportRequest({
    orgId,
    exportId,
    actorId: session.actorId,
    operatorUserId: session.userId,
  });
  redirect(`/admin/orgs/${orgId}/export/${exportId}?request=${encodeURIComponent(request)}`);
}
