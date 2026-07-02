import { NextResponse } from "next/server";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import {
  alert,
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
  | "drift-check";

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
  failures: Array<{ orgId: string; loanId?: string; message: string }>;
};

const SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000000";
const ACTIVE_LOAN_STATUSES = new Set(["originated", "activo", "en_mora"]);

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
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

async function refreshProjectedLiquidity() {
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF to_regclass('mv_liquidez_proyectada') IS NOT NULL THEN
    EXECUTE 'REFRESH MATERIALIZED VIEW mv_liquidez_proyectada';
  END IF;
END $$;
`));
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
              await tx.update(loan)
                .set({ status: "en_mora", updatedAt: startedAt, updatedBy: SYSTEM_ACTOR_ID })
                .where(and(eq(loan.orgId, org.id), eq(loan.id, transition.loanId)));
              await tx.update(loanSchedule)
                .set({ status: "en_mora" })
                .where(and(eq(loanSchedule.orgId, org.id), eq(loanSchedule.id, transition.scheduleId)));
              await tx.insert(alert).values({
                orgId: org.id,
                alertKind: "A6_PRESTAMO_EN_MORA",
                severity: "high",
                audience: "both",
                subjectKind: "loan",
                subjectId: transition.loanId,
                payload: {
                  loanId: transition.loanId,
                  scheduleId: transition.scheduleId,
                  accruedOn: transition.accruedOn,
                },
                dedupWindowEnd: new Date(startedAt.getTime() + 86_400_000),
                dismissedAt: null,
                dismissedBy: null,
                snoozedUntil: null,
                createdAt: startedAt,
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
    await refreshProjectedLiquidity();
  } catch (error) {
    summary.failures.push({
      orgId: "system",
      message: error instanceof Error ? error.message : "Projected liquidity refresh failed",
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

    return NextResponse.json({ job, ran: true });
  };
}
