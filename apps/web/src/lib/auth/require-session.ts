import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { getDbOrgIdFromUser, getRolesFromUser } from "@/lib/auth/session-claims";
import { hasMinRole, type AppRole } from "@/lib/auth/roles";
import { ROUTE_LOGIN } from "@/lib/routes";

export type RequiredSession = {
  userId: string;
  orgId: string;
  roles: string[];
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

  return { userId, orgId, roles };
}

export async function requirePlatformOperator(): Promise<RequiredSession> {
  return requireRole("PLATFORM_OPERATOR");
}

export async function requireTreasurer(): Promise<RequiredSession> {
  return requireRole("TESORERA");
}
