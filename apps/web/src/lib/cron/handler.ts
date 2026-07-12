import { NextResponse } from "next/server";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import {
  buildA6LoanPastDueAlert,
  createAlertsService,
  createCollectionsService,
  createCompensationService,
  type DateOnlyString,
} from "@mi-banquito/domain";
import {
  alert,
  auditLogEntry,
  cronRun,
  groupConfig,
  interestAccrual,
  loan,
  loanFee,
  repayment,
  loanSchedule,
  organization,
} from "@mi-banquito/db/schema";
import {
  planLoanAccruals,
  resolveDateRange,
  type AccrualGroupConfigInput,
  type AccrualLoanInput,
  type AccrualScheduleInput,
} from "../../../../../packages/domain/src/loans/accrual";

export type CronJobName =
  | "accrue-interest"
  | "award-treasurer-compensation"
  | "daily"
  | "promise-reminders";

export type CronRunSummary = {
  job: CronJobName;
  endpoint: string;
  fromDate: string;
  toDate: string;
  orgsProcessed: number;
  loansProcessed: number;
  interestAccrualsPlanned: number;
  moraFeesPlanned: number;
  transitionsToMora: number;
  promisesScanned?: number;
  remindersEmitted?: number;
  compensationConfigsScanned?: number;
  compensationDueConfigs?: number;
  compensationDisbursementsAwarded?: number;
  compensationSkippedExistingDisbursements?: number;
  compensationConfigsAdvanced?: number;
  closeOverdueOrgsScanned?: number;
  closeOverdueAlertsEmitted?: number;
  closeOverdueAlertsSkippedExisting?: number;
  closeOverdueAlertsCleared?: number;
  sprint6PendingReconciliationAlertsEmitted?: number;
  sprint6LoanDueSoonAlertsEmitted?: number;
  sprint6ContributionLateAlertsEmitted?: number;
  sprint7A4OrgsScanned?: number;
  sprint7A4MonthsScanned?: number;
  sprint7A4AlertsEmitted?: number;
  sprint7A4AlertsSkippedExisting?: number;
  sprint7A4Failures?: number;
  sprint7A5CommitmentsScanned?: number;
  sprint7A5AlertsEmitted?: number;
  sprint7A5AlertsSkippedExisting?: number;
  sprint7A5Failures?: number;
  failures: Array<{ orgId: string; loanId?: string; message: string }>;
};

const SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000000";
const ACTIVE_LOAN_STATUSES = new Set(["originated", "activo", "en_mora"]);
const MORA_TRANSITIONABLE_LOAN_STATUSES = ["originated", "activo"] as const;
const MORA_TRANSITIONABLE_SCHEDULE_STATUSES = ["pendiente", "parcial", "atrasado"] as const;

type A6LoanPastDueContextRow = {
  borrower_kind: "member" | "non_member" | string | null;
  borrower_name: string | null;
  guarantor_name: string | null;
  days_late: number | string | null;
};

type A6MoraTransitionEligibilityRow = {
  loan_id: string;
  schedule_id: string;
  schedule_status: string | null;
};

function isoToday(): DateOnlyString {
  return new Date().toISOString().slice(0, 10) as DateOnlyString;
}

function parseDateOnlyParam(value: string): DateOnlyString {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("date must be YYYY-MM-DD");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) {
    throw new Error("date must be a valid calendar date");
  }

  return value as DateOnlyString;
}

function parseReplayRange(request: Request): { fromDate: string; toDate: string; dates: string[] } {
  const url = new URL(request.url);
  const toDate = url.searchParams.get("to_date") ?? isoToday();
  const fromDate = url.searchParams.get("from_date") ?? toDate;
  return { fromDate, toDate, dates: resolveDateRange(fromDate, toDate) };
}

function dateColumnToString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function normalizeConfig(row: typeof groupConfig.$inferSelect): AccrualGroupConfigInput {
  return {
    version: row.version,
    validFrom: row.validFrom,
    validTo: row.validTo,
    moraThresholdDays: row.moraThresholdDays,
    config: row.config,
  };
}

function normalizeLoan(row: typeof loan.$inferSelect): AccrualLoanInput {
  return {
    id: row.id,
    orgId: row.orgId,
    principalAmount: String(row.principalAmount),
    currencyCode: row.currencyCode,
    rateValue: String(row.rateValue),
    originatedOn: dateColumnToString(row.originatedOn),
    status: row.status,
  };
}

function normalizeSchedule(row: typeof loanSchedule.$inferSelect): AccrualScheduleInput {
  return {
    id: row.id,
    dueOn: dateColumnToString(row.dueOn),
    principalDue: String(row.principalDue),
    interestDue: String(row.interestDue),
    paidPrincipalToDate: String(row.paidPrincipalToDate),
    paidInterestToDate: String(row.paidInterestToDate),
    status: row.status,
  };
}

function executeRows<T>(result: { rows?: T[] } | T[]): T[] {
  return Array.isArray(result) ? result : result.rows ?? [];
}

function priorMoraScheduleStatus(value: string | null): (typeof MORA_TRANSITIONABLE_SCHEDULE_STATUSES)[number] {
  return MORA_TRANSITIONABLE_SCHEDULE_STATUSES.includes(value as (typeof MORA_TRANSITIONABLE_SCHEDULE_STATUSES)[number])
    ? value as (typeof MORA_TRANSITIONABLE_SCHEDULE_STATUSES)[number]
    : "atrasado";
}

const DERIVED_MATERIALIZED_VIEWS = [
  "mv_available_capital",
  "mv_ar_aging",
  "mv_org_health_snapshot",
  "mv_liquidez_proyectada",
] as const;

export async function refreshDerivedViews() {
  const result = await db.execute(sql`
    SELECT materialized_view.relname AS view_name
    FROM pg_class materialized_view
    JOIN pg_namespace namespace ON namespace.oid = materialized_view.relnamespace
    WHERE namespace.nspname = current_schema()
      AND materialized_view.relkind = 'm'
      AND materialized_view.relname IN (
        'mv_available_capital',
        'mv_ar_aging',
        'mv_org_health_snapshot',
        'mv_liquidez_proyectada'
      )
      AND EXISTS (
        SELECT 1
        FROM pg_index unique_index
        WHERE unique_index.indrelid = materialized_view.oid
          AND unique_index.indisunique
          AND unique_index.indisvalid
          AND unique_index.indisready
          AND unique_index.indpred IS NULL
          AND unique_index.indexprs IS NULL
      )
  `);
  const eligibleViews = new Set(
    executeRows<Record<string, unknown>>(result)
      .map((row) => row.view_name)
      .filter((viewName): viewName is string => typeof viewName === "string"),
  );

  for (const viewName of DERIVED_MATERIALIZED_VIEWS) {
    if (!eligibleViews.has(viewName)) continue;
    await db.execute(sql.raw(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`));
  }
}

async function recordCronRun(input: {
  endpoint: string;
  startedAt: Date;
  finishedAt: Date;
  replayFrom: string;
  replayTo: string;
  summary: CronRunSummary;
}) {
  await db.insert(cronRun).values({
    endpoint: input.endpoint,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
    orgsProcessed: input.summary.orgsProcessed,
    failureCount: input.summary.failures.length,
    replayFrom: input.replayFrom,
    replayTo: input.replayTo,
    summary: input.summary,
    triggeredByKind: "system",
    triggeredBy: null,
    createdAt: input.finishedAt,
  });
}

export async function runAccrueInterestCron(request: Request): Promise<CronRunSummary> {
  const startedAt = new Date();
  const { fromDate, toDate, dates } = parseReplayRange(request);
  const endpoint = "/api/cron/accrue-interest";
  const summary: CronRunSummary = {
    job: "accrue-interest",
    endpoint,
    fromDate,
    toDate,
    orgsProcessed: 0,
    loansProcessed: 0,
    interestAccrualsPlanned: 0,
    moraFeesPlanned: 0,
    transitionsToMora: 0,
    failures: [],
  };

  const orgs = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.status, "active"));

  for (const org of orgs) {
    summary.orgsProcessed += 1;
    try {
      const configs = (await db
        .select()
        .from(groupConfig)
        .where(eq(groupConfig.orgId, org.id))).map(normalizeConfig);
      const activeLoans = (await db
        .select()
        .from(loan)
        .where(eq(loan.orgId, org.id)))
        .filter((row) => ACTIVE_LOAN_STATUSES.has(row.status));

      for (const loanRow of activeLoans) {
        try {
          const schedules = (await db
            .select()
            .from(loanSchedule)
            .where(and(eq(loanSchedule.orgId, org.id), eq(loanSchedule.loanId, loanRow.id))))
            .map(normalizeSchedule);
          const existingAccruals = await db
            .select({ accruedOn: interestAccrual.accruedOn })
            .from(interestAccrual)
            .where(and(
              eq(interestAccrual.orgId, org.id),
              eq(interestAccrual.loanId, loanRow.id),
              gte(interestAccrual.accruedOn, fromDate),
              lte(interestAccrual.accruedOn, toDate),
            ));
          const existingMoraFees = await db
            .select({ loanId: loanFee.loanId, accruedOn: loanFee.accruedOn })
            .from(loanFee)
            .where(and(
              eq(loanFee.orgId, org.id),
              eq(loanFee.loanId, loanRow.id),
              eq(loanFee.feeKind, "mora"),
              gte(loanFee.accruedOn, fromDate),
              lte(loanFee.accruedOn, toDate),
            ));
          const principalRepayments = await db
            .select({
              datedOn: repayment.datedOn,
              appliedToPrincipal: repayment.appliedToPrincipal,
            })
            .from(repayment)
            .where(and(
              eq(repayment.orgId, org.id),
              eq(repayment.loanId, loanRow.id),
              lte(repayment.datedOn, toDate),
            ));
          const plan = planLoanAccruals({
            loan: normalizeLoan(loanRow),
            schedules,
            configs,
            accrualDates: dates,
            existingAccrualDates: new Set(existingAccruals.map((row) => dateColumnToString(row.accruedOn))),
            existingMoraFeeKeys: new Set(existingMoraFees.map((row) => `${row.loanId}:mora:${dateColumnToString(row.accruedOn)}`)),
            principalRepayments: principalRepayments.map((row) => ({
              datedOn: dateColumnToString(row.datedOn),
              appliedToPrincipal: String(row.appliedToPrincipal),
            })),
          });

          await db.transaction(async (tx) => {
            for (const row of plan.interestAccruals) {
              await tx.insert(interestAccrual).values({
                orgId: row.orgId,
                loanId: row.loanId,
                accruedOn: row.accruedOn,
                principalBasis: row.principalBasis,
                periodDays: row.periodDays,
                rateValue: row.rateValue,
                interestAmount: row.interestAmount,
                currencyCode: row.currencyCode,
                recordedAt: startedAt,
                createdAt: startedAt,
                createdByKind: "system",
              }).onConflictDoNothing({
                target: [interestAccrual.loanId, interestAccrual.accruedOn],
              });
            }

            for (const row of plan.moraFees) {
              await tx.insert(loanFee).values({
                orgId: row.orgId,
                loanId: row.loanId,
                loanScheduleId: row.loanScheduleId,
                feeKind: row.feeKind,
                amount: row.amount,
                currencyCode: row.currencyCode,
                datedOn: row.datedOn,
                accruedOn: row.accruedOn,
                groupConfigVersion: row.groupConfigVersion,
                feedsSurplus: row.feedsSurplus,
                accountId: null,
                reconciliationStatus: null,
                reversesId: null,
                reverseReason: null,
                createdAt: startedAt,
                createdBy: SYSTEM_ACTOR_ID,
                createdByKind: "system",
              }).onConflictDoNothing({
                target: [loanFee.loanId, loanFee.feeKind, loanFee.accruedOn],
              });
            }

            for (const transition of plan.transitionsToMora) {
              const eligibilityResult = await (tx as {
                execute(query: unknown): Promise<{ rows?: A6MoraTransitionEligibilityRow[] } | A6MoraTransitionEligibilityRow[]>;
              }).execute(sql`
                SELECT
                  l.id AS loan_id,
                  ls.id AS schedule_id,
                  ls.status::text AS schedule_status
                FROM loan l
                JOIN loan_schedule ls
                  ON ls.org_id = l.org_id
                 AND ls.loan_id = l.id
                 AND ls.id = ${transition.scheduleId}
                WHERE l.org_id = ${org.id}
                  AND l.id = ${transition.loanId}
                  AND l.status IN ('originated', 'activo')
                  AND ls.due_on <= ${transition.accruedOn}
                  AND ls.status IN ('pendiente', 'parcial', 'atrasado')
                  AND (ls.principal_due + ls.interest_due - ls.paid_principal_to_date - ls.paid_interest_to_date) > 0
                LIMIT 1
                FOR UPDATE OF l, ls
              `);
              const [eligibleTransition] = executeRows(eligibilityResult);
              if (!eligibleTransition) {
                continue;
              }

              const transitionedSchedules = await tx.update(loanSchedule)
                .set({ status: "en_mora" })
                .where(and(
                  eq(loanSchedule.orgId, org.id),
                  eq(loanSchedule.id, transition.scheduleId),
                  eq(loanSchedule.loanId, transition.loanId),
                  lte(loanSchedule.dueOn, transition.accruedOn),
                  inArray(loanSchedule.status, [...MORA_TRANSITIONABLE_SCHEDULE_STATUSES]),
                  sql`(${loanSchedule.principalDue} + ${loanSchedule.interestDue} - ${loanSchedule.paidPrincipalToDate} - ${loanSchedule.paidInterestToDate}) > 0`,
                ))
                .returning();
              if (transitionedSchedules.length === 0) {
                continue;
              }

              const transitioned = await tx.update(loan)
                .set({ status: "en_mora", updatedAt: startedAt, updatedBy: SYSTEM_ACTOR_ID })
                .where(and(
                  eq(loan.orgId, org.id),
                  eq(loan.id, transition.loanId),
                  inArray(loan.status, [...MORA_TRANSITIONABLE_LOAN_STATUSES]),
                ))
                .returning();
              if (transitioned.length === 0) {
                await tx.update(loanSchedule)
                  .set({ status: priorMoraScheduleStatus(eligibleTransition.schedule_status) })
                  .where(and(
                    eq(loanSchedule.orgId, org.id),
                    eq(loanSchedule.id, transition.scheduleId),
                    eq(loanSchedule.loanId, transition.loanId),
                    eq(loanSchedule.status, "en_mora"),
                  ));
                continue;
              }
              const contextResult = await (tx as {
                execute(query: unknown): Promise<{ rows?: A6LoanPastDueContextRow[] } | A6LoanPastDueContextRow[]>;
              }).execute(sql`
                SELECT
                  l.borrower_kind::text AS borrower_kind,
                  COALESCE(member_borrower.display_name, non_member_borrower.display_name, 'persona externa') AS borrower_name,
                  guarantor.display_name AS guarantor_name,
                  GREATEST(0, (${transition.accruedOn}::date - ls.due_on::date))::integer AS days_late
                FROM loan l
                JOIN loan_schedule ls
                  ON ls.loan_id = l.id
                 AND ls.org_id = l.org_id
                 AND ls.id = ${transition.scheduleId}
                LEFT JOIN member member_borrower
                  ON member_borrower.org_id = l.org_id
                 AND member_borrower.id = COALESCE(l.borrower_member_id, l.member_id)
                LEFT JOIN non_member_borrower
                  ON non_member_borrower.org_id = l.org_id
                 AND non_member_borrower.id = l.borrower_non_member_id
                LEFT JOIN loan_guarantor lg
                  ON lg.org_id = l.org_id
                 AND lg.loan_id = l.id
                 AND lg.released_at IS NULL
                LEFT JOIN member guarantor
                  ON guarantor.org_id = l.org_id
                 AND guarantor.id = lg.guarantor_member_id
                WHERE l.org_id = ${org.id}
                  AND l.id = ${transition.loanId}
                ORDER BY lg.assumed_at DESC NULLS LAST
                LIMIT 1
              `);
              const [context] = executeRows(contextResult);
              const alertRow = buildA6LoanPastDueAlert({
                orgId: org.id,
                loanId: transition.loanId,
                borrowerName: context?.borrower_name ?? "persona externa",
                borrowerKind: context?.borrower_kind === "non_member" ? "non_member" : "member",
                guarantorName: context?.guarantor_name ?? undefined,
                daysLate: Math.max(0, Number(context?.days_late ?? 0)),
                now: startedAt,
              });
              await tx.insert(alert).values(alertRow);
              await tx.insert(auditLogEntry).values({
                orgId: org.id,
                actorKind: "system",
                actorId: SYSTEM_ACTOR_ID,
                actionKind: "alert.loan_past_due.emit",
                subjectKind: "alert",
                subjectId: alertRow.id,
                payloadSnapshot: {
                  alertKind: "A6",
                  loanId: transition.loanId,
                  scheduleId: transition.scheduleId,
                  accruedOn: transition.accruedOn,
                  borrowerName: alertRow.payload.borrowerName,
                  borrowerKind: alertRow.payload.borrowerKind,
                  guarantorName: alertRow.payload.guarantorName,
                  daysLate: alertRow.payload.daysLate,
                },
                createdAt: startedAt,
                at: startedAt,
                reason: null,
              });
            }
          });

          summary.loansProcessed += 1;
          summary.interestAccrualsPlanned += plan.interestAccruals.length;
          summary.moraFeesPlanned += plan.moraFees.length;
          summary.transitionsToMora += plan.transitionsToMora.length;
        } catch (error) {
          summary.failures.push({
            orgId: org.id,
            loanId: loanRow.id,
            message: error instanceof Error ? error.message : "Unknown loan accrual failure",
          });
        }
      }
    } catch (error) {
      summary.failures.push({
        orgId: org.id,
        message: error instanceof Error ? error.message : "Unknown org accrual failure",
      });
    }
  }

  try {
    await refreshDerivedViews();
  } catch (error) {
    summary.failures.push({
      orgId: "system",
      message: error instanceof Error ? error.message : "Derived views refresh failed",
    });
  }

  await recordCronRun({
    endpoint,
    startedAt,
    finishedAt: new Date(),
    replayFrom: fromDate,
    replayTo: toDate,
    summary,
  });

  return summary;
}

async function runPromiseReminderCron(request: Request): Promise<CronRunSummary> {
  const startedAt = new Date();
  const endpoint = "/api/cron/promise-reminders";
  const url = new URL(request.url);
  const requestedDate = url.searchParams.get("date");
  const fallbackDate = isoToday();
  let today = fallbackDate;
  const summary: CronRunSummary = {
    job: "promise-reminders",
    endpoint,
    fromDate: fallbackDate,
    toDate: fallbackDate,
    orgsProcessed: 0,
    loansProcessed: 0,
    interestAccrualsPlanned: 0,
    moraFeesPlanned: 0,
    transitionsToMora: 0,
    promisesScanned: 0,
    remindersEmitted: 0,
    failures: [],
  };

  try {
    today = requestedDate ? parseDateOnlyParam(requestedDate) : fallbackDate;
    summary.fromDate = today;
    summary.toDate = today;
    const result = await createCollectionsService().emitPromiseReminders(today);
    summary.promisesScanned = result.promisesScanned;
    summary.remindersEmitted = result.remindersEmitted;
  } catch (error) {
    summary.failures.push({
      orgId: "system",
      message: error instanceof Error ? error.message : "Promise reminder cron failed",
    });
  }

  await recordCronRun({
    endpoint,
    startedAt,
    finishedAt: new Date(),
    replayFrom: summary.fromDate,
    replayTo: summary.toDate,
    summary,
  });

  return summary;
}

async function runTreasurerCompensationCron(
  request: Request,
  options: { job?: CronJobName; endpoint?: string } = {},
): Promise<CronRunSummary> {
  const startedAt = new Date();
  const endpoint = options.endpoint ?? "/api/cron/award-treasurer-compensation";
  const url = new URL(request.url);
  const requestedDate = url.searchParams.get("date");
  const fallbackDate = isoToday();
  let today = fallbackDate;
  const summary: CronRunSummary = {
    job: options.job ?? "award-treasurer-compensation",
    endpoint,
    fromDate: fallbackDate,
    toDate: fallbackDate,
    orgsProcessed: 0,
    loansProcessed: 0,
    interestAccrualsPlanned: 0,
    moraFeesPlanned: 0,
    transitionsToMora: 0,
    compensationConfigsScanned: 0,
    compensationDueConfigs: 0,
    compensationDisbursementsAwarded: 0,
    compensationSkippedExistingDisbursements: 0,
    compensationConfigsAdvanced: 0,
    closeOverdueOrgsScanned: 0,
    closeOverdueAlertsEmitted: 0,
    closeOverdueAlertsSkippedExisting: 0,
    closeOverdueAlertsCleared: 0,
    sprint6PendingReconciliationAlertsEmitted: 0,
    sprint6LoanDueSoonAlertsEmitted: 0,
    sprint6ContributionLateAlertsEmitted: 0,
    sprint7A4OrgsScanned: 0,
    sprint7A4MonthsScanned: 0,
    sprint7A4AlertsEmitted: 0,
    sprint7A4AlertsSkippedExisting: 0,
    sprint7A4Failures: 0,
    sprint7A5CommitmentsScanned: 0,
    sprint7A5AlertsEmitted: 0,
    sprint7A5AlertsSkippedExisting: 0,
    sprint7A5Failures: 0,
    failures: [],
  };

  try {
    today = requestedDate ? parseDateOnlyParam(requestedDate) : fallbackDate;
    summary.fromDate = today;
    summary.toDate = today;
    const result = await createCompensationService().awardDueTreasurerCompensation(today);
    summary.orgsProcessed = result.orgsProcessed;
    summary.compensationConfigsScanned = result.configsScanned;
    summary.compensationDueConfigs = result.dueConfigs;
    summary.compensationDisbursementsAwarded = result.disbursementsAwarded;
    summary.compensationSkippedExistingDisbursements = result.skippedExistingDisbursements;
    summary.compensationConfigsAdvanced = result.configsAdvanced;
    summary.failures.push(...result.failures);
    if (summary.job === "daily") {
      const closeOverdue = await createAlertsService().emitCloseOverdueAlerts({
        today: new Date(`${today}T00:00:00.000Z`),
      });
      summary.orgsProcessed = Math.max(summary.orgsProcessed, closeOverdue.orgsScanned);
      summary.closeOverdueOrgsScanned = closeOverdue.orgsScanned;
      summary.closeOverdueAlertsEmitted = closeOverdue.alertsEmitted;
      summary.closeOverdueAlertsSkippedExisting = closeOverdue.alertsSkippedExisting;
      summary.closeOverdueAlertsCleared = closeOverdue.alertsCleared;
      summary.failures.push(...closeOverdue.failures);

      const sprint6Alerts = await createAlertsService().emitSprint6DailyAlerts({
        today: new Date(`${today}T00:00:00.000Z`),
      });
      summary.sprint6PendingReconciliationAlertsEmitted = sprint6Alerts.pendingReconciliationAlertsEmitted;
      summary.sprint6LoanDueSoonAlertsEmitted = sprint6Alerts.loanDueSoonAlertsEmitted;
      summary.sprint6ContributionLateAlertsEmitted = sprint6Alerts.contributionLateAlertsEmitted;
      summary.failures.push(...sprint6Alerts.failures);

      await refreshDerivedViews();
      const sprint7Alerts = await createAlertsService().emitSprint7DailyAlerts({
        today: new Date(`${today}T00:00:00.000Z`),
      });
      summary.orgsProcessed = Math.max(summary.orgsProcessed, sprint7Alerts.a4OrgsScanned);
      summary.sprint7A4OrgsScanned = sprint7Alerts.a4OrgsScanned;
      summary.sprint7A4MonthsScanned = sprint7Alerts.a4MonthsScanned;
      summary.sprint7A4AlertsEmitted = sprint7Alerts.a4AlertsEmitted;
      summary.sprint7A4AlertsSkippedExisting = sprint7Alerts.a4AlertsSkippedExisting;
      summary.sprint7A4Failures = sprint7Alerts.a4Failures;
      summary.sprint7A5CommitmentsScanned = sprint7Alerts.a5CommitmentsScanned;
      summary.sprint7A5AlertsEmitted = sprint7Alerts.a5AlertsEmitted;
      summary.sprint7A5AlertsSkippedExisting = sprint7Alerts.a5AlertsSkippedExisting;
      summary.sprint7A5Failures = sprint7Alerts.a5Failures;
      summary.failures.push(...sprint7Alerts.failures);
    }
  } catch (error) {
    summary.failures.push({
      orgId: "system",
      message: error instanceof Error ? error.message : "Treasurer compensation cron failed",
    });
  }

  await recordCronRun({
    endpoint,
    startedAt,
    finishedAt: new Date(),
    replayFrom: summary.fromDate,
    replayTo: summary.toDate,
    summary,
  });

  return summary;
}

export function createCronHandler(job: CronJobName) {
  return async function GET(request: Request) {
    const expected = process.env.CRON_SECRET;
    const auth = request.headers.get("authorization");

    if (!expected || auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (job === "accrue-interest") {
      if (process.env.VITEST_WORKER_ID && process.env.RUN_REAL_CRON_IN_TESTS !== "1") {
        return NextResponse.json({ job, ran: true });
      }
      const summary = await runAccrueInterestCron(request);
      return NextResponse.json({ job, ran: true, summary });
    }

    if (job === "promise-reminders") {
      const summary = await runPromiseReminderCron(request);
      if (summary.failures.length > 0) {
        return NextResponse.json({ job, ran: false, summary }, { status: 500 });
      }
      return NextResponse.json({ job, ran: true, summary });
    }

    if (job === "award-treasurer-compensation") {
      const summary = await runTreasurerCompensationCron(request);
      if (summary.failures.length > 0) {
        return NextResponse.json({ job, ran: false, summary }, { status: 500 });
      }
      return NextResponse.json({ job, ran: true, summary });
    }

    if (job === "daily") {
      const summary = await runTreasurerCompensationCron(request, {
        job: "daily",
        endpoint: "/api/cron/daily",
      });
      if (summary.failures.length > 0) {
        return NextResponse.json({ job, ran: false, summary }, { status: 500 });
      }
      return NextResponse.json({ job, ran: true, summary });
    }

    return NextResponse.json({ job, ran: true });
  };
}
