import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, ne } from "drizzle-orm";
import { z } from "zod";
import { requirePlatformOperator, type PlatformSession } from "@/lib/auth/require-session";
import {
  createAuth0AdminClientFromEnv,
  type Auth0AdminClient,
} from "@/lib/auth0/admin-client";
import messages from "@/lib/i18n/en-US.json";
import { db } from "@mi-banquito/db";
import { withTenantTransaction } from "@mi-banquito/db/tenant";
import {
  auditLogEntry,
  authAdminAction,
  member,
  organization,
  userAccount,
  userOrgMembership,
} from "@mi-banquito/db/schema";

type OrganizationAccess = {
  id: string;
  displayName: string;
  auth0OrgId: string | null;
};

type TreasurerAccess = {
  userAccountId: string;
  memberId: string;
  accepted: boolean;
};

type PendingTreasurerInput = {
  orgId: string;
  email: string;
  displayName: string;
  actorId: string;
  now: Date;
};

type AuthAdminActionInput = {
  orgId: string;
  actionKind: "treasurer_invite" | "treasurer_login_reset";
  targetEmail: string;
  targetUserId: string | null;
  actorKind: "platform_operator";
  actorId: string;
  providerRequestId?: string;
  status: "sent" | "failed";
  errorMessage?: string;
  createdAt: Date;
};

type AdminAuditInput = {
  orgId: string;
  actorKind: "platform_operator" | "system";
  actorId: string;
  actionKind: string;
  subjectKind: string;
  subjectId: string | null;
  payloadSnapshot: Record<string, unknown>;
  createdAt: Date;
};

type AdminAuthRepository = {
  getOrganization(orgId: string): Promise<OrganizationAccess | undefined>;
  findTreasurerAccessByEmail(orgId: string, email: string): Promise<TreasurerAccess | undefined>;
  createPendingTreasurerAccess(input: PendingTreasurerInput): Promise<Omit<TreasurerAccess, "accepted">>;
  findRecentSentAction(input: {
    orgId: string;
    email: string;
    actionKind: "treasurer_login_reset";
    since: Date;
  }): Promise<{ id: string; createdAt: Date } | undefined>;
  findActiveTreasurerByEmail(orgId: string, email: string): Promise<Omit<TreasurerAccess, "accepted"> | undefined>;
  logAction(input: AuthAdminActionInput): Promise<void>;
  logAuditEntry(input: AdminAuditInput): Promise<void>;
};

type AdminAuthActionDeps = {
  requirePlatformOperator: () => Promise<PlatformSession>;
  auth0Client: Auth0AdminClient;
  repo: AdminAuthRepository;
  revalidatePath: (path: string) => void;
  redirect: (path: string) => never;
  now: () => Date;
};

const inviteSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(2).max(120),
});

const resetSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
});

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function orgRedirect(orgId: string, params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params);
  return `/admin/orgs/${orgId}?${searchParams.toString()}`;
}

function redirectError(
  deps: Pick<AdminAuthActionDeps, "redirect">,
  orgId: string,
  code: string,
): never {
  deps.redirect(orgRedirect(orgId, { authAccessError: code }));
}

function auth0ErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "auth0_request_failed";
}

function ensureAuth0Org(
  deps: Pick<AdminAuthActionDeps, "redirect">,
  org: OrganizationAccess | undefined,
  orgId: string,
): OrganizationAccess & { auth0OrgId: string } {
  if (!org) {
    redirectError(deps, orgId, "organization-not-found");
  }
  if (!org.auth0OrgId) {
    redirectError(deps, orgId, "auth0-org-required");
  }
  return org as OrganizationAccess & { auth0OrgId: string };
}

function buildResetWhatsappCopy(email: string, orgName: string): string {
  return messages.adminOrgs.detail.treasuryAccess.resetWhatsappCopy
    .replace("{{email}}", email)
    .replace("{{org}}", orgName);
}

export function createAdminAuthActions(deps: AdminAuthActionDeps) {
  return {
    async inviteTreasurerAction(formData: FormData): Promise<never> {
      const session = await deps.requirePlatformOperator();
      const parsed = inviteSchema.safeParse({
        orgId: formValue(formData, "orgId"),
        email: formValue(formData, "email"),
        displayName: formValue(formData, "displayName"),
      });
      const fallbackOrgId = formValue(formData, "orgId");
      if (!parsed.success) {
        redirectError(deps, fallbackOrgId, "invalid-input");
      }

      const now = deps.now();
      const org = ensureAuth0Org(deps, await deps.repo.getOrganization(parsed.data.orgId), parsed.data.orgId);
      const existing = await deps.repo.findTreasurerAccessByEmail(parsed.data.orgId, parsed.data.email);
      if (existing?.accepted) {
        redirectError(deps, parsed.data.orgId, "treasurer-already-active");
      }

      const access = existing ?? await deps.repo.createPendingTreasurerAccess({
        orgId: parsed.data.orgId,
        email: parsed.data.email,
        displayName: parsed.data.displayName,
        actorId: session.actorId,
        now,
      });

      try {
        const result = await deps.auth0Client.inviteTreasurer({
          auth0OrgId: org.auth0OrgId,
          email: parsed.data.email,
          displayName: parsed.data.displayName,
          appMetadata: {
            org_id: parsed.data.orgId,
            role: "TESORERA",
            member_id: access.memberId,
            user_account_id: access.userAccountId,
          },
        });
        await deps.repo.logAction({
          orgId: parsed.data.orgId,
          actionKind: "treasurer_invite",
          targetEmail: parsed.data.email,
          targetUserId: access.userAccountId,
          actorKind: "platform_operator",
          actorId: session.actorId,
          providerRequestId: result.providerRequestId,
          status: "sent",
          createdAt: now,
        });
        await deps.repo.logAuditEntry({
          orgId: parsed.data.orgId,
          actorKind: "platform_operator",
          actorId: session.actorId,
          actionKind: "treasurer_invite.sent",
          subjectKind: "user_account",
          subjectId: access.userAccountId,
          payloadSnapshot: {
            email: parsed.data.email,
            auth0OrgId: org.auth0OrgId,
            providerRequestId: result.providerRequestId,
            userAccountId: access.userAccountId,
            memberId: access.memberId,
          },
          createdAt: now,
        });
      } catch (error) {
        await deps.repo.logAction({
          orgId: parsed.data.orgId,
          actionKind: "treasurer_invite",
          targetEmail: parsed.data.email,
          targetUserId: access.userAccountId,
          actorKind: "platform_operator",
          actorId: session.actorId,
          status: "failed",
          errorMessage: auth0ErrorMessage(error),
          createdAt: now,
        });
        redirectError(deps, parsed.data.orgId, "invite-failed");
      }

      deps.revalidatePath(`/admin/orgs/${parsed.data.orgId}`);
      deps.redirect(orgRedirect(parsed.data.orgId, { authAccess: "invite-sent" }));
    },

    async resetTreasurerLoginAction(formData: FormData): Promise<never> {
      const session = await deps.requirePlatformOperator();
      const parsed = resetSchema.safeParse({
        orgId: formValue(formData, "orgId"),
        email: formValue(formData, "email"),
      });
      const fallbackOrgId = formValue(formData, "orgId");
      if (!parsed.success) {
        redirectError(deps, fallbackOrgId, "invalid-input");
      }

      const now = deps.now();
      const org = ensureAuth0Org(deps, await deps.repo.getOrganization(parsed.data.orgId), parsed.data.orgId);
      const recent = await deps.repo.findRecentSentAction({
        orgId: parsed.data.orgId,
        email: parsed.data.email,
        actionKind: "treasurer_login_reset",
        since: new Date(now.getTime() - 5 * 60 * 1000),
      });
      if (recent) {
        const cooldownSeconds = Math.max(
          1,
          Math.ceil((recent.createdAt.getTime() + 5 * 60 * 1000 - now.getTime()) / 1000),
        );
        await deps.repo.logAuditEntry({
          orgId: parsed.data.orgId,
          actorKind: "platform_operator",
          actorId: session.actorId,
          actionKind: "treasurer_login_reset.rate_limited",
          subjectKind: "organization",
          subjectId: parsed.data.orgId,
          payloadSnapshot: {
            email: parsed.data.email,
            action: "treasurer_login_reset",
            rateLimited: true,
            since: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
            cooldownSeconds,
          },
          createdAt: now,
        });
        deps.redirect(orgRedirect(parsed.data.orgId, {
          authAccessError: "reset-rate-limited",
          resetCooldownSeconds: String(cooldownSeconds),
        }));
      }

      const treasurer = await deps.repo.findActiveTreasurerByEmail(parsed.data.orgId, parsed.data.email);
      if (!treasurer) {
        redirectError(deps, parsed.data.orgId, "active-treasurer-required");
      }

      try {
        const result = await deps.auth0Client.sendPasswordlessLink({
          auth0OrgId: org.auth0OrgId,
          email: parsed.data.email,
        });
        await deps.repo.logAction({
          orgId: parsed.data.orgId,
          actionKind: "treasurer_login_reset",
          targetEmail: parsed.data.email,
          targetUserId: treasurer.userAccountId,
          actorKind: "platform_operator",
          actorId: session.actorId,
          providerRequestId: result.providerRequestId,
          status: "sent",
          createdAt: now,
        });
        await deps.repo.logAuditEntry({
          orgId: parsed.data.orgId,
          actorKind: "platform_operator",
          actorId: session.actorId,
          actionKind: "treasurer_login_reset.sent",
          subjectKind: "user_account",
          subjectId: treasurer.userAccountId,
          payloadSnapshot: {
            email: parsed.data.email,
            action: "treasurer_login_reset",
            providerRequestId: result.providerRequestId,
          },
          createdAt: now,
        });
      } catch (error) {
        await deps.repo.logAction({
          orgId: parsed.data.orgId,
          actionKind: "treasurer_login_reset",
          targetEmail: parsed.data.email,
          targetUserId: treasurer.userAccountId,
          actorKind: "platform_operator",
          actorId: session.actorId,
          status: "failed",
          errorMessage: auth0ErrorMessage(error),
          createdAt: now,
        });
        await deps.repo.logAuditEntry({
          orgId: parsed.data.orgId,
          actorKind: "platform_operator",
          actorId: session.actorId,
          actionKind: "treasurer_login_reset.failed",
          subjectKind: "user_account",
          subjectId: treasurer.userAccountId,
          payloadSnapshot: {
            email: parsed.data.email,
            action: "treasurer_login_reset",
            errorMessage: auth0ErrorMessage(error),
          },
          createdAt: now,
        });
        redirectError(deps, parsed.data.orgId, "reset-failed");
      }

      deps.revalidatePath(`/admin/orgs/${parsed.data.orgId}`);
      deps.redirect(orgRedirect(parsed.data.orgId, {
        authAccess: "reset-sent",
        whatsappCopy: buildResetWhatsappCopy(parsed.data.email, org.displayName),
      }));
    },
  };
}

function isPendingAuthSubject(authSubject: string, email: string): boolean {
  return authSubject === `pending:${email}`;
}

export const adminAuthRepository: AdminAuthRepository = {
  async getOrganization(orgId) {
    const [row] = await db
      .select({
        id: organization.id,
        displayName: organization.displayName,
        auth0OrgId: organization.auth0OrgId,
      })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);
    return row;
  },

  async findTreasurerAccessByEmail(orgId, email) {
    return withTenantTransaction(orgId, async (tx) => {
      const [row] = await tx
        .select({
          userAccountId: userAccount.id,
          memberId: userOrgMembership.memberId,
          authSubject: userAccount.authSubject,
        })
        .from(userAccount)
        .innerJoin(userOrgMembership, eq(userOrgMembership.userId, userAccount.id))
        .where(and(
          eq(userAccount.email, email),
          eq(userAccount.status, "active"),
          eq(userOrgMembership.orgId, orgId),
          eq(userOrgMembership.status, "active"),
          eq(userOrgMembership.role, "TESORERA"),
        ))
        .limit(1);

      if (!row?.memberId) {
        return undefined;
      }
      return {
        userAccountId: row.userAccountId,
        memberId: row.memberId,
        accepted: !isPendingAuthSubject(row.authSubject, email),
      };
    });
  },

  async createPendingTreasurerAccess(input) {
    return withTenantTransaction(input.orgId, async (tx) => {
      const pendingAuthSubject = `pending:${input.email}`;
      const [existingUser] = await tx
        .select({
          id: userAccount.id,
          authSubject: userAccount.authSubject,
        })
        .from(userAccount)
        .where(eq(userAccount.email, input.email))
        .limit(1);

      const userId = existingUser?.id ?? randomUUID();
      if (!existingUser) {
        await tx.insert(userAccount).values({
          id: userId,
          authSubject: pendingAuthSubject,
          email: input.email,
          displayName: input.displayName,
          status: "active",
          createdAt: input.now,
          updatedAt: null,
        });
      }

      const memberId = randomUUID();
      await tx.insert(member).values({
        id: memberId,
        orgId: input.orgId,
        displayName: input.displayName,
        whatsappNumber: null,
        joinedOn: input.now.toISOString().slice(0, 10),
        role: "tesorera",
        status: "activo",
        authSubject: null,
        initialSavingsBalance: "0.0000",
        notes: null,
        createdAt: input.now,
        createdBy: input.actorId,
        createdByKind: "platform_operator",
        updatedAt: null,
        updatedBy: null,
      });
      await tx.insert(userOrgMembership).values({
        id: randomUUID(),
        userId,
        orgId: input.orgId,
        role: "TESORERA",
        status: "active",
        memberId,
        grantedAt: input.now,
        revokedAt: null,
      });

      return { userAccountId: userId, memberId };
    });
  },

  async findRecentSentAction(input) {
    return withTenantTransaction(input.orgId, async (tx) => {
      const [row] = await tx
        .select({ id: authAdminAction.id, createdAt: authAdminAction.createdAt })
        .from(authAdminAction)
        .where(and(
          eq(authAdminAction.orgId, input.orgId),
          eq(authAdminAction.targetEmail, input.email),
          eq(authAdminAction.actionKind, input.actionKind),
          eq(authAdminAction.status, "sent"),
          gte(authAdminAction.createdAt, input.since),
        ))
        .orderBy(desc(authAdminAction.createdAt))
        .limit(1);
      return row;
    });
  },

  async findActiveTreasurerByEmail(orgId, email) {
    return withTenantTransaction(orgId, async (tx) => {
      const [row] = await tx
        .select({
          userAccountId: userAccount.id,
          memberId: userOrgMembership.memberId,
        })
        .from(userAccount)
        .innerJoin(userOrgMembership, eq(userOrgMembership.userId, userAccount.id))
        .where(and(
          eq(userAccount.email, email),
          eq(userAccount.status, "active"),
          ne(userAccount.authSubject, `pending:${email}`),
          eq(userOrgMembership.orgId, orgId),
          eq(userOrgMembership.status, "active"),
          eq(userOrgMembership.role, "TESORERA"),
        ))
        .limit(1);
      return row?.memberId ? { userAccountId: row.userAccountId, memberId: row.memberId } : undefined;
    });
  },

  async logAction(input) {
    await withTenantTransaction(input.orgId, async (tx) => {
      await tx.insert(authAdminAction).values({
        id: randomUUID(),
        orgId: input.orgId,
        actionKind: input.actionKind,
        targetEmail: input.targetEmail,
        targetUserId: input.targetUserId,
        actorKind: input.actorKind,
        actorId: input.actorId,
        providerRequestId: input.providerRequestId,
        status: input.status,
        errorMessage: input.errorMessage,
        createdAt: input.createdAt,
      });
    });
  },

  async logAuditEntry(input) {
    await withTenantTransaction(input.orgId, async (tx) => {
      await tx.insert(auditLogEntry).values({
        id: randomUUID(),
        orgId: input.orgId,
        actorKind: input.actorKind,
        actorId: input.actorId,
        actionKind: input.actionKind,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        payloadSnapshot: input.payloadSnapshot,
        reason: null,
        at: input.createdAt,
        createdAt: input.createdAt,
      });
    });
  },
};

function createDefaultActions() {
  return createAdminAuthActions({
    requirePlatformOperator,
    auth0Client: createAuth0AdminClientFromEnv(),
    repo: adminAuthRepository,
    revalidatePath,
    redirect,
    now: () => new Date(),
  });
}

export async function inviteTreasurerAction(formData: FormData): Promise<never> {
  return createDefaultActions().inviteTreasurerAction(formData);
}

export async function resetTreasurerLoginAction(formData: FormData): Promise<never> {
  return createDefaultActions().resetTreasurerLoginAction(formData);
}
