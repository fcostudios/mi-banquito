import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const IMPERSONATION_COOKIE_NAME = "mi_banquito_impersonation";
export const IMPERSONATION_TTL_MS = 15 * 60_000;

const payloadSchema = z.object({
  version: z.literal(1),
  impersonationId: z.string().uuid(),
  orgId: z.string().uuid(),
  targetMembershipId: z.string().uuid(),
  platformOperatorId: z.string().uuid(),
  authSubject: z.string().min(1),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict();

export type ImpersonationCookiePayload = z.infer<typeof payloadSchema>;

function signatureFor(encodedPayload: string, secret: string): Buffer {
  if (secret.length < 32) {
    throw new Error("IMPERSONATION_COOKIE_SECRET must contain at least 32 characters");
  }
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

export function signImpersonationCookie(payload: ImpersonationCookiePayload, secret: string): string {
  const parsed = payloadSchema.parse(payload);
  const encodedPayload = Buffer.from(JSON.stringify(parsed)).toString("base64url");
  const signature = signatureFor(encodedPayload, secret).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyImpersonationCookie(
  token: string,
  input: { secret: string; now: Date; authSubject: string },
): ImpersonationCookiePayload | null {
  const payload = readSignedImpersonationCookie(token, input);
  if (!payload) return null;
  const nowMs = input.now.getTime();
  if (payload.issuedAt > nowMs || payload.expiresAt <= nowMs) return null;
  return payload;
}

export function readSignedImpersonationCookie(
  token: string,
  input: { secret: string; authSubject: string },
): ImpersonationCookiePayload | null {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;

  let suppliedSignature: Buffer;
  let expectedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "ascii");
    expectedSignature = Buffer.from(signatureFor(encodedPayload, input.secret).toString("base64url"), "ascii");
  } catch {
    return null;
  }
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = payloadSchema.parse(JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")));
    const lifetime = payload.expiresAt - payload.issuedAt;
    if (
      payload.authSubject !== input.authSubject
      || lifetime <= 0
      || lifetime > IMPERSONATION_TTL_MS
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function impersonationCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
