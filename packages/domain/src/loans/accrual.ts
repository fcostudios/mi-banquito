export type AccrualLoanInput = {
  id: string;
  orgId: string;
  principalAmount: string;
  currencyCode: string;
  rateValue: string;
  originatedOn: string;
  status: string;
};

export type AccrualScheduleInput = {
  id: string;
  dueOn: string;
  principalDue: string;
  interestDue: string;
  paidPrincipalToDate: string;
  paidInterestToDate: string;
  status: string;
};

export type AccrualPrincipalRepaymentInput = {
  datedOn: string;
  appliedToPrincipal: string;
};

export type AccrualGroupConfigInput = {
  version: number;
  validFrom: string | Date;
  validTo: string | Date | null;
  moraThresholdDays: number;
  config: unknown;
};

export type PlannedInterestAccrual = {
  orgId: string;
  loanId: string;
  accruedOn: string;
  principalBasis: string;
  periodDays: number;
  rateValue: string;
  interestAmount: string;
  currencyCode: string;
};

export type PlannedMoraFee = {
  orgId: string;
  loanId: string;
  loanScheduleId: string;
  feeKind: "mora";
  amount: string;
  currencyCode: string;
  datedOn: string;
  accruedOn: string;
  groupConfigVersion: number;
  feedsSurplus: true;
};

export type LoanAccrualPlan = {
  interestAccruals: PlannedInterestAccrual[];
  moraFees: PlannedMoraFee[];
  transitionsToMora: Array<{ loanId: string; scheduleId: string; accruedOn: string }>;
};

type MoraConfig = {
  mechanic: "flat_per_day";
  perDayAmount: string;
  cap: "overdue_installment" | "none";
  scope: "loans" | "none";
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVE_LOAN_STATUSES = new Set(["originated", "activo", "en_mora"]);
const PAID_SCHEDULE_STATUSES = new Set(["pagado"]);

const toDateOnly = (value: string | Date): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
};

const parseDateOnly = (value: string, label: string): Date => {
  if (!ISO_DATE.test(value)) {
    throw new Error(`${label} must be an ISO yyyy-mm-dd date`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid ISO yyyy-mm-dd date`);
  }
  return parsed;
};

const addUtcDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const diffDays = (from: string, to: string): number => {
  const start = parseDateOnly(from, "from_date").getTime();
  const end = parseDateOnly(to, "to_date").getTime();
  return Math.floor((end - start) / 86_400_000);
};

const money4 = (value: string | number): string => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error("Money values must be finite numbers");
  }
  return numeric.toFixed(4);
};

const decimalValue = (config: Record<string, unknown>, key: string, fallback: string): string => {
  const value = config[key];
  if (typeof value === "number" || typeof value === "string") {
    return money4(value);
  }
  return fallback;
};

const stringValue = <T extends string>(
  config: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T => {
  const value = config[key];
  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T;
  }
  return fallback;
};

export function resolveDateRange(fromDate: string, toDate: string): string[] {
  const from = parseDateOnly(fromDate, "from_date");
  const to = parseDateOnly(toDate, "to_date");
  if (from.getTime() > to.getTime()) {
    throw new Error("from_date must be on or before to_date");
  }

  const dates: string[] = [];
  for (let current = from; current.getTime() <= to.getTime(); current = addUtcDays(current, 1)) {
    dates.push(current.toISOString().slice(0, 10));
  }
  return dates;
}

export function calculateDailyInterestAmount(input: {
  principalBasis: string;
  rateValue: string;
  periodDays?: number;
}): string {
  const periodDays = input.periodDays ?? 30;
  if (!Number.isInteger(periodDays) || periodDays <= 0) {
    throw new Error("periodDays must be a positive integer");
  }
  return money4(Number(input.principalBasis) * (Number(input.rateValue) / 100) / periodDays);
}

function resolveMoraConfig(config: unknown): MoraConfig {
  const root = config && typeof config === "object" ? config as Record<string, unknown> : {};
  const mora = root.mora && typeof root.mora === "object" ? root.mora as Record<string, unknown> : {};
  return {
    mechanic: stringValue(mora, "mechanic", ["flat_per_day"] as const, "flat_per_day"),
    perDayAmount: decimalValue(mora, "per_day_amount", "0.2500"),
    cap: stringValue(mora, "cap", ["overdue_installment", "none"] as const, "overdue_installment"),
    scope: stringValue(mora, "scope", ["loans", "none"] as const, "loans"),
  };
}

function configForDate(configs: AccrualGroupConfigInput[], accrualDate: string): AccrualGroupConfigInput | undefined {
  const at = parseDateOnly(accrualDate, "accrued_on").getTime();
  return [...configs]
    .sort((a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime())
    .find((config) => {
      const validFrom = new Date(config.validFrom).getTime();
      const validTo = config.validTo ? new Date(config.validTo).getTime() : Number.POSITIVE_INFINITY;
      return validFrom <= at && at < validTo;
    });
}

function unpaidInstallmentAmount(schedule: AccrualScheduleInput): number {
  return Math.max(
    0,
    Number(schedule.principalDue) +
      Number(schedule.interestDue) -
      Number(schedule.paidPrincipalToDate) -
      Number(schedule.paidInterestToDate),
  );
}

export function calculatePrincipalBasisOn(input: {
  principalAmount: string;
  accrualDate: string;
  principalRepayments?: AccrualPrincipalRepaymentInput[];
}): string {
  const paidPrincipal = (input.principalRepayments ?? [])
    .filter((repayment) => repayment.datedOn <= input.accrualDate)
    .reduce((total, repayment) => total + Number(repayment.appliedToPrincipal), 0);
  return money4(Math.max(0, Number(input.principalAmount) - paidPrincipal));
}

function moraKey(loanId: string, accruedOn: string): string {
  return `${loanId}:mora:${accruedOn}`;
}

function hasExistingMoraFee(keys: ReadonlySet<string>, loanId: string, accruedOn: string): boolean {
  return keys.has(moraKey(loanId, accruedOn)) || keys.has(`${loanId}:${accruedOn}`) || keys.has(accruedOn);
}

export function planLoanAccruals(input: {
  loan: AccrualLoanInput;
  schedules: AccrualScheduleInput[];
  configs: AccrualGroupConfigInput[];
  accrualDates: string[];
  existingAccrualDates: ReadonlySet<string>;
  existingMoraFeeKeys: ReadonlySet<string>;
  principalRepayments?: AccrualPrincipalRepaymentInput[];
}): LoanAccrualPlan {
  if (!ACTIVE_LOAN_STATUSES.has(input.loan.status)) {
    return { interestAccruals: [], moraFees: [], transitionsToMora: [] };
  }

  const interestAccruals: PlannedInterestAccrual[] = [];
  const moraFees: PlannedMoraFee[] = [];
  const transitionsToMora: Array<{ loanId: string; scheduleId: string; accruedOn: string }> = [];
  const overdueSchedules = input.schedules
    .filter((schedule) => !PAID_SCHEDULE_STATUSES.has(schedule.status) && unpaidInstallmentAmount(schedule) > 0)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));

  for (const accruedOn of input.accrualDates) {
    if (accruedOn >= input.loan.originatedOn && !input.existingAccrualDates.has(accruedOn)) {
      const principalBasis = calculatePrincipalBasisOn({
        principalAmount: input.loan.principalAmount,
        accrualDate: accruedOn,
        principalRepayments: input.principalRepayments,
      });
      interestAccruals.push({
        orgId: input.loan.orgId,
        loanId: input.loan.id,
        accruedOn,
        principalBasis,
        periodDays: 30,
        rateValue: money4(input.loan.rateValue),
        interestAmount: calculateDailyInterestAmount({
          principalBasis,
          rateValue: input.loan.rateValue,
          periodDays: 30,
        }),
        currencyCode: input.loan.currencyCode,
      });
    }

    const config = configForDate(input.configs, accruedOn);
    if (!config || hasExistingMoraFee(input.existingMoraFeeKeys, input.loan.id, accruedOn)) {
      continue;
    }
    const mora = resolveMoraConfig(config.config);
    if (mora.scope !== "loans") {
      continue;
    }
    const overdueSchedule = overdueSchedules.find(
      (schedule) => diffDays(schedule.dueOn, accruedOn) > config.moraThresholdDays,
    );
    if (!overdueSchedule) {
      continue;
    }

    const rawAmount = Number(mora.perDayAmount);
    const capAmount = mora.cap === "overdue_installment"
      ? unpaidInstallmentAmount(overdueSchedule)
      : Number.POSITIVE_INFINITY;
    const amount = Math.max(0, Math.min(rawAmount, capAmount));
    if (amount <= 0) {
      continue;
    }

    moraFees.push({
      orgId: input.loan.orgId,
      loanId: input.loan.id,
      loanScheduleId: overdueSchedule.id,
      feeKind: "mora",
      amount: money4(amount),
      currencyCode: input.loan.currencyCode,
      datedOn: accruedOn,
      accruedOn,
      groupConfigVersion: config.version,
      feedsSurplus: true,
    });
    if (input.loan.status !== "en_mora") {
      transitionsToMora.push({ loanId: input.loan.id, scheduleId: overdueSchedule.id, accruedOn });
    }
  }

  return { interestAccruals, moraFees, transitionsToMora };
}
