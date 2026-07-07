"use server";

import { resetTreasurerLoginAction as runResetTreasurerLoginAction } from "../admin-auth-actions";

export async function resetTreasurerLoginAction(formData: FormData): Promise<never> {
  return runResetTreasurerLoginAction(formData);
}
