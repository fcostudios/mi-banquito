import type { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";
import { enforceImpersonationReadOnly } from "@/lib/impersonation/proxy-policy";

export async function proxy(request: NextRequest) {
  return enforceImpersonationReadOnly(request, {
    secret: process.env.IMPERSONATION_COOKIE_SECRET ?? "",
    now: () => new Date(),
    getAuthSubject: async (req) => {
      const session = await auth0.getSession(req);
      return typeof session?.user?.sub === "string" ? session.user.sub : null;
    },
    authMiddleware: (req) => auth0.middleware(req),
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
