import { NextRequest, NextResponse } from "next/server";
import { createImpersonationService } from "@mi-banquito/domain";
import { auth0 } from "@/lib/auth0";
import {
  IMPERSONATION_COOKIE_NAME,
  readSignedImpersonationCookie,
} from "@/lib/impersonation/cookie";

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth0.getSession(request);
  const authSubject = typeof session?.user?.sub === "string" ? session.user.sub : null;
  const token = request.cookies.get(IMPERSONATION_COOKIE_NAME)?.value;
  if (!authSubject || !token) {
    return clearCookie(new NextResponse("Unauthorized", { status: 401 }));
  }
  const payload = readSignedImpersonationCookie(token, {
    secret: process.env.IMPERSONATION_COOKIE_SECRET ?? "",
    authSubject,
  });
  if (!payload) {
    return clearCookie(new NextResponse("Invalid impersonation session", { status: 403 }));
  }

  const service = createImpersonationService();
  const lifecycle = await service.hasBinding({
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
    await service.terminate({
      impersonationId: payload.impersonationId,
      orgId: payload.orgId,
      endedByOperatorId: payload.platformOperatorId,
      kind: lifecycle.expiresAt <= new Date() ? "expired" : "operator_exit",
    });
  }

  return clearCookie(NextResponse.redirect(
    new URL(`/admin/orgs/${payload.orgId}`, request.url),
    303,
  ));
}
