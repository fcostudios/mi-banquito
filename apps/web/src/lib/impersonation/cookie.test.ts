import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  IMPERSONATION_COOKIE_NAME,
  signImpersonationCookie,
  verifyImpersonationCookie,
} from "./cookie";

const secret = "impersonation-cookie-secret-at-least-32-bytes";
const now = new Date("2026-07-13T03:00:00.000Z");
const payload = {
  version: 1 as const,
  impersonationId: randomUUID(),
  orgId: randomUUID(),
  targetMembershipId: randomUUID(),
  platformOperatorId: randomUUID(),
  authSubject: "auth0|operator-1",
  issuedAt: now.getTime(),
  expiresAt: now.getTime() + 15 * 60_000,
};

describe("impersonation cookie", () => {
  it("round-trips a subject-bound short-lived payload", () => {
    const token = signImpersonationCookie(payload, secret);

    expect(IMPERSONATION_COOKIE_NAME).toBe("mi_banquito_impersonation");
    expect(verifyImpersonationCookie(token, { secret, now, authSubject: payload.authSubject })).toEqual(payload);
  });

  it("rejects tampering and the wrong Auth0 subject", () => {
    const token = signImpersonationCookie(payload, secret);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(verifyImpersonationCookie(tampered, { secret, now, authSubject: payload.authSubject })).toBeNull();
    expect(verifyImpersonationCookie(token, { secret, now, authSubject: "auth0|different" })).toBeNull();
  });

  it("rejects expired, not-yet-issued, and overlong tokens deterministically", () => {
    const expired = signImpersonationCookie({ ...payload, expiresAt: now.getTime() - 1 }, secret);
    const future = signImpersonationCookie({ ...payload, issuedAt: now.getTime() + 1, expiresAt: now.getTime() + 60_000 }, secret);
    const overlong = signImpersonationCookie({ ...payload, expiresAt: now.getTime() + 15 * 60_000 + 1 }, secret);

    expect(verifyImpersonationCookie(expired, { secret, now, authSubject: payload.authSubject })).toBeNull();
    expect(verifyImpersonationCookie(future, { secret, now, authSubject: payload.authSubject })).toBeNull();
    expect(verifyImpersonationCookie(overlong, { secret, now, authSubject: payload.authSubject })).toBeNull();
  });
});
