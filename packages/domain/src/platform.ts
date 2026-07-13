import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import {
  alert,
  auditLogEntry,
  baseFundQuotaConfig,
  entityVersion,
  groupConfig,
  organization,
  periodClose,
} from "@mi-banquito/db/schema";
import { withPlatformTransaction, withTenantTransaction, withWritableTenantTransaction } from "@mi-banquito/db/tenant";
import type { GroupConfigForm, OrganizationCreateForm } from "@mi-banquito/contracts";
import { type AuditWriter, writeWithAudit } from "./audit";
import { closeOverdueAlertState } from "./alerts";
import { buildA9GroupConfigChangedAlert } from "./sprint7-alerts";

export type CreateOrganizationInput = OrganizationCreateForm;
export type OrganizationLifecycleStatus = "paused" | "archived";

export type OrganizationLifecycleInput = {
  orgId: string;
  actorId: string;
  status: OrganizationLifecycleStatus;
  reason: string;
};

export type DefaultGroupConfigArgs = {
  orgId: string;
  currencyCode: string;
  actorId: string;
  now: Date;
};

export type BusinessRuleRow = {
  rule: string;
  currentValue: string;
  priorValue: string;
  newValue: string;
  validFrom: string;
  validTo: string;
  lastChangedAt: string;
  lastChangedBy: string;
  lastChangedByKind: string;
};

export type OrganizationCloseOverdueSnapshot = {
  latestClosedAt: Date | null;
  daysSinceClose: number;
  thresholdDays: number;
  overdue: boolean;
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

type BusinessRuleConfig = Pick<
  typeof groupConfig.$inferSelect,
  | "contributionCycleKind"
  | "contributionAmount"
  | "currencyCode"
  | "loanRateModel"
  | "loanRateValue"
  | "loanRatePeriodUnit"
  | "loanGracePeriods"
  | "loanToSavingsCapRatio"
  | "yearEndShareOutFormula"
  | "safetyMarginAmount"
  | "reconciliationToleranceAmount"
  | "lateThresholdDays"
  | "moraThresholdDays"
  | "fiscalYearStartMonth"
  | "fiscalYearStartDay"
  | "createdAt"
  | "createdBy"
  | "createdByKind"
  | "config"
>;

type ConfigJson = {
  baseFundQuota?: {
    fiscalYear?: number;
    perMemberAmount?: string;
  };
  nonMemberLoanRateValue?: string;
  adminFeePct?: string;
  referralCommissionAmount?: string;
  treasurerCompensation?: {
    kind?: string;
    amount?: string;
    period?: string;
  };
  opensOnDay?: number;
  close_overdue_threshold_days?: number | string;
  no_slip_consecutive_threshold?: number | string;
};

const periodLabels: Record<string, string> = {
  monthly: "mensual",
  weekly: "semanal",
  cycle: "por ciclo",
};

const contributionCycleLabels: Record<string, string> = {
  monthly: "mensual",
  weekly: "semanal",
};

const loanRateModelLabels: Record<string, string> = {
  declining_balance: "saldo decreciente",
};

const shareOutFormulaLabels: Record<string, string> = {
  proportional_time_weighted: "proporcional por tiempo",
};

const compensationKindLabels: Record<string, string> = {
  fixed: "fija",
  percentage: "porcentaje",
};

function asConfigJson(value: unknown): ConfigJson {
  return value && typeof value === "object" ? value : {};
}

function fixedNumber(value: string | number, digits: number) {
  return Number(value).toFixed(digits);
}

function currencySymbol(currencyCode: string) {
  return currencyCode === "USD" ? "$" : `${currencyCode} `;
}

function money(value: string | number | undefined, currencyCode: string) {
  if (value === undefined) {
    return undefined;
  }
  return `${currencySymbol(currencyCode)}${fixedNumber(value, 2)}`;
}

function percent(value: string | number | undefined) {
  if (value === undefined) {
    return undefined;
  }
  return `${fixedNumber(value, 2)}%`;
}

function dateValue(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function addOptionalRow(rows: BusinessRuleRow[], row: BusinessRuleRow | undefined) {
  if (row) {
    rows.push(row);
  }
}

type BusinessRuleMetadata = {
  priorValues?: Map<string, string>;
  currentValues?: Map<string, string>;
  validFrom?: Date;
  validTo?: Date | null;
  lastChangedAt?: Date;
  lastChangedBy?: string;
  lastChangedByKind?: string;
};

function rowForRule(
  metadata: Required<Omit<BusinessRuleMetadata, "priorValues" | "currentValues">> & Pick<BusinessRuleMetadata, "priorValues" | "currentValues">,
  rule: string,
  value: string,
): BusinessRuleRow {
  return {
    rule,
    currentValue: metadata.currentValues?.get(rule) ?? value,
    priorValue: metadata.priorValues?.get(rule) ?? "",
    newValue: value,
    validFrom: metadata.validFrom.toISOString(),
    validTo: metadata.validTo?.toISOString() ?? "",
    lastChangedAt: metadata.lastChangedAt.toISOString(),
    lastChangedBy: metadata.lastChangedBy,
    lastChangedByKind: metadata.lastChangedByKind,
  };
}

function businessRuleRowsForConfig(
  config: BusinessRuleConfig,
  metadata: BusinessRuleMetadata = {},
): BusinessRuleRow[] {
  const json = asConfigJson(config.config);
  const rowMetadata = {
    priorValues: metadata.priorValues,
    currentValues: metadata.currentValues,
    validFrom: dateValue(metadata.validFrom ?? config.createdAt),
    validTo: metadata.validTo ?? null,
    lastChangedAt: dateValue(metadata.lastChangedAt ?? config.createdAt),
    lastChangedBy: metadata.lastChangedBy ?? config.createdBy,
    lastChangedByKind: metadata.lastChangedByKind ?? config.createdByKind,
  };
  const cycle = contributionCycleLabels[config.contributionCycleKind] ?? config.contributionCycleKind;
  const ratePeriod = periodLabels[config.loanRatePeriodUnit] ?? config.loanRatePeriodUnit;
  const baseQuota = money(json.baseFundQuota?.perMemberAmount, config.currencyCode);
  const adminFee = percent(json.adminFeePct);
  const referralCommission = money(json.referralCommissionAmount, config.currencyCode);
  const treasurerCompensation = money(json.treasurerCompensation?.amount, config.currencyCode);

  const rows: BusinessRuleRow[] = [
    rowForRule(rowMetadata, "Aporte regular", `${money(config.contributionAmount, config.currencyCode)} ${cycle}`),
    rowForRule(rowMetadata, "Tasa para socias", `${percent(config.loanRateValue)} ${ratePeriod}`),
    rowForRule(rowMetadata, "Modelo de tasa", loanRateModelLabels[config.loanRateModel] ?? config.loanRateModel),
    rowForRule(rowMetadata, "Tope préstamo / ahorro", `${fixedNumber(config.loanToSavingsCapRatio, 2)}x el ahorro`),
    rowForRule(rowMetadata, "Periodos de gracia", `${config.loanGracePeriods}`),
    rowForRule(rowMetadata, "Atraso", `Después de ${config.lateThresholdDays} días`),
    rowForRule(rowMetadata, "Mora", `Después de ${config.moraThresholdDays} días`),
    rowForRule(rowMetadata, "Fórmula de reparto", shareOutFormulaLabels[config.yearEndShareOutFormula ?? ""] ?? config.yearEndShareOutFormula ?? "No definida"),
    rowForRule(rowMetadata, "Margen de seguridad", money(config.safetyMarginAmount, config.currencyCode) ?? "No definido"),
    rowForRule(rowMetadata, "Tolerancia de conciliación", money(config.reconciliationToleranceAmount, config.currencyCode) ?? "No definida"),
    rowForRule(rowMetadata, "Inicio fiscal", `${config.fiscalYearStartDay}/${config.fiscalYearStartMonth}`),
  ];

  addOptionalRow(rows, json.opensOnDay === undefined ? undefined : {
    ...rowForRule(rowMetadata, "Día de apertura", `Día ${json.opensOnDay}`),
  });
  addOptionalRow(rows, json.nonMemberLoanRateValue === undefined ? undefined : {
    ...rowForRule(rowMetadata, "Tasa para no socias", `${percent(json.nonMemberLoanRateValue)} ${ratePeriod}`),
  });
  addOptionalRow(rows, baseQuota === undefined ? undefined : {
    ...rowForRule(rowMetadata, "Cuota base", json.baseFundQuota?.fiscalYear
      ? `${baseQuota} en ${json.baseFundQuota.fiscalYear}`
      : baseQuota),
  });
  addOptionalRow(rows, adminFee === undefined ? undefined : {
    ...rowForRule(rowMetadata, "Comisión administrativa", adminFee),
  });
  addOptionalRow(rows, referralCommission === undefined ? undefined : {
    ...rowForRule(rowMetadata, "Comisión por referida", referralCommission),
  });
  addOptionalRow(rows, treasurerCompensation === undefined ? undefined : {
    ...rowForRule(
      rowMetadata,
      "Compensación tesorera",
      `${treasurerCompensation} ${periodLabels[json.treasurerCompensation?.period ?? ""] ?? json.treasurerCompensation?.period ?? ""}`.trim(),
    ),
  });
  addOptionalRow(rows, json.treasurerCompensation?.kind === undefined ? undefined : {
    ...rowForRule(
      rowMetadata,
      "Tipo compensación tesorera",
      compensationKindLabels[json.treasurerCompensation.kind] ?? json.treasurerCompensation.kind,
    ),
  });

  return rows;
}

export function businessRuleRowsFromConfig(config: BusinessRuleConfig): BusinessRuleRow[] {
  return businessRuleRowsForConfig(config);
}

function rowsByRule(rows: BusinessRuleRow[]): Map<string, string> {
  return new Map(rows.map((row) => [row.rule, row.newValue]));
}

function normalizedConfigValue(value: unknown, digits = 4): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "number" || typeof value === "string") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(digits) : String(value);
  }
  return String(value);
}

function alertConfigValues(config: typeof groupConfig.$inferSelect): Record<string, string | null> {
  const json = asConfigJson(config.config);
  return {
    contribution_amount: normalizedConfigValue(config.contributionAmount),
    interest_rate_pct: normalizedConfigValue(config.loanRateValue),
    loan_to_savings_cap_ratio: normalizedConfigValue(config.loanToSavingsCapRatio, 2),
    late_threshold_days: normalizedConfigValue(config.lateThresholdDays, 0),
    mora_threshold_days: normalizedConfigValue(config.moraThresholdDays, 0),
    reconciliation_tolerance_amount: normalizedConfigValue(config.reconciliationToleranceAmount),
    safety_margin_amount: normalizedConfigValue(config.safetyMarginAmount),
    base_quota_amount: normalizedConfigValue(json.baseFundQuota?.perMemberAmount),
    no_slip_consecutive_threshold: normalizedConfigValue(json.no_slip_consecutive_threshold, 0),
  };
}

function changedAlertConfigKeys(input: {
  previous: typeof groupConfig.$inferSelect | undefined;
  next: typeof groupConfig.$inferSelect;
}): string[] {
  if (!input.previous) {
    return [];
  }
  const previous = alertConfigValues(input.previous);
  const next = alertConfigValues(input.next);
  return Object.keys(next).filter((key) => previous[key] !== next[key]);
}

function isBusinessRuleConfig(value: unknown): value is BusinessRuleConfig {
  return Boolean(value && typeof value === "object" && "contributionAmount" in value && "loanRateValue" in value);
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
  getOrganizationCloseOverdueSnapshot(orgId: string, today?: Date): Promise<OrganizationCloseOverdueSnapshot | undefined>;
  getCurrentGroupConfig(orgId: string): Promise<typeof groupConfig.$inferSelect | undefined>;
  listBusinessRuleRows(orgId: string): Promise<BusinessRuleRow[]>;
  recordBusinessRulesView(orgId: string, actorId: string): Promise<void>;
  updateOrganizationLifecycle(input: OrganizationLifecycleInput): Promise<typeof organization.$inferSelect>;
  saveGroupConfig(orgId: string, input: GroupConfigForm, actorId: string, actorKind: GroupConfigActorKind): Promise<typeof groupConfig.$inferSelect>;
}

const defaultAuditWriter: PlatformAuditWriter = async ({ tx, entry }) => {
  await tx.insert(auditLogEntry).values(entry);
};

function configJson(input: GroupConfigForm, previousConfig?: unknown) {
  const preserved = asConfigJson(previousConfig);
  return {
    ...preserved,
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
  previousConfig?: unknown;
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
    config: configJson(args.input, args.previousConfig),
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
      const orgId = await withPlatformTransaction({
        operation: "organization_provisioning",
        reason: "create organization and initial tenant configuration",
      }, async (tx) => {
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

            const [initialConfig] = await tx.insert(groupConfig).values(buildDefaultGroupConfigValues({
              orgId: org.id,
              currencyCode: input.currencyCode,
              actorId,
              now,
            })).returning();

            await tx.insert(entityVersion).values({
              orgId: org.id,
              entityKind: "GroupConfig",
              entityId: initialConfig.id,
              version: initialConfig.version,
              validFrom: initialConfig.validFrom,
              validTo: initialConfig.validTo,
              payloadSnapshot: initialConfig,
              changeKind: "create",
              changeReason: null,
              createdAt: now,
              createdBy: actorId,
              createdByKind: "platform_operator",
            });
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

      const auth0Org = await auth0.createOrganization({ displayName: input.displayName, orgId });
      if (auth0Org.auth0OrgId) {
        await withPlatformTransaction({
          operation: "organization_provider_binding",
          reason: "persist Auth0 organization binding after provider provisioning",
        }, async (tx) => {
          await tx.update(organization).set({
            auth0OrgId: auth0Org.auth0OrgId,
            updatedAt: new Date(),
            updatedBy: actorId,
          })
            .where(eq(organization.id, orgId));
        });
      }
      return orgId;
    },
    async listOrganizations() {
      return db.select().from(organization).orderBy(desc(organization.createdAt));
    },
    async getOrganization(id) {
      const [row] = await db.select().from(organization).where(eq(organization.id, id));
      return row;
    },
    async getOrganizationCloseOverdueSnapshot(orgId, today = new Date()) {
      const org = await this.getOrganization(orgId);
      if (!org) {
        return undefined;
      }

      return withTenantTransaction(orgId, async (tx) => {
        const [config] = await tx.select({ config: groupConfig.config })
          .from(groupConfig)
          .where(and(eq(groupConfig.orgId, orgId), isNull(groupConfig.validTo)))
          .orderBy(desc(groupConfig.version))
          .limit(1);
        const [latestClose] = await tx.select({ closedAt: periodClose.closedAt })
          .from(periodClose)
          .where(eq(periodClose.orgId, orgId))
          .orderBy(desc(periodClose.closedAt))
          .limit(1);
        const json = asConfigJson(config?.config);
        const threshold = Number(json.close_overdue_threshold_days);
        const state = closeOverdueAlertState({
          today,
          latestClosedAt: latestClose?.closedAt ?? null,
          fallbackStartedAt: org.createdAt,
          thresholdDays: Number.isInteger(threshold) && threshold > 0 ? threshold : undefined,
        });

        return {
          latestClosedAt: latestClose?.closedAt ?? null,
          daysSinceClose: state.daysSinceClose,
          thresholdDays: state.thresholdDays,
          overdue: state.overdue,
        };
      });
    },
    async getCurrentGroupConfig(orgId) {
      const [row] = await db.select().from(groupConfig)
        .where(and(eq(groupConfig.orgId, orgId), isNull(groupConfig.validTo)))
        .orderBy(desc(groupConfig.version));
      return row;
    },
    async listBusinessRuleRows(orgId) {
      const current = await this.getCurrentGroupConfig(orgId);
      if (!current) {
        return [];
      }

      const currentRows = businessRuleRowsFromConfig(current);
      const currentValues = rowsByRule(currentRows);
      const versions = await db.select().from(entityVersion)
        .where(and(eq(entityVersion.orgId, orgId), eq(entityVersion.entityKind, "GroupConfig")))
        .orderBy(desc(entityVersion.version));
      const ascendingVersions = [...versions].reverse();
      const priorValuesByVersion = new Map<number, Map<string, string>>();
      let previousValues: Map<string, string> | undefined;

      for (const version of ascendingVersions) {
        if (isBusinessRuleConfig(version.payloadSnapshot)) {
          priorValuesByVersion.set(version.version, previousValues ?? new Map());
          previousValues = rowsByRule(businessRuleRowsForConfig(version.payloadSnapshot));
        }
      }

      const historyRows = versions.flatMap((version) => {
        if (!isBusinessRuleConfig(version.payloadSnapshot)) {
          return [];
        }
        return businessRuleRowsForConfig(version.payloadSnapshot, {
          priorValues: priorValuesByVersion.get(version.version),
          currentValues,
          validFrom: version.validFrom,
          validTo: version.validTo,
          lastChangedAt: version.createdAt,
          lastChangedBy: version.createdBy,
          lastChangedByKind: version.createdByKind,
        });
      });

      return historyRows.length > 0 ? historyRows : currentRows;
    },
    async recordBusinessRulesView(orgId, actorId) {
      const now = new Date();
      await withWritableTenantTransaction(orgId, async (tx) => {
        await auditWriter({
          tx,
          entry: {
          orgId,
          actorKind: "platform_operator",
          actorId,
          actionKind: "business_rules.view",
          subjectKind: "organization",
          subjectId: orgId,
          payloadSnapshot: { orgId },
          reason: null,
          at: now,
          createdAt: now,
          },
        });
      });
    },
    async updateOrganizationLifecycle(input) {
      const reason = input.reason.trim();
      if (!reason) {
        throw new Error("organization_lifecycle_reason_required");
      }
      if (input.status !== "paused" && input.status !== "archived") {
        throw new Error("organization_lifecycle_status_invalid");
      }

      return withPlatformTransaction({
        operation: "organization_lifecycle",
        reason,
      }, async (tx) => {
        const now = new Date();
        let updated: typeof organization.$inferSelect | undefined;
        let priorStatus: string | undefined;
        return writeWithAudit({
          write: async () => {
            const [current] = await tx.select().from(organization).where(eq(organization.id, input.orgId));
            if (!current) {
              throw new Error("organization_not_found");
            }
            priorStatus = current.status;
            const [row] = await tx.update(organization)
              .set({
                status: input.status,
                updatedAt: now,
                updatedBy: input.actorId,
              })
              .where(eq(organization.id, input.orgId))
              .returning();
            updated = row;
            return row;
          },
          audit: async () => {
            if (!updated || !priorStatus) {
              throw new Error("organization lifecycle audit subject is missing");
            }
            await auditWriter({
              tx,
              entry: {
                orgId: input.orgId,
                actorKind: "platform_operator",
                actorId: input.actorId,
                actionKind: "organization.lifecycle",
                subjectKind: "organization",
                subjectId: input.orgId,
                payloadSnapshot: {
                  orgId: input.orgId,
                  priorStatus,
                  newStatus: input.status,
                },
                reason,
                at: now,
                createdAt: now,
              },
            });
          },
        });
      });
    },
    async saveGroupConfig(orgId, input, actorId, actorKind) {
      return withWritableTenantTransaction(orgId, async (tx) => {
        const now = new Date();
        let auditEntry: PlatformAuditEntry | undefined;
        let alertAuditEntry: PlatformAuditEntry | undefined;
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
              await tx.update(entityVersion)
                .set({ validTo: now })
                .where(and(
                  eq(entityVersion.orgId, orgId),
                  eq(entityVersion.entityKind, "GroupConfig"),
                  eq(entityVersion.entityId, current.id),
                  eq(entityVersion.version, current.version),
                ));
            }

            const [next] = await tx.insert(groupConfig).values(groupConfigInsertFromForm({
              orgId,
              input,
              actorId,
              actorKind,
              version: nextVersion,
              now,
              previousConfig: current?.config,
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

            await tx.insert(entityVersion).values({
              orgId,
              entityKind: "GroupConfig",
              entityId: next.id,
              version: next.version,
              validFrom: next.validFrom,
              validTo: next.validTo,
              payloadSnapshot: next,
              changeKind: current ? "update" : "create",
              changeReason: null,
              createdAt: now,
              createdBy: actorId,
              createdByKind: actorKind === "platform_operator" ? "platform_operator" : "member",
            });

            const changedKeys = changedAlertConfigKeys({ previous: current, next });
            if (changedKeys.length > 0) {
              const alertRow = buildA9GroupConfigChangedAlert({
                orgId,
                configId: next.id,
                changedKeys,
                actorLabel: `${actorKind}:${actorId}`,
                now,
              });
              await tx.insert(alert).values(alertRow);
              alertAuditEntry = {
                orgId,
                actorKind: "system",
                actorId,
                actionKind: "alert.group_config_changed.emit",
                subjectKind: "alert",
                subjectId: alertRow.id,
                payloadSnapshot: {
                  alertKind: "A9",
                  configId: next.id,
                  changedKeys,
                },
                reason: null,
                at: now,
                createdAt: now,
              };
            }

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
            if (alertAuditEntry) {
              await auditWriter({ tx, entry: alertAuditEntry });
            }
          },
        });
      });
    },
  };
};
