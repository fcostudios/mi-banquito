// Ledger domain — typed service boundary. TEMPLATE — one shape of
// many; the dev team owns the real bodies. This is IMP-268's worked example for
// the central seam db -> contracts -> domain -> action/read -> ui. Consumes
// @mi-banquito/db; its input type aligns with @mi-banquito/contracts' insertMemberSchema
// (validated at the action edge, so this layer stays Zod-free). Member is the
// salient entity (most screen-referenced, org-scoped) for this project.
import { and, eq } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import {
  auditLogEntry,
  entityVersion,
  expense,
  member,
} from "@mi-banquito/db/schema";

// Row/input types are named for the ENTITY, not the context — a context owns
// many entities, so the dev team's next method (e.g. listContributions) defines
// its own ContributionRow alongside these.
export type MemberRow = typeof member.$inferSelect;
export type NewMemberInput = Omit<typeof member.$inferInsert, "orgId">;
export type MemberInsert = typeof member.$inferInsert;
export type EntityVersionInsert = typeof entityVersion.$inferInsert;
export type AuditLogEntryInsert = typeof auditLogEntry.$inferInsert;
export type ExpenseInsert = typeof expense.$inferInsert;

export type LedgerActorKind = "member" | "platform_operator" | "system";
export type MemberRole = "aportante" | "tesorera" | "presidente" | "secretaria";
export type MemberStatus = "activo" | "en_pausa" | "baja";
export type ComplianceState = "al_dia" | "al_día" | "atrasado" | "en_mora";
export type ComplianceTone = "green" | "amber" | "red";

export interface BuildMemberCreationLedgerPlanInput {
  orgId: string;
  actorId: string;
  memberId: string;
  now: Date;
  displayName: string;
  whatsappNumber?: string | null;
  joinedOn: string;
  role?: MemberRole;
  initialSavingsBalance?: string;
  notes?: string | null;
  actorKind?: LedgerActorKind;
}

export interface MemberCreationLedgerPlan {
  member: MemberInsert;
  entityVersion: EntityVersionInsert;
  auditLogEntry: AuditLogEntryInsert;
}

export interface MemberForStatusTransition {
  id: string;
  orgId: string;
  displayName: string;
  status: MemberStatus;
  initialSavingsBalance: string;
  accumulatedSavingsBalance?: string;
}

export interface BuildMemberStatusTransitionLedgerPlanInput {
  orgId: string;
  actorId: string;
  now: Date;
  member: MemberForStatusTransition;
  previousVersion: number;
  nextStatus: Extract<MemberStatus, "en_pausa" | "baja">;
  reason: string;
  refundAmount?: string;
  currencyCode?: string;
  incurredOn?: string;
  actorKind?: LedgerActorKind;
}

export interface MemberStatusTransitionLedgerPlan {
  memberUpdate: Pick<MemberInsert, "status" | "updatedAt" | "updatedBy">;
  entityVersion: EntityVersionInsert;
  auditLogEntry: AuditLogEntryInsert;
  refundExpense?: ExpenseInsert;
}

const MEMBER_ENTITY_KIND = "Member";
const DEFAULT_ACTOR_KIND: LedgerActorKind = "member";

const normalizeNullableText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const requireReason = (reason: string): string => {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new Error("reason is required for member status transitions");
  }
  return trimmed;
};

const dateOnly = (date: Date): string => date.toISOString().slice(0, 10);

export const buildMemberCreationLedgerPlan = (
  input: BuildMemberCreationLedgerPlanInput,
): MemberCreationLedgerPlan => {
  const actorKind = input.actorKind ?? DEFAULT_ACTOR_KIND;
  const displayName = input.displayName.trim();
  if (!displayName) {
    throw new Error("displayName is required");
  }

  const memberRow: MemberInsert = {
    id: input.memberId,
    orgId: input.orgId,
    displayName,
    whatsappNumber: normalizeNullableText(input.whatsappNumber),
    joinedOn: input.joinedOn,
    role: input.role ?? "aportante",
    status: "activo",
    authSubject: null,
    initialSavingsBalance: input.initialSavingsBalance ?? "0",
    notes: normalizeNullableText(input.notes),
    createdAt: input.now,
    createdBy: input.actorId,
    createdByKind: actorKind,
    updatedAt: null,
    updatedBy: null,
  };

  return {
    member: memberRow,
    entityVersion: {
      orgId: input.orgId,
      entityKind: MEMBER_ENTITY_KIND,
      entityId: input.memberId,
      version: 1,
      validFrom: input.now,
      validTo: null,
      payloadSnapshot: memberRow,
      changeKind: "create",
      changeReason: null,
      createdAt: input.now,
      createdBy: input.actorId,
      createdByKind: actorKind,
    },
    auditLogEntry: {
      orgId: input.orgId,
      actorKind,
      actorId: input.actorId,
      actionKind: "member.create",
      subjectKind: MEMBER_ENTITY_KIND,
      subjectId: input.memberId,
      payloadSnapshot: {
        displayName: memberRow.displayName,
        whatsappNumber: memberRow.whatsappNumber,
        joinedOn: memberRow.joinedOn,
        role: memberRow.role,
        status: memberRow.status,
        initialSavingsBalance: memberRow.initialSavingsBalance,
      },
      reason: null,
      at: input.now,
      createdAt: input.now,
    },
  };
};

export const buildMemberStatusTransitionLedgerPlan = (
  input: BuildMemberStatusTransitionLedgerPlanInput,
): MemberStatusTransitionLedgerPlan => {
  const reason = requireReason(input.reason);
  const actorKind = input.actorKind ?? DEFAULT_ACTOR_KIND;
  if (input.member.orgId !== input.orgId) {
    throw new Error("member must belong to the active org");
  }

  const memberUpdate = {
    status: input.nextStatus,
    updatedAt: input.now,
    updatedBy: input.actorId,
  } satisfies Pick<MemberInsert, "status" | "updatedAt" | "updatedBy">;

  const payloadSnapshot = {
    id: input.member.id,
    orgId: input.orgId,
    displayName: input.member.displayName,
    previousStatus: input.member.status,
    status: input.nextStatus,
    reason,
  };

  const plan: MemberStatusTransitionLedgerPlan = {
    memberUpdate,
    entityVersion: {
      orgId: input.orgId,
      entityKind: MEMBER_ENTITY_KIND,
      entityId: input.member.id,
      version: input.previousVersion + 1,
      validFrom: input.now,
      validTo: null,
      payloadSnapshot,
      changeKind: "status_transition",
      changeReason: reason,
      createdAt: input.now,
      createdBy: input.actorId,
      createdByKind: actorKind,
    },
    auditLogEntry: {
      orgId: input.orgId,
      actorKind,
      actorId: input.actorId,
      actionKind: "member.status_transition",
      subjectKind: MEMBER_ENTITY_KIND,
      subjectId: input.member.id,
      payloadSnapshot,
      reason,
      at: input.now,
      createdAt: input.now,
    },
  };

  if (input.nextStatus === "baja") {
    plan.refundExpense = {
      orgId: input.orgId,
      purpose: "member_refund",
      amount: input.refundAmount ?? input.member.accumulatedSavingsBalance ?? input.member.initialSavingsBalance,
      currencyCode: input.currencyCode ?? "USD",
      beneficiaryMemberId: input.member.id,
      beneficiaryText: input.member.displayName,
      incurredOn: input.incurredOn ?? dateOnly(input.now),
      status: "planned",
      recordedAt: input.now,
      reversesId: null,
      reverseReason: null,
      clientRequestId: null,
      createdAt: input.now,
      createdBy: input.actorId,
      createdByKind: actorKind,
    };
  }

  return plan;
};

export const complianceToneForState = (state: ComplianceState): ComplianceTone => {
  switch (state) {
    case "al_dia":
    case "al_día":
      return "green";
    case "atrasado":
      return "amber";
    case "en_mora":
      return "red";
  }
};

export interface LedgerService {
  readonly context: "ledger";
  /** Read spine: org-scoped list (a force-dynamic Server Component calls this). */
  listMembers(orgId: string): Promise<MemberRow[]>;
  /** Read by id: org-scoped single row (a dynamic-route detail page calls this). */
  getMember(orgId: string, id: string): Promise<MemberRow | undefined>;
  /** Mutation: insert a validated row. The tenant is supplied separately (from the
   *  session), never by the caller's input. */
  createMember(orgId: string, input: NewMemberInput): Promise<MemberRow>;
}

export const createLedgerService = (): LedgerService => ({
  context: "ledger",
  async listMembers(orgId) {
    return db.select().from(member).where(eq(member.orgId, orgId));
  },
  async getMember(orgId, id) {
    // org_id ALWAYS in the where — a row id alone never crosses tenants.
    const [row] = await db.select().from(member)
      .where(and(eq(member.orgId, orgId), eq(member.id, id)));
    return row;
  },
  async createMember(orgId, input) {
    const [row] = await db.insert(member).values({ ...input, orgId }).returning();
    return row;
  },
});
