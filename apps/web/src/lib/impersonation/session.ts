import { cookies } from "next/headers";
import { establishTenantRequestContext } from "@mi-banquito/db/request-context";
import { createImpersonationService } from "@mi-banquito/domain/impersonation";

import {
  IMPERSONATION_COOKIE_NAME,
  readSignedImpersonationCookie,
} from "./cookie";

export type ActiveImpersonationSession = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createImpersonationService>["resolve"]>>
>;

export function establishActiveImpersonationContext(
  session: Pick<ActiveImpersonationSession, "readOnly" | "orgId" | "platformOperatorId">,
): void {
  establishTenantRequestContext({
    readOnly: session.readOnly,
    orgId: session.orgId,
    operatorId: session.platformOperatorId,
  });
}

export async function getActiveImpersonationSession(
  authSubject: string,
): Promise<ActiveImpersonationSession | null> {
  const token = (await cookies()).get(IMPERSONATION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = readSignedImpersonationCookie(token, {
    secret: process.env.IMPERSONATION_COOKIE_SECRET ?? "",
    authSubject,
  });
  if (!payload) return null;

  const active = await createImpersonationService().resolve({
    impersonationId: payload.impersonationId,
    orgId: payload.orgId,
    targetMembershipId: payload.targetMembershipId,
    platformOperatorId: payload.platformOperatorId,
    operatorAuthSubject: authSubject,
  });
  if (active) establishActiveImpersonationContext(active);
  return active;
}
