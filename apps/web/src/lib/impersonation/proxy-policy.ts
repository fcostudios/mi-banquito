import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as Response } from "next/server";

import {
  IMPERSONATION_COOKIE_NAME,
  verifyImpersonationCookie,
} from "./cookie";

const READ_ONLY_COPY = "Impersonation is read-only.";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type PolicyDeps = {
  secret: string;
  now: () => Date;
  getAuthSubject: (request: NextRequest) => Promise<string | null>;
  authMiddleware: (request: NextRequest) => Promise<NextResponse>;
};

function isAuthLifecycle(pathname: string): boolean {
  return pathname === "/auth" || pathname.startsWith("/auth/")
    || pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

function isAllowedRequest(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (isAuthLifecycle(pathname)) return true;
  if (request.method === "POST" && pathname === "/api/impersonation/end") return true;
  if (!SAFE_METHODS.has(request.method)) return false;
  if (request.method === "GET" && pathname.startsWith("/api/cron/")) return false;
  return true;
}

function clearImpersonationCookie(response: NextResponse): NextResponse {
  response.cookies.set(IMPERSONATION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
  return response;
}

function forbidden(clearCookie = false): NextResponse {
  const response = new Response(READ_ONLY_COPY, {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
  return clearCookie ? clearImpersonationCookie(response) : response;
}

export async function enforceImpersonationReadOnly(
  request: NextRequest,
  deps: PolicyDeps,
): Promise<NextResponse> {
  const token = request.cookies.get(IMPERSONATION_COOKIE_NAME)?.value;
  if (!token) return deps.authMiddleware(request);

  const authSubject = await deps.getAuthSubject(request);
  const payload = authSubject
    ? verifyImpersonationCookie(token, {
        secret: deps.secret,
        now: deps.now(),
        authSubject,
      })
    : null;
  if (!payload) {
    if (!isAllowedRequest(request)) return forbidden(true);
    return clearImpersonationCookie(await deps.authMiddleware(request));
  }
  if (!isAllowedRequest(request)) return forbidden();
  return deps.authMiddleware(request);
}
