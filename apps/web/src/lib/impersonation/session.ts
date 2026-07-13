import { cookies } from "next/headers";
import { createImpersonationService } from "@mi-banquito/domain/impersonation";

import {
  IMPERSONATION_COOKIE_NAME,
  readSignedImpersonationCookie,
} from "./cookie";

export type ActiveImpersonationSession = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createImpersonationService>["resolve"]>>
>;

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

  return createImpersonationService().resolve({
    impersonationId: payload.impersonationId,
    orgId: payload.orgId,
    targetMembershipId: payload.targetMembershipId,
    platformOperatorId: payload.platformOperatorId,
    operatorAuthSubject: authSubject,
  });
}
