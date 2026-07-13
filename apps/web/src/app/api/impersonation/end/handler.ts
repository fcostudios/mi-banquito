import { NextRequest, NextResponse } from "next/server";
import { createImpersonationService } from "@mi-banquito/domain";
import {
  IMPERSONATION_COOKIE_NAME,
  readSignedImpersonationCookie,
} from "@/lib/impersonation/cookie";

type ImpersonationService = ReturnType<typeof createImpersonationService>;
type EndHandlerDeps = {
  getSession: (request: NextRequest) => Promise<{ user?: { sub?: unknown } } | null | undefined>;
  service: ImpersonationService;
  secret: string;
  now: () => Date;
};

function clearCookie(response: NextResponse): NextResponse {
  response.cookies.set(IMPERSONATION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
  return response;
}

export function createEndImpersonationHandler(deps: EndHandlerDeps) {
  return async function endImpersonation(request: NextRequest): Promise<NextResponse> {
    const session = await deps.getSession(request);
    const authSubject = typeof session?.user?.sub === "string" ? session.user.sub : null;
    const token = request.cookies.get(IMPERSONATION_COOKIE_NAME)?.value;
    if (!authSubject || !token) {
      return clearCookie(new NextResponse("Unauthorized", { status: 401 }));
    }
    const payload = readSignedImpersonationCookie(token, { secret: deps.secret, authSubject });
    if (!payload) {
      return clearCookie(new NextResponse("Invalid impersonation session", { status: 403 }));
    }

    const lifecycle = await deps.service.hasBinding({
      impersonationId: payload.impersonationId,
      orgId: payload.orgId,
      targetMembershipId: payload.targetMembershipId,
      platformOperatorId: payload.platformOperatorId,
      operatorAuthSubject: authSubject,
    });
    if (!lifecycle) {
      return clearCookie(new NextResponse("Invalid impersonation session", { status: 403 }));
    }
    if (!lifecycle.terminated) {
      await deps.service.terminate({
        impersonationId: payload.impersonationId,
        orgId: payload.orgId,
        endedByOperatorId: payload.platformOperatorId,
        kind: lifecycle.expiresAt <= deps.now() ? "expired" : "operator_exit",
      });
    }

    return clearCookie(NextResponse.redirect(new URL(`/admin/orgs/${payload.orgId}`, request.url), 303));
  };
}
