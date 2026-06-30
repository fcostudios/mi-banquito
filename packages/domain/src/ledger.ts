// Ledger domain — typed service boundary. TEMPLATE — one shape of
// many; the dev team owns the real bodies. This is IMP-268's worked example for
// the central seam db -> contracts -> domain -> action/read -> ui. Consumes
// @mi-banquito/db; its input type aligns with @mi-banquito/contracts' insertMemberSchema
// (validated at the action edge, so this layer stays Zod-free). Member is the
// salient entity (most screen-referenced, org-scoped) for this project.
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import {
  auditLogEntry,
  baseFundQuotaConfig,
  baseFundQuotaPayment,
  contribution,
  contributionCycle,
  entityVersion,
  expense,
  groupConfig,
  member,
  organization,
} from "@mi-banquito/db/schema";
import type {
  AddMemberForm,
  BaseFundQuotaPaymentForm,
  ContributionForm,
  FirstRunCompleteForm,
  FirstRunNameForm,
  GroupConfigForm,
  MemberStatusTransitionForm,
  ReverseContributionForm,
} from "@mi-banquito/contracts";
import { createPlatformService } from "./platform";

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
export type ComplianceTone = "success" | "warning" | "danger";
export type FirstRunStep = 1 | 2 | 3 | "complete";

export type FirstRunState = {
  organization: typeof organization.$inferSelect;
  config?: typeof groupConfig.$inferSelect;
  step: FirstRunStep;
  rulesSummary: string[];
};

export type MemberWithCompliance = MemberRow & {
  complianceState: ComplianceState;
  complianceTone: ComplianceTone;
};

export type MemberComplianceRow = {
  memberId: string;
  displayName: string;
  state: ComplianceState;
  tone: ComplianceTone;
};

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
const money4 = (value: string | number): string => Number(value).toFixed(4);
const money2 = (value: string | number): string => Number(value).toFixed(2);

export function nextWizardStep(input: { firstRunStep?: number | null; completedAt?: Date | null }): FirstRunStep {
  if (input.completedAt) return "complete";
  if (input.firstRunStep === 2 || input.firstRunStep === 3) return input.firstRunStep;
  return 1;
}

export function summarizeRulesForWizard(input: {
  contributionAmount: string;
  loanRateValue: string;
  lateThresholdDays: number;
  moraThresholdDays: number;
}) {
  return [
    `Aporte regular: $${money2(input.contributionAmount)}`,
    `Tasa de prestamo: ${money2(input.loanRateValue)}%`,
    `Atraso desde ${input.lateThresholdDays} dias; mora desde ${input.moraThresholdDays} dias`,
  ];
}

export function normalizeWhatsapp(value: string | undefined | null): string | null {
  return normalizeNullableText(value);
}

export function mapComplianceStatusToTone(state: ComplianceState): ComplianceTone {
  switch (state) {
    case "al_dia":
    case "al_día":
      return "success";
    case "atrasado":
      return "warning";
    case "en_mora":
      return "danger";
  }
}

export function defaultRefundAmount(accumulatedSavings: string): string {
  return accumulatedSavings;
}

export function shouldCreateRefundExpense(nextStatus: "en_pausa" | "baja"): boolean {
  return nextStatus === "baja";
}

export function rateConfigChangesOnlyNewLoans(_: { oldUnit: string; newUnit: string }) {
  return "new_loans_only" as const;
}

export function fiscalYearForDate(date: Date, start: { month: number; day: number }) {
  const year = date.getUTCFullYear();
  const startDate = new Date(Date.UTC(year, start.month - 1, start.day));
  return date >= startDate ? year : year - 1;
}

export function contributionSuccessCopy(input: { memberName: string; amount: string; datedOn: string }) {
  return `Aporte de ${input.memberName} registrado - $${money2(input.amount)}, ${input.datedOn}`;
}

export function reversalSentence(input: { memberName: string; amount: string; datedOn: string }) {
  return `Vas a reversar el aporte de ${input.memberName} por $${money2(input.amount)} registrado el ${input.datedOn}.`;
}

export function quotaDefaultAmount(configAmount: string): string {
  return configAmount;
}

export function availableCapitalAfterBaseFund(input: { poolBalance: string; baseFundPool: string }) {
  return money4(Number(input.poolBalance) - Number(input.baseFundPool));
}

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
  return mapComplianceStatusToTone(state);
};

export interface LedgerService {
  readonly context: "ledger";
  getFirstRunState(orgId: string): Promise<FirstRunState>;
  saveFirstRunName(orgId: string, actorId: string, input: FirstRunNameForm): Promise<void>;
  completeFirstRun(orgId: string, actorId: string, input?: FirstRunCompleteForm): Promise<void>;
  /** Read spine: org-scoped list (a force-dynamic Server Component calls this). */
  listMembers(orgId: string): Promise<MemberRow[]>;
  listMembersWithCompliance(orgId: string): Promise<MemberWithCompliance[]>;
  listComplianceRows(orgId: string): Promise<MemberComplianceRow[]>;
  /** Read by id: org-scoped single row (a dynamic-route detail page calls this). */
  getMember(orgId: string, id: string): Promise<MemberRow | undefined>;
  /** Mutation: insert a validated row. The tenant is supplied separately (from the
   *  session), never by the caller's input. */
  createMember(orgId: string, input: NewMemberInput): Promise<MemberRow>;
  createMemberWithAudit(orgId: string, actorId: string, input: AddMemberForm): Promise<MemberRow>;
  transitionMemberStatus(orgId: string, actorId: string, input: MemberStatusTransitionForm): Promise<void>;
  getCurrentGroupConfig(orgId: string): Promise<typeof groupConfig.$inferSelect | undefined>;
  saveTreasurerGroupConfig(orgId: string, actorId: string, input: GroupConfigForm): Promise<typeof groupConfig.$inferSelect>;
  recordContribution(orgId: string, actorId: string, input: ContributionForm): Promise<typeof contribution.$inferSelect>;
  listContributions(orgId: string): Promise<Array<typeof contribution.$inferSelect & { memberName: string }>>;
  reverseContribution(orgId: string, actorId: string, input: ReverseContributionForm): Promise<void>;
  getBaseFundQuotaDefaults(orgId: string): Promise<{ fiscalYear: number; amount: string; members: MemberRow[] }>;
  recordBaseFundQuotaPayment(orgId: string, actorId: string, input: BaseFundQuotaPaymentForm): Promise<typeof baseFundQuotaPayment.$inferSelect>;
}

export const createLedgerService = (): LedgerService => ({
  context: "ledger",
  async getFirstRunState(orgId) {
    const [org] = await db.select().from(organization).where(eq(organization.id, orgId));
    if (!org) {
      throw new Error("Organization not found");
    }
    const [config] = await db.select().from(groupConfig)
      .where(and(eq(groupConfig.orgId, orgId), isNull(groupConfig.validTo)))
      .orderBy(desc(groupConfig.version));
    return {
      organization: org,
      config,
      step: nextWizardStep({ firstRunStep: org.firstRunStep, completedAt: org.firstRunCompletedAt }),
      rulesSummary: config
        ? summarizeRulesForWizard({
          contributionAmount: config.contributionAmount,
          loanRateValue: config.loanRateValue,
          lateThresholdDays: config.lateThresholdDays,
          moraThresholdDays: config.moraThresholdDays,
        })
        : [],
    };
  },
  async saveFirstRunName(orgId, actorId, input) {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(organization)
        .set({
          displayName: input.displayName,
          brandingLogoUri: input.brandingLogoUri || null,
          firstRunStep: 2,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(eq(organization.id, orgId));
      await tx.insert(auditLogEntry).values({
        orgId,
        actorKind: "member",
        actorId,
        actionKind: "first_run.name",
        subjectKind: "organization",
        subjectId: orgId,
        payloadSnapshot: { displayName: input.displayName, nextStep: input.nextStep },
        reason: null,
        at: now,
        createdAt: now,
      });
    });
  },
  async completeFirstRun(orgId, actorId) {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(organization)
        .set({ firstRunStep: 3, firstRunCompletedAt: now, updatedAt: now, updatedBy: actorId })
        .where(eq(organization.id, orgId));
      await tx.insert(auditLogEntry).values({
        orgId,
        actorKind: "member",
        actorId,
        actionKind: "first_run.complete",
        subjectKind: "organization",
        subjectId: orgId,
        payloadSnapshot: { completedAt: now },
        reason: null,
        at: now,
        createdAt: now,
      });
    });
  },
  async listMembers(orgId) {
    return db.select().from(member).where(eq(member.orgId, orgId));
  },
  async listMembersWithCompliance(orgId) {
    const rows = await db.select().from(member).where(eq(member.orgId, orgId)).orderBy(member.displayName);
    return rows.map((row) => ({
      ...row,
      complianceState: row.status === "activo" ? "al_dia" : "atrasado",
      complianceTone: row.status === "activo" ? "success" : "warning",
    }));
  },
  async listComplianceRows(orgId) {
    const rows = await this.listMembersWithCompliance(orgId);
    return rows.map((row) => ({
      memberId: row.id,
      displayName: row.displayName,
      state: row.complianceState,
      tone: row.complianceTone,
    }));
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
  async createMemberWithAudit(orgId, actorId, input) {
    const now = new Date();
    const memberId = randomUUID();
    const plan = buildMemberCreationLedgerPlan({
      orgId,
      actorId,
      memberId,
      now,
      displayName: input.displayName,
      whatsappNumber: normalizeWhatsapp(input.whatsappNumber),
      joinedOn: input.joinedOn,
      role: input.role,
      initialSavingsBalance: money4(input.initialSavingsBalance ?? "0"),
      notes: input.notes,
    });
    return db.transaction(async (tx) => {
      const [row] = await tx.insert(member).values(plan.member).returning();
      await tx.insert(entityVersion).values(plan.entityVersion);
      await tx.insert(auditLogEntry).values(plan.auditLogEntry);
      return row;
    });
  },
  async transitionMemberStatus(orgId, actorId, input) {
    const current = await this.getMember(orgId, input.memberId);
    if (!current) {
      throw new Error("Member not found");
    }
    const [latest] = await db.select().from(entityVersion)
      .where(and(eq(entityVersion.orgId, orgId), eq(entityVersion.entityId, current.id)))
      .orderBy(desc(entityVersion.version));
    const plan = buildMemberStatusTransitionLedgerPlan({
      orgId,
      actorId,
      now: new Date(),
      member: {
        id: current.id,
        orgId: current.orgId,
        displayName: current.displayName,
        status: current.status,
        initialSavingsBalance: current.initialSavingsBalance,
      },
      previousVersion: latest?.version ?? 1,
      nextStatus: input.nextStatus,
      reason: input.reason,
      refundAmount: input.refundAmount,
    });
    await db.transaction(async (tx) => {
      await tx.update(member).set(plan.memberUpdate)
        .where(and(eq(member.orgId, orgId), eq(member.id, current.id)));
      if (plan.refundExpense) {
        await tx.insert(expense).values(plan.refundExpense);
      }
      await tx.insert(entityVersion).values(plan.entityVersion);
      await tx.insert(auditLogEntry).values(plan.auditLogEntry);
    });
  },
  async getCurrentGroupConfig(orgId) {
    const [row] = await db.select().from(groupConfig)
      .where(and(eq(groupConfig.orgId, orgId), isNull(groupConfig.validTo)))
      .orderBy(desc(groupConfig.version));
    return row;
  },
  async saveTreasurerGroupConfig(orgId, actorId, input) {
    return createPlatformService().saveGroupConfig(orgId, input, actorId, "member");
  },
  async recordContribution(orgId, actorId, input) {
    const now = new Date();
    const [existing] = await db.select().from(contribution)
      .where(and(eq(contribution.orgId, orgId), eq(contribution.clientRequestId, input.clientRequestId)));
    if (existing) return existing;

    const [cycle] = await db.select().from(contributionCycle)
      .where(and(eq(contributionCycle.orgId, orgId), eq(contributionCycle.status, "open")))
      .orderBy(desc(contributionCycle.opensOn));

    const activeCycle = cycle ?? await db.transaction(async (tx) => {
      const label = input.datedOn.slice(0, 7);
      const [created] = await tx.insert(contributionCycle).values({
        orgId,
        cycleLabel: label,
        kind: "monthly",
        opensOn: `${label}-01`,
        closesOn: input.datedOn,
        expectedAmountPerMember: money4(input.amount),
        currencyCode: "USD",
        status: "open",
        createdAt: now,
        createdBy: actorId,
        createdByKind: "member",
      }).returning();
      return created;
    });

    return db.transaction(async (tx) => {
      const [row] = await tx.insert(contribution).values({
        orgId,
        cycleId: activeCycle.id,
        memberId: input.memberId,
        amount: money4(input.amount),
        currencyCode: "USD",
        datedOn: input.datedOn,
        recordedAt: now,
        slipPhotoId: input.slipPhotoId || null,
        notes: input.notes ?? null,
        reversesId: null,
        reverseReason: null,
        clientRequestId: input.clientRequestId,
        createdAt: now,
        createdBy: actorId,
        createdByKind: "member",
      }).returning();
      await tx.insert(auditLogEntry).values({
        orgId,
        actorKind: "member",
        actorId,
        actionKind: "contribution.create",
        subjectKind: "contribution",
        subjectId: row.id,
        payloadSnapshot: row,
        reason: null,
        at: now,
        createdAt: now,
      });
      return row;
    });
  },
  async listContributions(orgId) {
    const rows = await db.select({ contribution, memberName: member.displayName })
      .from(contribution)
      .innerJoin(member, and(eq(member.id, contribution.memberId), eq(member.orgId, contribution.orgId)))
      .where(eq(contribution.orgId, orgId))
      .orderBy(desc(contribution.recordedAt));
    return rows.map((row) => ({ ...row.contribution, memberName: row.memberName }));
  },
  async reverseContribution(orgId, actorId, input) {
    const now = new Date();
    const [original] = await db.select().from(contribution)
      .where(and(eq(contribution.orgId, orgId), eq(contribution.id, input.contributionId)));
    if (!original) throw new Error("Contribution not found");
    if (original.reversesId) throw new Error("Cannot reverse a reversal");
    const [existingReversal] = await db.select().from(contribution)
      .where(and(eq(contribution.orgId, orgId), eq(contribution.reversesId, original.id)));
    if (existingReversal) throw new Error("Contribution already reversed");
    await db.transaction(async (tx) => {
      const [row] = await tx.insert(contribution).values({
        orgId,
        cycleId: original.cycleId,
        memberId: original.memberId,
        amount: money4(-Number(original.amount)),
        currencyCode: original.currencyCode,
        datedOn: original.datedOn,
        recordedAt: now,
        slipPhotoId: null,
        notes: null,
        reversesId: original.id,
        reverseReason: input.reason,
        clientRequestId: randomUUID(),
        createdAt: now,
        createdBy: actorId,
        createdByKind: "member",
      }).returning();
      await tx.insert(auditLogEntry).values({
        orgId,
        actorKind: "member",
        actorId,
        actionKind: "contribution.reverse",
        subjectKind: "contribution",
        subjectId: row.id,
        payloadSnapshot: { originalId: original.id, reversalId: row.id },
        reason: input.reason,
        at: now,
        createdAt: now,
      });
    });
  },
  async getBaseFundQuotaDefaults(orgId) {
    const fiscalYear = new Date().getUTCFullYear();
    const [config] = await db.select().from(baseFundQuotaConfig)
      .where(and(eq(baseFundQuotaConfig.orgId, orgId), eq(baseFundQuotaConfig.fiscalYear, fiscalYear)));
    const members = await this.listMembers(orgId);
    return { fiscalYear, amount: config?.perMemberAmount ?? "25.0000", members };
  },
  async recordBaseFundQuotaPayment(orgId, actorId, input) {
    const now = new Date();
    return db.transaction(async (tx) => {
      const [row] = await tx.insert(baseFundQuotaPayment).values({
        orgId,
        memberId: input.memberId,
        fiscalYear: input.fiscalYear,
        amount: money4(input.amount),
        currencyCode: "USD",
        paidOn: input.paidOn,
        slipPhotoId: input.slipPhotoId || null,
        paidViaContributionId: null,
        createdAt: now,
        createdBy: actorId,
        createdByKind: "member",
      }).onConflictDoUpdate({
        target: [baseFundQuotaPayment.orgId, baseFundQuotaPayment.memberId, baseFundQuotaPayment.fiscalYear],
        set: {
          amount: money4(input.amount),
          paidOn: input.paidOn,
          slipPhotoId: input.slipPhotoId || null,
          createdAt: now,
          createdBy: actorId,
          createdByKind: "member",
        },
      }).returning();
      await tx.insert(auditLogEntry).values({
        orgId,
        actorKind: "member",
        actorId,
        actionKind: "base_fund_quota.payment",
        subjectKind: "base_fund_quota_payment",
        subjectId: row.id,
        payloadSnapshot: row,
        reason: null,
        at: now,
        createdAt: now,
      });
      return row;
    });
  },
});
