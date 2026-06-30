import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth0 } from "@/lib/auth0";
import { getDbOrgIdFromUser, getRolesFromUser } from "@/lib/auth/session-claims";
import { hasMinRole, type AppRole } from "@/lib/auth/roles";
import { ROUTE_ACCESS_DENIED, ROUTE_LOGIN } from "@/lib/routes";
import { db } from "@mi-banquito/db";
import { platformOperator, userAccount, userOrgMembership } from "@mi-banquito/db/schema";

export type RequiredSession = {
  userId: string;
  actorId: string;
  orgId: string;
  roles: string[];
};

export type PlatformSession = Omit<RequiredSession, "orgId"> & {
  orgId?: string;
};

type GateDenyReason =
  | "missing_user"
  | "missing_org_claim"
  | "missing_role"
  | "missing_membership"
  | "missing_platform_role"
  | "missing_platform_operator";

function logAuthGateDenied(reason: GateDenyReason, details: Record<string, unknown>) {
  console.warn("auth_gate_denied", { reason, ...details });
}

export async function requireRole(minRole: AppRole): Promise<RequiredSession> {
  const session = await auth0.getSession();
  const orgId = getDbOrgIdFromUser(session?.user);
  const roles = getRolesFromUser(session?.user);
  const userId = typeof session?.user?.sub === "string" ? session.user.sub : undefined;
  const email = typeof session?.user?.email === "string" ? session.user.email.toLowerCase() : undefined;
  const emailVerified = session?.user?.email_verified !== false;

  if (!userId) {
    logAuthGateDenied("missing_user", { hasUserId: false, hasOrgId: Boolean(orgId), roles });
    redirect(ROUTE_LOGIN);
  }

  if (!orgId) {
    logAuthGateDenied("missing_org_claim", {
      hasUserId: true,
      hasOrgId: false,
      nativeOrgId: typeof session?.user?.org_id === "string" ? session.user.org_id : undefined,
      roles,
    });
    redirect(ROUTE_ACCESS_DENIED);
  }

  if (!hasMinRole(roles, minRole)) {
    logAuthGateDenied("missing_role", { hasUserId: true, orgId, roles, minRole });
    redirect(ROUTE_ACCESS_DENIED);
  }

  let [membership] = await db
    .select({ memberId: userOrgMembership.memberId, userAccountId: userAccount.id })
    .from(userAccount)
    .innerJoin(userOrgMembership, eq(userOrgMembership.userId, userAccount.id))
    .where(and(
      eq(userAccount.authSubject, userId),
      eq(userOrgMembership.orgId, orgId),
      eq(userOrgMembership.status, "active"),
    ));

  if (!membership?.memberId && email && emailVerified) {
    const pendingAuthSubject = `pending:${email}`;
    const [pendingMembership] = await db
      .select({
        memberId: userOrgMembership.memberId,
        userAccountId: userAccount.id,
        authSubject: userAccount.authSubject,
      })
      .from(userAccount)
      .innerJoin(userOrgMembership, eq(userOrgMembership.userId, userAccount.id))
      .where(and(
        eq(userAccount.email, email),
        eq(userAccount.authSubject, pendingAuthSubject),
        eq(userAccount.status, "active"),
        eq(userOrgMembership.orgId, orgId),
        eq(userOrgMembership.status, "active"),
      ));

    if (pendingMembership?.memberId) {
      await db
        .update(userAccount)
        .set({ authSubject: userId, updatedAt: new Date() })
        .where(and(
          eq(userAccount.id, pendingMembership.userAccountId),
          eq(userAccount.authSubject, pendingAuthSubject),
        ));
      membership = pendingMembership;
    }
  }

  if (!membership?.memberId) {
    logAuthGateDenied("missing_membership", {
      hasUserId: true,
      orgId,
      roles,
      hasEmail: Boolean(email),
      emailVerified,
    });
    redirect(ROUTE_ACCESS_DENIED);
  }

  return { userId, actorId: membership.memberId, orgId, roles };
}

export async function requirePlatformOperator(): Promise<PlatformSession> {
  const session = await auth0.getSession();
  const roles = getRolesFromUser(session?.user);
  const userId = typeof session?.user?.sub === "string" ? session.user.sub : undefined;

  if (!userId) {
    logAuthGateDenied("missing_user", { hasUserId: false, roles });
    redirect(ROUTE_LOGIN);
  }

  if (!hasMinRole(roles, "PLATFORM_OPERATOR")) {
    logAuthGateDenied("missing_platform_role", { hasUserId: true, roles });
    redirect(ROUTE_ACCESS_DENIED);
  }

  const [operator] = await db
    .select({ id: platformOperator.id })
    .from(platformOperator)
    .where(eq(platformOperator.authSubject, userId));

  if (!operator) {
    logAuthGateDenied("missing_platform_operator", { hasUserId: true, roles });
    redirect(ROUTE_ACCESS_DENIED);
  }

  return {
    userId,
    actorId: operator.id,
    orgId: getDbOrgIdFromUser(session?.user),
    roles,
  };
}

export async function requireTreasurer(): Promise<RequiredSession> {
  return requireRole("TESORERA");
}
