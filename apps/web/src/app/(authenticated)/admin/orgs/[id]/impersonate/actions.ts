"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createImpersonationService } from "@mi-banquito/domain";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import {
  IMPERSONATION_COOKIE_NAME,
  impersonationCookieOptions,
  signImpersonationCookie,
} from "@/lib/impersonation/cookie";

export async function startImpersonationAction(orgId: string, formData: FormData): Promise<never> {
  const operator = await requirePlatformOperator();
  const reason = typeof formData.get("reason") === "string" ? String(formData.get("reason")) : "";
  const started = await createImpersonationService().start({
    orgId,
    platformOperatorId: operator.actorId,
    reason,
  });
  if (!started.targetMembershipId || !started.expiresAt) {
    throw new Error("impersonation_start_missing_binding");
  }
  const token = signImpersonationCookie({
    version: 1,
    impersonationId: started.id,
    orgId: started.orgId,
    targetMembershipId: started.targetMembershipId,
    platformOperatorId: started.platformOperatorId,
    authSubject: operator.userId,
    issuedAt: started.startedAt.getTime(),
    expiresAt: started.expiresAt.getTime(),
  }, process.env.IMPERSONATION_COOKIE_SECRET ?? "");
  (await cookies()).set(
    IMPERSONATION_COOKIE_NAME,
    token,
    impersonationCookieOptions(started.expiresAt),
  );
  redirect("/");
}
