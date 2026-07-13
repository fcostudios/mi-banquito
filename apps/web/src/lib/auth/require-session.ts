import { redirect } from "next/navigation";
import { getActiveImpersonationSession, type ActiveImpersonationSession } from "@/lib/impersonation/session";
import { and, desc, eq } from "drizzle-orm";
import { auth0 } from "@/lib/auth0";
import { getDbOrgIdFromUser, getRolesFromUser } from "@/lib/auth/session-claims";
import { hasMinRole, type AppRole } from "@/lib/auth/roles";
import { ROUTE_ACCESS_DENIED, ROUTE_LOGIN } from "@/lib/routes";
import { db } from "@mi-banquito/db";
import { withTenantTransaction, withWritableTenantTransaction } from "@mi-banquito/db/tenant";
import { auditLogEntry, authAdminAction, member, organization, platformOperator, userAccount, userOrgMembership } from "@mi-banquito/db/schema";

export type RequiredSession = {
  userId: string;
  actorId: string;
  orgId: string;
  roles: string[];
  impersonation?: ActiveImpersonationSession;
};

export type PlatformSession = Omit<RequiredSession, "orgId"> & {
  orgId?: string;
};

export type ShellSession = {
  displayName: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  roles: string[];
  impersonation?: ActiveImpersonationSession;
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

function getConfiguredDbOrgIdFromNativeOrg(nativeOrgId: unknown): string | undefined {
  if (
    typeof nativeOrgId === "string" &&
    process.env.AUTH0_ORGANIZATION_DB_ORG_ID &&
    nativeOrgId === process.env.AUTH0_ORGANIZATION
  ) {
    return process.env.AUTH0_ORGANIZATION_DB_ORG_ID;
  }
  return undefined;
}

function getDevelopmentBypassSession(): RequiredSession | undefined {
  if (process.env.E2E_AUTH_BYPASS !== "1" || process.env.NODE_ENV === "production") {
    return undefined;
  }

  return {
    userId: "e2e-auth-bypass",
    actorId: "33333333-3333-4333-8333-333333333333",
    orgId: process.env.AUTH0_ORGANIZATION_DB_ORG_ID ?? "11111111-1111-4111-8111-111111111111",
    roles: ["TESORERA"],
  };
}

function withPlatformOperatorRole(roles: string[]): string[] {
  return roles.includes("PLATFORM_OPERATOR") ? roles : [...roles, "PLATFORM_OPERATOR"];
}

async function getActivePlatformOperator(userId: string) {
  const [operator] = await db
    .select({ id: platformOperator.id })
    .from(platformOperator)
    .where(and(
      eq(platformOperator.authSubject, userId),
      eq(platformOperator.status, "active"),
    ));

  return operator;
}

export async function requireRole(minRole: AppRole): Promise<RequiredSession> {
  const bypass = getDevelopmentBypassSession();
  if (bypass && hasMinRole(bypass.roles, minRole)) {
    return bypass;
  }

  const session = await auth0.getSession();
  const orgId = getDbOrgIdFromUser(session?.user) ?? getConfiguredDbOrgIdFromNativeOrg(session?.user?.org_id);
  const claimRoles = getRolesFromUser(session?.user);
  const userId = typeof session?.user?.sub === "string" ? session.user.sub : undefined;
  const email = typeof session?.user?.email === "string" ? session.user.email.toLowerCase() : undefined;
  const emailVerified = session?.user?.email_verified !== false;

  if (!userId) {
    logAuthGateDenied("missing_user", { hasUserId: false, hasOrgId: Boolean(orgId), roles: claimRoles });
    redirect(ROUTE_LOGIN);
  }

  const activeImpersonation = await getActiveImpersonationSession(userId);
  if (activeImpersonation) {
    if (!hasMinRole(activeImpersonation.roles, minRole)) {
      redirect(ROUTE_ACCESS_DENIED);
    }
    return {
      userId,
      actorId: activeImpersonation.actorId,
      orgId: activeImpersonation.orgId,
      roles: ["TESORERA"],
      impersonation: activeImpersonation,
    };
  }

  if (!orgId) {
    logAuthGateDenied("missing_org_claim", {
      hasUserId: true,
      hasOrgId: false,
      nativeOrgId: typeof session?.user?.org_id === "string" ? session.user.org_id : undefined,
      roles: claimRoles,
    });
    redirect(ROUTE_ACCESS_DENIED);
  }

  const [org] = await db
    .select({ status: organization.status, platformOperatorId: organization.platformOperatorId })
    .from(organization)
    .where(eq(organization.id, orgId));
  if (org?.status === "archived") {
    logAuthGateDenied("missing_membership", {
      hasUserId: true,
      orgId,
      reason: "organization_archived",
    });
    redirect(ROUTE_ACCESS_DENIED);
  }

  let [membership] = await withTenantTransaction(orgId, async (tx) =>
    tx
      .select({ memberId: userOrgMembership.memberId, userAccountId: userAccount.id, role: userOrgMembership.role })
      .from(userAccount)
      .innerJoin(userOrgMembership, eq(userOrgMembership.userId, userAccount.id))
      .where(and(
        eq(userAccount.authSubject, userId),
        eq(userOrgMembership.orgId, orgId),
        eq(userOrgMembership.status, "active"),
      )));

  if (!membership?.memberId && email && emailVerified) {
    const pendingAuthSubject = `pending:${email}`;
    const [pendingMembership] = await withTenantTransaction(orgId, async (tx) =>
      tx
        .select({
          memberId: userOrgMembership.memberId,
          userAccountId: userAccount.id,
          role: userOrgMembership.role,
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
        )));

    if (pendingMembership?.memberId) {
      const now = new Date();
      const pendingMemberId = pendingMembership.memberId;
      const pendingUserAccountId = pendingMembership.userAccountId;
      await withWritableTenantTransaction(orgId, async (tx) => {
        const [inviteAction] = await tx
          .select({
            id: authAdminAction.id,
            actorId: authAdminAction.actorId,
            providerRequestId: authAdminAction.providerRequestId,
          })
          .from(authAdminAction)
          .where(and(
            eq(authAdminAction.orgId, orgId),
            eq(authAdminAction.targetEmail, email),
            eq(authAdminAction.actionKind, "treasurer_invite"),
            eq(authAdminAction.status, "sent"),
          ))
          .orderBy(desc(authAdminAction.createdAt))
          .limit(1);
        let inviteAudit: { id: string; actorId: string } | undefined;
        if (!inviteAction?.actorId) {
          [inviteAudit] = await tx
            .select({
              id: auditLogEntry.id,
              actorId: auditLogEntry.actorId,
            })
            .from(auditLogEntry)
            .where(and(
              eq(auditLogEntry.orgId, orgId),
              eq(auditLogEntry.actionKind, "treasurer_invite.sent"),
              eq(auditLogEntry.actorKind, "platform_operator"),
              eq(auditLogEntry.subjectKind, "user_account"),
              eq(auditLogEntry.subjectId, pendingUserAccountId),
            ))
            .orderBy(desc(auditLogEntry.at))
            .limit(1);
        }
        const acceptanceActorId = inviteAction?.actorId ?? inviteAudit?.actorId ?? org?.platformOperatorId;
        if (!acceptanceActorId) {
          throw new Error("auth_invite_acceptance_missing_platform_operator_actor");
        }
        await tx
          .update(userAccount)
          .set({ authSubject: userId, updatedAt: now })
          .where(and(
            eq(userAccount.id, pendingUserAccountId),
            eq(userAccount.authSubject, pendingAuthSubject),
          ));
        await tx
          .update(member)
          .set({ authSubject: userId, updatedAt: now })
          .where(eq(member.id, pendingMemberId));
        await tx.insert(auditLogEntry).values({
          orgId,
          actorKind: "platform_operator",
          actorId: acceptanceActorId,
          actionKind: "auth.invite.accepted",
          subjectKind: "member",
          subjectId: pendingMemberId,
          payloadSnapshot: {
            email,
            authSubject: userId,
            userAccountId: pendingUserAccountId,
            inviteActionId: inviteAction?.id,
            inviteAuditId: inviteAudit?.id,
            providerRequestId: inviteAction?.providerRequestId,
          },
          reason: null,
          at: now,
          createdAt: now,
        });
      });
      membership = pendingMembership;
    }
  }

  if (!membership?.memberId) {
    logAuthGateDenied("missing_membership", {
      hasUserId: true,
      orgId,
      roles: claimRoles,
      hasEmail: Boolean(email),
      emailVerified,
    });
    redirect(ROUTE_ACCESS_DENIED);
  }

  const roles = claimRoles.length > 0 ? claimRoles : [membership.role].filter(Boolean);

  if (!hasMinRole(roles, minRole)) {
    logAuthGateDenied("missing_role", { hasUserId: true, orgId, roles, minRole });
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

  if (await getActiveImpersonationSession(userId)) {
    redirect(ROUTE_ACCESS_DENIED);
  }

  const operator = await getActivePlatformOperator(userId);

  if (!operator) {
    logAuthGateDenied("missing_platform_operator", { hasUserId: true, roles });
    redirect(ROUTE_ACCESS_DENIED);
  }

  return {
    userId,
    actorId: operator.id,
    orgId: getDbOrgIdFromUser(session?.user),
    roles: withPlatformOperatorRole(roles),
  };
}

export async function requireTreasurer(): Promise<RequiredSession> {
  return requireRole("TESORERA");
}

export async function getShellSession(): Promise<ShellSession> {
  const bypass = getDevelopmentBypassSession();
  if (bypass) {
    return {
      displayName: "Tesorera QA",
      email: "qa@mi-banquito.local",
      orgId: bypass.orgId,
      roles: bypass.roles,
    };
  }

  const session = await auth0.getSession();
  const user = session?.user;
  const userId = typeof user?.sub === "string" ? user.sub : undefined;
  const email = typeof user?.email === "string" ? user.email.toLowerCase() : undefined;
  const displayName = typeof user?.name === "string" && user.name.trim() ? user.name : email ?? "";
  const orgId = getDbOrgIdFromUser(user) ?? getConfiguredDbOrgIdFromNativeOrg(user?.org_id);
  const claimRoles = getRolesFromUser(user);

  if (!userId) {
    redirect(ROUTE_LOGIN);
  }

  const activeImpersonation = await getActiveImpersonationSession(userId);
  if (activeImpersonation) {
    return {
      displayName: activeImpersonation.targetDisplayName,
      email: activeImpersonation.targetEmail,
      orgId: activeImpersonation.orgId,
      orgName: activeImpersonation.orgName,
      roles: ["TESORERA"],
      impersonation: activeImpersonation,
    };
  }

  const platformOperatorRow = userId ? await getActivePlatformOperator(userId) : undefined;

  if (!userId || !orgId) {
    return {
      displayName,
      email,
      orgId,
      roles: platformOperatorRow ? withPlatformOperatorRole(claimRoles) : claimRoles,
    };
  }

  const [org] = await db
    .select({ displayName: organization.displayName })
    .from(organization)
    .where(eq(organization.id, orgId));

  const [membership] = await withTenantTransaction(orgId, async (tx) => tx
    .select({ role: userOrgMembership.role })
    .from(userAccount)
    .innerJoin(userOrgMembership, eq(userOrgMembership.userId, userAccount.id))
    .where(and(
      eq(userAccount.authSubject, userId),
      eq(userOrgMembership.orgId, orgId),
      eq(userOrgMembership.status, "active"),
    )));

  const roles = claimRoles.length > 0 ? claimRoles : [membership?.role].filter((role): role is string => Boolean(role));
  return {
    displayName,
    email,
    orgId,
    orgName: org?.displayName,
    roles: platformOperatorRow ? withPlatformOperatorRole(roles) : roles,
  };
}
