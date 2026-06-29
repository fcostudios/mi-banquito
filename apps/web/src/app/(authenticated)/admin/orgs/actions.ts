"use server";

import { redirect } from "next/navigation";
import { organizationCreateFormSchema } from "@mi-banquito/contracts";
import {
  createPlatformService,
  type Auth0OrgProvisioner,
} from "@mi-banquito/domain";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import { formDataToObject } from "@/lib/forms/sprint1";

const auth0OrgProvisioner: Auth0OrgProvisioner = {
  async createOrganization() {
    // Auth0 Organizations can be replaced by the documented single-tenant fallback.
    return {};
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
