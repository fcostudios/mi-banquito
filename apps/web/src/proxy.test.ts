import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import { signImpersonationCookie } from "@/lib/impersonation/cookie";
import { enforceImpersonationReadOnly } from "@/lib/impersonation/proxy-policy";

const secret = "impersonation-cookie-secret-at-least-32-bytes";
const now = new Date("2026-07-13T03:00:00.000Z");
const subject = "auth0|operator-1";

function token() {
  return signImpersonationCookie({
    version: 1,
    impersonationId: randomUUID(),
    orgId: randomUUID(),
    targetMembershipId: randomUUID(),
    platformOperatorId: randomUUID(),
    authSubject: subject,
    issuedAt: now.getTime(),
    expiresAt: now.getTime() + 15 * 60_000,
  }, secret);
}

function request(path: string, method = "GET", value = token(), headers?: HeadersInit) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      cookie: `mi_banquito_impersonation=${value}`,
      ...headers,
    },
  });
}

const deps = {
  secret,
  now: () => now,
  getAuthSubject: async () => subject,
  authMiddleware: async () => NextResponse.next(),
};

describe("global impersonation proxy enforcement", () => {
  it.each([
    ["existing account action", "/cuentas", "POST", undefined],
    ["new movement action", "/movimientos/registrar", "POST", undefined],
    ["arbitrary future endpoint", "/api/future-write", "POST", undefined],
    ["server action transport", "/", "POST", { "next-action": "future-action-id" }],
    ["unsafe method", "/api/members/1", "DELETE", undefined],
    ["mutating cron GET", "/api/cron/daily", "GET", undefined],
    ["Auth0 login", "/auth/login", "GET", undefined],
    ["Auth0 callback", "/auth/callback", "GET", undefined],
    ["nested auth route", "/auth/logout/complete", "GET", undefined],
  ])("blocks %s without per-action registration", async (_label, path, method, headers) => {
    const response = await enforceImpersonationReadOnly(request(path, method, token(), headers), deps);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Impersonation is read-only.");
  });

  it.each([
    ["/api/impersonation/end", "POST"],
    ["/auth/logout", "GET"],
    ["/", "GET"],
  ])("allows the explicit lifecycle/read route %s", async (path, method) => {
    expect((await enforceImpersonationReadOnly(request(path, method), deps)).status).toBe(200);
  });

  it("clears a tampered token and never passes an unsafe request", async () => {
    const valid = token();
    const tampered = `${valid.slice(0, -1)}${valid.endsWith("a") ? "b" : "a"}`;
    const response = await enforceImpersonationReadOnly(request("/api/future-write", "POST", tampered), deps);

    expect(response.status).toBe(403);
    expect(response.cookies.get("mi_banquito_impersonation")?.value).toBe("");
  });

  it("clears a cookie bound to a different authenticated subject", async () => {
    const response = await enforceImpersonationReadOnly(request("/", "GET"), {
      ...deps,
      getAuthSubject: async () => "auth0|someone-else",
    });

    expect(response.status).toBe(200);
    expect(response.cookies.get("mi_banquito_impersonation")?.value).toBe("");
  });

  it("clears a tampered cookie on a read GET and continues safely", async () => {
    const valid = token();
    const tampered = `${valid.slice(0, -1)}${valid.endsWith("a") ? "b" : "a"}`;

    const response = await enforceImpersonationReadOnly(request("/socias", "GET", tampered), deps);

    expect(response.status).toBe(200);
    expect(response.cookies.get("mi_banquito_impersonation")?.value).toBe("");
  });

  it("bypasses only the route-authorized export download stream", async () => {
    Object.assign(process.env, {
      APP_BASE_URL: "http://localhost:3100",
      AUTH0_CLIENT_ID: "test-client",
      AUTH0_CLIENT_SECRET: "test-client-secret",
      AUTH0_DOMAIN: "example.auth0.com",
      AUTH0_SECRET: "0123456789abcdef0123456789abcdef",
      CRON_SECRET: "test-cron-secret",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/test",
    });
    const { config, routeProxyRequest } = await import("./proxy");
    const exportPath = `/admin/orgs/${randomUUID()}/export/${randomUUID()}`;

    let authMiddlewareCalls = 0;
    const proxyDeps = {
      secret,
      now: () => now,
      getAuthSubject: async () => null,
      authMiddleware: async () => {
        authMiddlewareCalls += 1;
        return NextResponse.next();
      },
    };

    const downloadResponse = await routeProxyRequest(
      new NextRequest(`https://example.test${exportPath}`),
      proxyDeps,
    );

    expect(downloadResponse.headers.get("x-middleware-next")).toBe("1");
    expect(authMiddlewareCalls).toBe(0);

    await routeProxyRequest(
      new NextRequest(`https://example.test${exportPath}?request=`),
      proxyDeps,
    );

    expect(authMiddlewareCalls).toBe(0);

    await routeProxyRequest(
      new NextRequest(`https://example.test${exportPath}?request=signed`),
      proxyDeps,
    );
    await routeProxyRequest(
      new NextRequest(`https://example.test/admin/orgs/${randomUUID()}/export`),
      proxyDeps,
    );

    expect(authMiddlewareCalls).toBe(2);

    expect(unstable_doesMiddlewareMatch({ config, url: `https://example.test${exportPath}` })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: `https://example.test${exportPath}?request=signed` })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: `https://example.test/admin/orgs/${randomUUID()}/export` })).toBe(true);
  });
});
