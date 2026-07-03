import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import {
  auditLogEntry,
  baseFundQuotaConfig,
  groupConfig,
  organization,
} from "@mi-banquito/db/schema";
import type { GroupConfigForm, OrganizationCreateForm } from "@mi-banquito/contracts";
import { type AuditWriter, writeWithAudit } from "./audit";

export type CreateOrganizationInput = OrganizationCreateForm;

export type DefaultGroupConfigArgs = {
  orgId: string;
  currencyCode: string;
  actorId: string;
  now: Date;
};

export function buildDefaultGroupConfigValues(args: DefaultGroupConfigArgs): typeof groupConfig.$inferInsert {
  return {
    orgId: args.orgId,
    version: 1,
    validFrom: args.now,
    validTo: null,
    contributionCycleKind: "monthly",
    contributionAmount: "20.0000",
    currencyCode: args.currencyCode,
    loanRateModel: "declining_balance",
    loanRateValue: "4.0000",
    loanRatePeriodUnit: "monthly",
    loanGracePeriods: 0,
    loanToSavingsCapRatio: "2.00",
    interestResolution: "daily",
    repaymentSplitRule: "interest_first",
    paysSavingsInterest: true,
    savingsInterestRate: "0.0000",
    yearEndShareOutFormula: "proportional_time_weighted",
    safetyMarginAmount: "0.0000",
    reconciliationToleranceAmount: "1.0000",
    lateThresholdDays: 3,
    moraThresholdDays: 15,
    fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1,
    config: {
      mora: { lateThresholdDays: 3, moraThresholdDays: 15 },
      distribution: { formula: "proportional_time_weighted" },
      baseFundQuota: { fiscalYear: args.now.getUTCFullYear(), perMemberAmount: "25.0000" },
      nonMemberLoanRateValue: "5.0000",
      adminFeePct: "1.0000",
      referralCommissionAmount: "5.0000",
      treasurerCompensation: { kind: "fixed", amount: "10.0000", period: "monthly" },
    },
    createdAt: args.now,
    createdBy: args.actorId,
    createdByKind: "platform_operator",
  };
}

export function createOrgAuditPayload(input: Pick<CreateOrganizationInput, "displayName" | "countryCode">) {
  return { displayName: input.displayName, countryCode: input.countryCode };
}

export function buildConfigAuditSummary(input: { beforeVersion: number; afterVersion: number }) {
  return input;
}

export function summarizeConfigForTreasurer(input: {
  contributionAmount: string;
  memberLoanRateValue: string;
  loanRatePeriodUnit: string;
  baseFundQuotaAmount: string;
}) {
  const aporte = Number(input.contributionAmount).toFixed(2);
  const tasa = Number(input.memberLoanRateValue).toFixed(2);
  const cuota = Number(input.baseFundQuotaAmount).toFixed(2);
  return `Aporte $${aporte}; prestamos de socias al ${tasa}% ${input.loanRatePeriodUnit}; cuota base $${cuota}.`;
}

export interface Auth0OrgProvisioner {
  createOrganization(input: { displayName: string; orgId: string }): Promise<{ auth0OrgId?: string }>;
}

export type GroupConfigActorKind = "platform_operator" | "member";
export type PlatformAuditEntry = typeof auditLogEntry.$inferInsert;
export type PlatformAuditTx = {
  insert(table: typeof auditLogEntry): {
    values(values: PlatformAuditEntry): unknown;
  };
};
export type PlatformAuditWriter = AuditWriter<PlatformAuditEntry, PlatformAuditTx>;

export interface PlatformServiceOptions {
  auditWriter?: PlatformAuditWriter;
}

export interface PlatformService {
  readonly context: "platform";
  createOrganization(input: CreateOrganizationInput, actorId: string, auth0: Auth0OrgProvisioner): Promise<string>;
  listOrganizations(): Promise<Array<typeof organization.$inferSelect>>;
  getOrganization(id: string): Promise<typeof organization.$inferSelect | undefined>;
  getCurrentGroupConfig(orgId: string): Promise<typeof groupConfig.$inferSelect | undefined>;
  saveGroupConfig(orgId: string, input: GroupConfigForm, actorId: string, actorKind: GroupConfigActorKind): Promise<typeof groupConfig.$inferSelect>;
}

const defaultAuditWriter: PlatformAuditWriter = async ({ tx, entry }) => {
  await tx.insert(auditLogEntry).values(entry);
};

function configJson(input: GroupConfigForm) {
  return {
    mora: { lateThresholdDays: input.lateThresholdDays, moraThresholdDays: input.moraThresholdDays },
    distribution: { formula: input.yearEndShareOutFormula },
    baseFundQuota: {
      fiscalYear: input.baseFundQuotaFiscalYear,
      perMemberAmount: `${Number(input.baseFundQuotaAmount).toFixed(4)}`,
    },
    nonMemberLoanRateValue: `${Number(input.nonMemberLoanRateValue).toFixed(4)}`,
    adminFeePct: `${Number(input.adminFeePct).toFixed(4)}`,
    referralCommissionAmount: `${Number(input.referralCommissionAmount).toFixed(4)}`,
    treasurerCompensation: {
      kind: input.treasurerCompensationKind,
      amount: `${Number(input.treasurerCompensationAmount).toFixed(4)}`,
      period: input.treasurerCompensationPeriod,
    },
    opensOnDay: input.opensOnDay,
  };
}

function groupConfigInsertFromForm(args: {
  orgId: string;
  input: GroupConfigForm;
  actorId: string;
  actorKind: GroupConfigActorKind;
  version: number;
  now: Date;
}): typeof groupConfig.$inferInsert {
  return {
    orgId: args.orgId,
    version: args.version,
    validFrom: args.now,
    validTo: null,
    contributionCycleKind: args.input.contributionCycleKind,
    contributionAmount: `${Number(args.input.contributionAmount).toFixed(4)}`,
    currencyCode: "USD",
    loanRateModel: args.input.loanRateModel,
    loanRateValue: `${Number(args.input.memberLoanRateValue).toFixed(4)}`,
    loanRatePeriodUnit: args.input.loanRatePeriodUnit,
    loanGracePeriods: args.input.loanGracePeriods,
    loanToSavingsCapRatio: `${Number(args.input.loanToSavingsCapRatio).toFixed(2)}`,
    interestResolution: "daily",
    repaymentSplitRule: "interest_first",
    paysSavingsInterest: true,
    savingsInterestRate: "0.0000",
    yearEndShareOutFormula: args.input.yearEndShareOutFormula,
    safetyMarginAmount: "0.0000",
    reconciliationToleranceAmount: `${Number(args.input.reconciliationToleranceAmount).toFixed(4)}`,
    lateThresholdDays: args.input.lateThresholdDays,
    moraThresholdDays: args.input.moraThresholdDays,
    fiscalYearStartMonth: args.input.fiscalYearStartMonth,
    fiscalYearStartDay: args.input.fiscalYearStartDay,
    config: configJson(args.input),
    createdAt: args.now,
    createdBy: args.actorId,
    createdByKind: args.actorKind,
  };
}

export const createPlatformService = (options: PlatformServiceOptions = {}): PlatformService => {
  const auditWriter = options.auditWriter ?? defaultAuditWriter;

  return {
    context: "platform",
    async createOrganization(input, actorId, auth0) {
      const orgId = await db.transaction(async (tx) => {
        const now = new Date();
        let orgId: string | undefined;
        return writeWithAudit({
          write: async () => {
            const [org] = await tx.insert(organization).values({
              displayName: input.displayName,
              countryCode: input.countryCode,
              currencyCode: input.currencyCode,
              timezone: input.timezone,
              defaultLanguage: input.defaultLanguage,
              status: "active",
              brandingLogoUri: input.brandingLogoUri || null,
              createdAt: now,
              createdBy: actorId,
              createdByKind: "platform_operator",
              platformOperatorId: actorId,
            }).returning();

            await tx.insert(groupConfig).values(buildDefaultGroupConfigValues({
              orgId: org.id,
              currencyCode: input.currencyCode,
              actorId,
              now,
            }));
            orgId = org.id;
            return org.id;
          },
          audit: async () => {
            if (!orgId) {
              throw new Error("organization audit subject is missing");
            }
            await auditWriter({
              tx,
              entry: {
                orgId,
                actorKind: "platform_operator",
                actorId,
                actionKind: "organization.create",
                subjectKind: "organization",
                subjectId: orgId,
                payloadSnapshot: createOrgAuditPayload(input),
                reason: null,
                at: now,
                createdAt: now,
              },
            });
          },
        });
      });

      await auth0.createOrganization({ displayName: input.displayName, orgId });
      return orgId;
    },
    async listOrganizations() {
      return db.select().from(organization).orderBy(desc(organization.createdAt));
    },
    async getOrganization(id) {
      const [row] = await db.select().from(organization).where(eq(organization.id, id));
      return row;
    },
    async getCurrentGroupConfig(orgId) {
      const [row] = await db.select().from(groupConfig)
        .where(and(eq(groupConfig.orgId, orgId), isNull(groupConfig.validTo)))
        .orderBy(desc(groupConfig.version));
      return row;
    },
    async saveGroupConfig(orgId, input, actorId, actorKind) {
      return db.transaction(async (tx) => {
        const now = new Date();
        let auditEntry: PlatformAuditEntry | undefined;
        return writeWithAudit({
          write: async () => {
            const [current] = await tx.select().from(groupConfig)
              .where(and(eq(groupConfig.orgId, orgId), isNull(groupConfig.validTo)))
              .orderBy(desc(groupConfig.version));
            const nextVersion = (current?.version ?? 0) + 1;

            if (current) {
              await tx.update(groupConfig)
                .set({ validTo: now })
                .where(eq(groupConfig.id, current.id));
            }

            const [next] = await tx.insert(groupConfig).values(groupConfigInsertFromForm({
              orgId,
              input,
              actorId,
              actorKind,
              version: nextVersion,
              now,
            })).returning();

            await tx.insert(baseFundQuotaConfig).values({
              orgId,
              fiscalYear: input.baseFundQuotaFiscalYear,
              perMemberAmount: `${Number(input.baseFundQuotaAmount).toFixed(4)}`,
              currencyCode: "USD",
              createdAt: now,
              createdBy: actorId,
              createdByKind: actorKind,
            }).onConflictDoUpdate({
              target: [baseFundQuotaConfig.orgId, baseFundQuotaConfig.fiscalYear],
              set: {
                perMemberAmount: `${Number(input.baseFundQuotaAmount).toFixed(4)}`,
                currencyCode: "USD",
                createdAt: now,
                createdBy: actorId,
                createdByKind: actorKind,
              },
            });

            auditEntry = {
              orgId,
              actorKind,
              actorId,
              actionKind: "group_config.version",
              subjectKind: "group_config",
              subjectId: next.id,
              payloadSnapshot: buildConfigAuditSummary({ beforeVersion: current?.version ?? 0, afterVersion: next.version }),
              reason: summarizeConfigForTreasurer({
                contributionAmount: next.contributionAmount,
                memberLoanRateValue: next.loanRateValue,
                loanRatePeriodUnit: next.loanRatePeriodUnit,
                baseFundQuotaAmount: input.baseFundQuotaAmount,
              }),
              at: now,
              createdAt: now,
            };

            return next;
          },
          audit: async () => {
            if (!auditEntry) {
              throw new Error("group config audit entry is missing");
            }
            await auditWriter({ tx, entry: auditEntry });
          },
        });
      });
    },
  };
};
