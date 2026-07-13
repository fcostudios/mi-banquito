import { and, eq, isNull, lte } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import {
  auditLogEntry,
  impersonation,
  impersonationTermination,
  member,
  organization,
  platformOperator,
  userAccount,
  userOrgMembership,
} from "@mi-banquito/db/schema";
import { withTenantTransaction } from "@mi-banquito/db/tenant";

const DEFAULT_TTL_MS = 15 * 60_000;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TerminationKind = "operator_exit" | "expired" | "revoked";

export function assertImpersonationReason(value: string): string {
  const reason = value.trim();
  if (!reason) throw new Error("impersonation_reason_required");
  if (reason.length < 10) throw new Error("impersonation_reason_too_short");
  return reason;
}

type StartInput = {
  orgId: string;
  platformOperatorId: string;
  reason: string;
};

type ResolveInput = {
  impersonationId: string;
  orgId: string;
  targetMembershipId: string;
  platformOperatorId: string;
  operatorAuthSubject: string;
};

type TerminateInput = {
  impersonationId: string;
  orgId: string;
  endedByOperatorId: string;
  kind: TerminationKind;
};

type StartRow = typeof impersonation.$inferSelect;

async function appendTermination(
  tx: Transaction,
  start: StartRow,
  input: Pick<TerminateInput, "endedByOperatorId" | "kind">,
  now: Date,
): Promise<boolean> {
  const [inserted] = await tx
    .insert(impersonationTermination)
    .values({
      impersonationId: start.id,
      orgId: start.orgId,
      kind: input.kind,
      reason: start.reason,
      endedByOperatorId: input.endedByOperatorId,
      endedAt: now,
      createdAt: now,
    })
    .onConflictDoNothing({ target: impersonationTermination.impersonationId })
    .returning();

  if (!inserted) return false;

  await tx.insert(auditLogEntry).values({
    orgId: start.orgId,
    actorKind: "platform_operator",
    actorId: start.platformOperatorId,
    actionKind: "impersonation.ended",
    subjectKind: "impersonation",
    subjectId: start.id,
    payloadSnapshot: {
      mode: start.mode,
      targetMembershipId: start.targetMembershipId,
      terminationKind: input.kind,
      endedByOperatorId: input.endedByOperatorId,
      startedAt: start.startedAt.toISOString(),
      expiresAt: start.expiresAt?.toISOString(),
    },
    reason: start.reason,
    at: now,
    createdAt: now,
  });
  return true;
}

export function createImpersonationService(options: {
  now?: () => Date;
  ttlMs?: number;
} = {}) {
  const now = options.now ?? (() => new Date());
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (ttlMs <= 0 || ttlMs > DEFAULT_TTL_MS) {
    throw new Error("impersonation_ttl_invalid");
  }

  return {
    async start(input: StartInput) {
      const reason = assertImpersonationReason(input.reason);
      const startedAt = now();
      const expiresAt = new Date(startedAt.getTime() + ttlMs);
      const [[org], [operator]] = await Promise.all([
        db.select({ id: organization.id, status: organization.status })
          .from(organization)
          .where(eq(organization.id, input.orgId))
          .limit(1),
        db.select({ id: platformOperator.id })
          .from(platformOperator)
          .where(and(
            eq(platformOperator.id, input.platformOperatorId),
            eq(platformOperator.status, "active"),
          ))
          .limit(1),
      ]);
      if (!org || org.status !== "active") throw new Error("impersonation_organization_not_active");
      if (!operator) throw new Error("impersonation_operator_not_active");

      return withTenantTransaction(input.orgId, async (tx) => {
        const treasurers = await tx
          .select({
            membershipId: userOrgMembership.id,
            memberId: member.id,
            displayName: member.displayName,
          })
          .from(userOrgMembership)
          .innerJoin(userAccount, eq(userAccount.id, userOrgMembership.userId))
          .innerJoin(member, and(
            eq(member.id, userOrgMembership.memberId),
            eq(member.orgId, userOrgMembership.orgId),
          ))
          .where(and(
            eq(userOrgMembership.orgId, input.orgId),
            eq(userOrgMembership.role, "TESORERA"),
            eq(userOrgMembership.status, "active"),
            eq(userAccount.status, "active"),
            eq(member.role, "tesorera"),
            eq(member.status, "activo"),
          ));
        if (treasurers.length !== 1) {
          throw new Error("impersonation_requires_exactly_one_treasurer");
        }

        const target = treasurers[0];
        const [created] = await tx.insert(impersonation).values({
          orgId: input.orgId,
          platformOperatorId: input.platformOperatorId,
          targetMembershipId: target.membershipId,
          startedAt,
          expiresAt,
          endedAt: null,
          reason,
          mode: "read_only",
          createdAt: startedAt,
        }).returning();

        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "platform_operator",
          actorId: input.platformOperatorId,
          actionKind: "impersonation.started",
          subjectKind: "impersonation",
          subjectId: created.id,
          payloadSnapshot: {
            mode: "read_only",
            targetMembershipId: target.membershipId,
            targetMemberId: target.memberId,
            startedAt: startedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
          reason,
          at: startedAt,
          createdAt: startedAt,
        });
        return created;
      });
    },

    async resolve(input: ResolveInput) {
      const resolvedAt = now();
      const [[org], [operator]] = await Promise.all([
        db.select({ id: organization.id, displayName: organization.displayName, status: organization.status })
          .from(organization)
          .where(eq(organization.id, input.orgId))
          .limit(1),
        db.select({ id: platformOperator.id, displayName: platformOperator.displayName })
          .from(platformOperator)
          .where(and(
            eq(platformOperator.id, input.platformOperatorId),
            eq(platformOperator.authSubject, input.operatorAuthSubject),
            eq(platformOperator.status, "active"),
          ))
          .limit(1),
      ]);
      if (!org || org.status !== "active" || !operator) return null;

      const [active] = await withTenantTransaction(input.orgId, async (tx) => tx
        .select({
          start: impersonation,
          membershipId: userOrgMembership.id,
          memberId: member.id,
          targetDisplayName: member.displayName,
          targetEmail: userAccount.email,
        })
        .from(impersonation)
        .innerJoin(userOrgMembership, and(
          eq(userOrgMembership.id, impersonation.targetMembershipId),
          eq(userOrgMembership.orgId, impersonation.orgId),
        ))
        .innerJoin(userAccount, eq(userAccount.id, userOrgMembership.userId))
        .innerJoin(member, and(
          eq(member.id, userOrgMembership.memberId),
          eq(member.orgId, userOrgMembership.orgId),
        ))
        .leftJoin(impersonationTermination, eq(impersonationTermination.impersonationId, impersonation.id))
        .where(and(
          eq(impersonation.id, input.impersonationId),
          eq(impersonation.orgId, input.orgId),
          eq(impersonation.platformOperatorId, input.platformOperatorId),
          eq(impersonation.targetMembershipId, input.targetMembershipId),
          eq(impersonation.mode, "read_only"),
          isNull(impersonationTermination.id),
          eq(userOrgMembership.status, "active"),
          eq(userOrgMembership.role, "TESORERA"),
          eq(userAccount.status, "active"),
          eq(member.status, "activo"),
          eq(member.role, "tesorera"),
        ))
        .limit(1));
      if (!active?.start.expiresAt) return null;
      if (active.start.expiresAt <= resolvedAt) {
        await this.terminate({
          impersonationId: input.impersonationId,
          orgId: input.orgId,
          endedByOperatorId: input.platformOperatorId,
          kind: "expired",
        });
        return null;
      }
      return {
        userId: input.operatorAuthSubject,
        actorId: active.memberId,
        orgId: input.orgId,
        orgName: org.displayName,
        roles: ["TESORERA"] as string[],
        platformOperatorId: input.platformOperatorId,
        platformOperatorName: operator.displayName,
        targetMembershipId: active.membershipId,
        targetDisplayName: active.targetDisplayName,
        targetEmail: active.targetEmail,
        reason: active.start.reason,
        startedAt: active.start.startedAt,
        expiresAt: active.start.expiresAt,
        impersonationId: active.start.id,
        readOnly: true as const,
      };
    },

    async hasBinding(input: ResolveInput): Promise<{ terminated: boolean; expiresAt: Date } | null> {
      const [operator] = await db.select({ id: platformOperator.id })
        .from(platformOperator)
        .where(and(
          eq(platformOperator.id, input.platformOperatorId),
          eq(platformOperator.authSubject, input.operatorAuthSubject),
          eq(platformOperator.status, "active"),
        ))
        .limit(1);
      if (!operator) return null;
      const [row] = await withTenantTransaction(input.orgId, async (tx) => tx
        .select({
          expiresAt: impersonation.expiresAt,
          terminationId: impersonationTermination.id,
        })
        .from(impersonation)
        .leftJoin(impersonationTermination, eq(impersonationTermination.impersonationId, impersonation.id))
        .where(and(
          eq(impersonation.id, input.impersonationId),
          eq(impersonation.orgId, input.orgId),
          eq(impersonation.platformOperatorId, input.platformOperatorId),
          eq(impersonation.targetMembershipId, input.targetMembershipId),
          eq(impersonation.mode, "read_only"),
        ))
        .limit(1));
      if (!row?.expiresAt) return null;
      return { terminated: Boolean(row.terminationId), expiresAt: row.expiresAt };
    },

    async terminate(input: TerminateInput): Promise<boolean> {
      return withTenantTransaction(input.orgId, async (tx) => {
        const [start] = await tx.select().from(impersonation).where(and(
          eq(impersonation.id, input.impersonationId),
          eq(impersonation.orgId, input.orgId),
        )).limit(1);
        if (!start || start.platformOperatorId !== input.endedByOperatorId) return false;
        return appendTermination(tx, start, input, now());
      });
    },

    async sweepExpired(): Promise<number> {
      const organizations = await db.select({ id: organization.id }).from(organization);
      let finalized = 0;
      for (const org of organizations) {
        finalized += await withTenantTransaction(org.id, async (tx) => {
          const expired = await tx.select({ start: impersonation })
            .from(impersonation)
            .leftJoin(impersonationTermination, eq(impersonationTermination.impersonationId, impersonation.id))
            .where(and(
              eq(impersonation.orgId, org.id),
              lte(impersonation.expiresAt, now()),
              isNull(impersonationTermination.id),
            ));
          let orgFinalized = 0;
          for (const row of expired) {
            if (await appendTermination(tx, row.start, {
              endedByOperatorId: row.start.platformOperatorId,
              kind: "expired",
            }, now())) {
              orgFinalized += 1;
            }
          }
          return orgFinalized;
        });
      }
      return finalized;
    },
  };
}
