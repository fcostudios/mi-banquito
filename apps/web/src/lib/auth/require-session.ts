import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth0 } from "@/lib/auth0";
import { getDbOrgIdFromUser, getRolesFromUser } from "@/lib/auth/session-claims";
import { hasMinRole, type AppRole } from "@/lib/auth/roles";
import { ROUTE_LOGIN } from "@/lib/routes";
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

export async function requireRole(minRole: AppRole): Promise<RequiredSession> {
  const session = await auth0.getSession();
  const orgId = getDbOrgIdFromUser(session?.user);
  const roles = getRolesFromUser(session?.user);
  const userId = typeof session?.user?.sub === "string" ? session.user.sub : undefined;

  if (!orgId || !userId) {
    redirect(ROUTE_LOGIN);
  }

  if (!hasMinRole(roles, minRole)) {
    throw new Error("Forbidden");
  }

  const [membership] = await db
    .select({ memberId: userOrgMembership.memberId, userAccountId: userAccount.id })
    .from(userAccount)
    .innerJoin(userOrgMembership, eq(userOrgMembership.userId, userAccount.id))
    .where(and(
      eq(userAccount.authSubject, userId),
      eq(userOrgMembership.orgId, orgId),
      eq(userOrgMembership.status, "active"),
    ));

  if (!membership?.memberId) {
    throw new Error("Forbidden");
  }

  return { userId, actorId: membership.memberId, orgId, roles };
}

export async function requirePlatformOperator(): Promise<PlatformSession> {
  const session = await auth0.getSession();
  const roles = getRolesFromUser(session?.user);
  const userId = typeof session?.user?.sub === "string" ? session.user.sub : undefined;

  if (!userId) {
    redirect(ROUTE_LOGIN);
  }

  if (!hasMinRole(roles, "PLATFORM_OPERATOR")) {
    throw new Error("Forbidden");
  }

  const [operator] = await db
    .select({ id: platformOperator.id })
    .from(platformOperator)
    .where(eq(platformOperator.authSubject, userId));

  if (!operator) {
    throw new Error("Forbidden");
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
