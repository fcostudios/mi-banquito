import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import {
  alert,
  auditLogEntry,
  entityVersion,
  groupConfig,
  member,
  organization,
  treasurerCompensationDisbursement,
  withdrawal,
} from "@mi-banquito/db/schema";
import { lockTenantMoneyWrites, withTenantTransaction, withWritableTenantTransaction } from "@mi-banquito/db/tenant";
import type { DateOnlyString } from "./collections";
import { formatMoney4Units, parseMoney4Units } from "./money4";
import {
  computeTreasurerCompensationBreakdownInTransaction,
  fiscalYearForCompensationPeriod,
} from "./treasurer-compensation";

export type CompensationPeriod = "monthly" | "yearly";

export type TreasurerCompensationConfig = {
  kind?: string;
  amount?: string | number;
  currency?: string;
  currencyCode?: string;
  period?: string;
  nextDueOn?: string;
  next_due_on?: string;
};

export type AwardDueTreasurerCompensationResult = {
  orgsProcessed: number;
  configsScanned: number;
  dueConfigs: number;
  disbursementsAwarded: number;
  disbursementsAccruedWithoutCash: number;
  skippedExistingDisbursements: number;
  configsAdvanced: number;
  failures: Array<{ orgId: string; message: string }>;
};

export interface CompensationService {
  readonly context: "compensation";
  awardDueTreasurerCompensation(todayIso: DateOnlyString): Promise<AwardDueTreasurerCompensationResult>;
}

export type CompensationServiceOptions = {
  now?: () => Date;
  beforeMoneyLock?: (orgId: string) => void | Promise<void>;
  afterMoneyLock?: (orgId: string) => void | Promise<void>;
};

type GroupConfigRow = typeof groupConfig.$inferSelect;
type TenantTransaction = Parameters<Parameters<typeof withTenantTransaction>[1]>[0];

const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";
const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateParts(value: string): { year: number; month: number; day: number } {
  const match = dateOnlyPattern.exec(value);
  if (!match) {
    throw new Error("date_must_be_date_only");
  }

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    date.getUTCFullYear() !== parts.year
    || date.getUTCMonth() + 1 !== parts.month
    || date.getUTCDate() !== parts.day
  ) {
    throw new Error("date_must_be_valid");
  }
  return parts;
}

function isDateOnly(value: string | undefined): value is DateOnlyString {
  if (!value) {
    return false;
  }
  try {
    dateParts(value);
    return true;
  } catch {
    return false;
  }
}

function dateOnlyFromParts(year: number, month: number, day: number): DateOnlyString {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-") as DateOnlyString;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function compensationNextDueOn(config: TreasurerCompensationConfig): DateOnlyString | null {
  const value = config.nextDueOn ?? config.next_due_on;
  return isDateOnly(value) ? value : null;
}

function isCompensationPeriod(value: string | undefined): value is CompensationPeriod {
  return value === "monthly" || value === "yearly";
}

function isFixedCompensationKind(value: string | undefined): boolean {
  return value === "fixed" || value === "fixed_periodic";
}

function amountString(value: string | number | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  try {
    const units = parseMoney4Units(String(value));
    return units < BigInt(0) ? null : formatMoney4Units(units);
  } catch {
    return null;
  }
}

function configObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function treasurerCompensationConfig(value: unknown): TreasurerCompensationConfig | null {
  const config = configObject(value);
  const compensation = config.treasurerCompensation;
  return typeof compensation === "object" && compensation !== null && !Array.isArray(compensation)
    ? compensation as TreasurerCompensationConfig
    : null;
}

export function nextCompensationDueOn(
  currentDueOn: DateOnlyString,
  period: CompensationPeriod,
): DateOnlyString {
  const current = dateParts(currentDueOn);
  if (period === "monthly") {
    const monthIndex = current.month;
    const nextYear = current.year + Math.floor(monthIndex / 12);
    const nextMonth = (monthIndex % 12) + 1;
    const nextDay = Math.min(current.day, daysInMonth(nextYear, nextMonth));
    return dateOnlyFromParts(nextYear, nextMonth, nextDay);
  }

  const nextYear = current.year + 1;
  const nextDay = Math.min(current.day, daysInMonth(nextYear, current.month));
  return dateOnlyFromParts(nextYear, current.month, nextDay);
}

export function periodLabelForCompensation(
  dueOn: DateOnlyString,
  period: CompensationPeriod,
): string {
  dateParts(dueOn);
  return period === "monthly" ? dueOn.slice(0, 7) : dueOn.slice(0, 4);
}

export function shouldAwardFixedPeriodicCompensation(
  config: TreasurerCompensationConfig | null | undefined,
  todayIso: DateOnlyString,
): boolean {
  dateParts(todayIso);
  if (!config || !isFixedCompensationKind(config.kind) || !isCompensationPeriod(config.period)) {
    return false;
  }
  const nextDueOn = compensationNextDueOn(config);
  return nextDueOn !== null && amountString(config.amount) !== null && nextDueOn <= todayIso;
}

function buildAdvancedConfigJson(row: GroupConfigRow, nextDueOn: DateOnlyString): Record<string, unknown> {
  const json = configObject(row.config);
  const compensation = configObject(json.treasurerCompensation);
  return {
    ...json,
    treasurerCompensation: {
      ...compensation,
      nextDueOn,
    },
  };
}

async function advanceGroupConfig(
  tx: TenantTransaction,
  row: GroupConfigRow,
  nextDueOn: DateOnlyString,
  now: Date,
): Promise<void> {
  const nextConfigId = randomUUID();
  const nextConfig = buildAdvancedConfigJson(row, nextDueOn);
  const {
    id: _id,
    validFrom: _validFrom,
    validTo: _validTo,
    config: _config,
    version: _version,
    createdAt: _createdAt,
    ...copyable
  } = row;

  await tx.update(groupConfig)
    .set({ validTo: now })
    .where(and(eq(groupConfig.orgId, row.orgId), eq(groupConfig.id, row.id), isNull(groupConfig.validTo)));
  await tx.insert(groupConfig).values({
    ...copyable,
    id: nextConfigId,
    version: row.version + 1,
    validFrom: now,
    validTo: null,
    config: nextConfig,
    createdAt: now,
    createdBy: row.createdBy,
    createdByKind: row.createdByKind,
  });
  await tx.insert(entityVersion).values({
    orgId: row.orgId,
    entityKind: "GroupConfig",
    entityId: nextConfigId,
    version: row.version + 1,
    validFrom: now,
    validTo: null,
    payloadSnapshot: {
      ...copyable,
      id: nextConfigId,
      version: row.version + 1,
      validFrom: now,
      validTo: null,
      config: nextConfig,
      createdAt: now,
    },
    changeKind: "update",
    changeReason: "treasurer_compensation_next_due_on_advanced",
    createdAt: now,
    createdBy: SYSTEM_ACTOR_ID,
    createdByKind: "system",
  });
}

async function listActiveOrganizationIdsForSystemScheduler(): Promise<string[]> {
  const rows = await db.select({ id: organization.id }).from(organization)
    .where(eq(organization.status, "active"));
  return rows.map((row) => row.id);
}

async function awardForConfig(
  tx: TenantTransaction,
  row: GroupConfigRow,
  compensation: TreasurerCompensationConfig,
  todayIso: DateOnlyString,
  now: Date,
): Promise<"cash_awarded" | "accrued_without_cash" | "existing"> {
  const period = compensation.period as CompensationPeriod;
  const dueOn = compensationNextDueOn(compensation);
  const amount = amountString(compensation.amount);
  if (!dueOn || !amount) {
    throw new Error("invalid_treasurer_compensation_config");
  }

  const currencyCode = compensation.currency ?? compensation.currencyCode ?? row.currencyCode;
  const periodLabel = periodLabelForCompensation(dueOn, period);
  const orgMembers = await tx.select().from(member)
    .where(eq(member.orgId, row.orgId))
    .orderBy(member.createdAt)
    .for("update");
  const activeTreasurers = orgMembers.filter((candidate) =>
    candidate.role === "tesorera" && candidate.status === "activo");
  if (activeTreasurers.length === 0) {
    throw new Error("active_treasurer_not_found");
  }
  if (activeTreasurers.length > 1) throw new Error("active_treasurer_ambiguous");
  const treasurer = activeTreasurers[0]!;

  const disbursementId = randomUUID();
  const [disbursement] = await tx.insert(treasurerCompensationDisbursement).values({
    id: disbursementId,
    orgId: row.orgId,
    memberId: treasurer.id,
    periodLabel,
    amount,
    currencyCode,
    kindAtDisbursement: compensation,
    withdrawalId: null,
    disbursedOn: todayIso,
    createdAt: now,
  }).onConflictDoNothing().returning();

  const nextDueOn = nextCompensationDueOn(dueOn, period);
  let cashAwarded = false;

  if (disbursement) {
    const fiscalYear = fiscalYearForCompensationPeriod({
      periodLabel,
      kindAtDisbursement: compensation,
    }, {
      startMonth: row.fiscalYearStartMonth,
      startDay: row.fiscalYearStartDay,
    });
    const { breakdown } = await computeTreasurerCompensationBreakdownInTransaction(
      tx,
      { orgId: row.orgId, fiscalYear },
      {
        boundary: { startMonth: row.fiscalYearStartMonth, startDay: row.fiscalYearStartDay },
        currencyCode,
      },
    );
    const scheduledUnits = parseMoney4Units(amount);
    const payableUnits = parseMoney4Units(breakdown.payableNow);
    const payoutUnits = scheduledUnits < payableUnits ? scheduledUnits : payableUnits;
    if (payoutUnits > BigInt(0)) {
      cashAwarded = true;
      const payoutAmount = formatMoney4Units(payoutUnits);
      const withdrawalId = randomUUID();
      await tx.insert(withdrawal).values({
        id: withdrawalId,
        orgId: row.orgId,
        memberId: treasurer.id,
        amount: payoutAmount,
        currencyCode,
        datedOn: todayIso,
        recordedAt: now,
        kind: "treasurer_compensation_disbursement",
        shareOutId: null,
        notes: `Compensación de tesorera de ${periodLabel}`,
        reversesId: null,
        reverseReason: null,
        adjustmentCycleId: null,
        clientRequestId: null,
        createdAt: now,
        createdBy: SYSTEM_ACTOR_ID,
        createdByKind: "system",
        yearEndShareOutLineId: null,
      }).returning();
      await tx.update(treasurerCompensationDisbursement)
        .set({ withdrawalId })
        .where(and(
          eq(treasurerCompensationDisbursement.orgId, row.orgId),
          eq(treasurerCompensationDisbursement.id, disbursementId),
        ));

      const message = `Compensación de tesorera de ${periodLabel} acreditada — ${currencyCode} ${payoutAmount}`;
      await tx.insert(alert).values({
        id: randomUUID(),
        orgId: row.orgId,
        alertKind: "treasurer_compensation_disbursed",
        severity: "low",
        audience: "treasurer",
        subjectKind: "treasurer_compensation_disbursement",
        subjectId: disbursementId,
        payload: {
          disbursementId,
          withdrawalId,
          memberId: treasurer.id,
          periodLabel,
          amount: payoutAmount,
          currencyCode,
          message,
        },
        dedupWindowEnd: new Date(now.getTime() + 86_400_000),
        dismissedAt: null,
        dismissedBy: null,
        snoozedUntil: null,
        createdAt: now,
      });
      await tx.insert(auditLogEntry).values({
        orgId: row.orgId,
        actorKind: "system",
        actorId: SYSTEM_ACTOR_ID,
        actionKind: "treasurer_compensation.disbursed",
        subjectKind: "treasurer_compensation_disbursement",
        subjectId: disbursementId,
        payloadSnapshot: {
          disbursementId,
          withdrawalId,
          memberId: treasurer.id,
          periodLabel,
          amount: payoutAmount,
          currencyCode,
          dueOn,
          nextDueOn,
        },
        reason: null,
        at: now,
        createdAt: now,
      });
    } else {
      const message = `Compensación de tesorera de ${periodLabel} reconocida — no se acreditó otro pago porque el derecho ya estaba cubierto`;
      await tx.insert(alert).values({
        id: randomUUID(),
        orgId: row.orgId,
        alertKind: "treasurer_compensation_cash_suppressed",
        severity: "low",
        audience: "treasurer",
        subjectKind: "treasurer_compensation_disbursement",
        subjectId: disbursementId,
        payload: {
          disbursementId,
          memberId: treasurer.id,
          periodLabel,
          scheduledAmount: amount,
          cashPaid: "0.0000",
          currencyCode,
          message,
          breakdown,
        },
        dedupWindowEnd: new Date(now.getTime() + 86_400_000),
        dismissedAt: null,
        dismissedBy: null,
        snoozedUntil: null,
        createdAt: now,
      });
      await tx.insert(auditLogEntry).values({
        orgId: row.orgId,
        actorKind: "system",
        actorId: SYSTEM_ACTOR_ID,
        actionKind: "treasurer_compensation.cash_suppressed",
        subjectKind: "treasurer_compensation_disbursement",
        subjectId: disbursementId,
        payloadSnapshot: {
          disbursementId,
          memberId: treasurer.id,
          periodLabel,
          scheduledAmount: amount,
          cashPaid: "0.0000",
          currencyCode,
          dueOn,
          nextDueOn,
          breakdown,
        },
        reason: "shared_entitlement_already_paid",
        at: now,
        createdAt: now,
      });
    }
  }

  await advanceGroupConfig(tx, row, nextDueOn, now);

  if (!disbursement) {
    return "existing";
  }

  return cashAwarded ? "cash_awarded" : "accrued_without_cash";
}

export function createCompensationService(options: CompensationServiceOptions = {}): CompensationService {
  const now = options.now ?? (() => new Date());
  return {
    context: "compensation",
    async awardDueTreasurerCompensation(todayIso) {
      dateParts(todayIso);
      const orgIds = await listActiveOrganizationIdsForSystemScheduler();
      const result: AwardDueTreasurerCompensationResult = {
        orgsProcessed: 0,
        configsScanned: 0,
        dueConfigs: 0,
        disbursementsAwarded: 0,
        disbursementsAccruedWithoutCash: 0,
        skippedExistingDisbursements: 0,
        configsAdvanced: 0,
        failures: [],
      };

      for (const orgId of orgIds) {
        result.orgsProcessed += 1;
        try {
          const awardResult = await withWritableTenantTransaction(orgId, async (tx) => {
            await options.beforeMoneyLock?.(orgId);
            await lockTenantMoneyWrites(tx, orgId);
            await options.afterMoneyLock?.(orgId);
            const configs = await tx.select().from(groupConfig)
              .where(and(eq(groupConfig.orgId, orgId), isNull(groupConfig.validTo)));
            let configsScanned = 0;
            let dueConfigs = 0;
            let disbursementsAwarded = 0;
            let disbursementsAccruedWithoutCash = 0;
            let skippedExistingDisbursements = 0;
            let configsAdvanced = 0;

            for (const row of configs) {
              configsScanned += 1;
              const compensation = treasurerCompensationConfig(row.config);
              if (!compensation || !shouldAwardFixedPeriodicCompensation(compensation, todayIso)) {
                continue;
              }

              dueConfigs += 1;
              const awarded = await awardForConfig(tx, row, compensation, todayIso, now());
              configsAdvanced += 1;
              if (awarded === "existing") {
                skippedExistingDisbursements += 1;
              } else if (awarded === "accrued_without_cash") {
                disbursementsAccruedWithoutCash += 1;
              } else {
                disbursementsAwarded += 1;
              }
            }

            return {
              configsScanned,
              dueConfigs,
              disbursementsAwarded,
              disbursementsAccruedWithoutCash,
              skippedExistingDisbursements,
              configsAdvanced,
            };
          });
          result.configsScanned += awardResult.configsScanned;
          result.dueConfigs += awardResult.dueConfigs;
          result.disbursementsAwarded += awardResult.disbursementsAwarded;
          result.disbursementsAccruedWithoutCash += awardResult.disbursementsAccruedWithoutCash;
          result.skippedExistingDisbursements += awardResult.skippedExistingDisbursements;
          result.configsAdvanced += awardResult.configsAdvanced;
        } catch (error) {
          result.failures.push({
            orgId,
            message: error instanceof Error ? error.message : "treasurer_compensation_award_failed",
          });
        }
      }

      return result;
    },
  };
}
