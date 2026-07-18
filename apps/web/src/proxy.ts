import { NextResponse, type NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";
import { enforceImpersonationReadOnly } from "@/lib/impersonation/proxy-policy";

type ProxyDependencies = {
  secret: string;
  now: () => Date;
  getAuthSubject: (request: NextRequest) => Promise<string | null>;
  authMiddleware: (request: NextRequest) => Promise<NextResponse>;
};

function isDurableExportDownload(request: NextRequest) {
  return request.method === "GET"
    && /^\/admin\/orgs\/[^/]+\/export\/[^/]+\/?$/.test(request.nextUrl.pathname)
    && !request.nextUrl.searchParams.get("request");
}

export async function routeProxyRequest(request: NextRequest, dependencies: ProxyDependencies) {
  if (isDurableExportDownload(request)) return NextResponse.next();
  return enforceImpersonationReadOnly(request, dependencies);
}

export async function proxy(request: NextRequest) {
  return routeProxyRequest(request, {
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
