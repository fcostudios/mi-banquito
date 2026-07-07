"use server";

import { inviteTreasurerAction as runInviteTreasurerAction } from "../admin-auth-actions";

export async function inviteTreasurerAction(formData: FormData): Promise<never> {
  return runInviteTreasurerAction(formData);
}
