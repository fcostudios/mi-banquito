"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { organizationCreateFormSchema } from "@mi-banquito/contracts";
import {
  createPlatformService,
  type Auth0OrgProvisioner,
} from "@mi-banquito/domain";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import { createAuth0AdminClientFromEnv } from "@/lib/auth0/admin-client";
import { formDataToObject } from "@/lib/forms/sprint1";

const auth0OrgProvisioner: Auth0OrgProvisioner = {
  async createOrganization(input) {
    return createAuth0AdminClientFromEnv().createOrganization(input);
  },
};

export async function createOrganizationAction(formData: FormData) {
  const session = await requirePlatformOperator();
  const parsed = organizationCreateFormSchema.parse(formDataToObject(formData));
  const orgId = await createPlatformService().createOrganization(
    parsed,
    session.actorId,
    auth0OrgProvisioner,
  );
  redirect(`/admin/orgs/${orgId}`);
}

export async function updateOrganizationLifecycleAction(formData: FormData) {
  const session = await requirePlatformOperator();
  const orgId = String(formData.get("orgId") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (status !== "paused" && status !== "archived") {
    throw new Error("organization_lifecycle_status_invalid");
  }

  await createPlatformService().updateOrganizationLifecycle({
    orgId,
    actorId: session.actorId,
    status,
    reason,
  });
  revalidatePath(`/admin/orgs/${orgId}`);
  redirect(`/admin/orgs/${orgId}?lifecycle=1`);
}
