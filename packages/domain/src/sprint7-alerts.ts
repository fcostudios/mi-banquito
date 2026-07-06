import { randomUUID } from "node:crypto";

export type Sprint7AlertSeverity = "low" | "medium" | "high" | "critical";
export type Sprint7AlertAudience = "treasurer" | "platform" | "both";

export type Sprint7AlertPayload = Record<string, string | number | boolean | null | string[]>;

export type Sprint7AlertInsert = {
  id: string;
  orgId: string;
  alertKind: "A4" | "A5" | "A6" | "A9" | "A11" | "A14";
  severity: Sprint7AlertSeverity;
  audience: Sprint7AlertAudience;
  subjectKind: string;
  subjectId: string | null;
  payload: Sprint7AlertPayload;
  dedupWindowEnd: Date | null;
  dismissedAt: Date | null;
  dismissedBy: string | null;
  snoozedUntil: Date | null;
  createdAt: Date;
};

export type BuildA4LiquidityLowMarginAlertInput = {
  orgId: string;
  month: string;
  projectedBalance: string;
  safetyMarginAmount: string;
  now: Date;
};

export type BuildA5ShareOutCommitmentAlertInput = {
  orgId: string;
  year: number;
  commitment: string;
  projectedAvailable: string;
  now: Date;
};

export type BuildA6LoanPastDueAlertInput = {
  orgId: string;
  loanId: string;
  borrowerName: string;
  borrowerKind: "member" | "external";
  guarantorName?: string;
  daysLate: number;
  now: Date;
};

export type BuildA9GroupConfigChangedAlertInput = {
  orgId: string;
  configId: string;
  changedKeys: string[];
  actorLabel: string;
  now: Date;
};

export type BuildA11ContributionMissingPhotoAlertInput = {
  orgId: string;
  memberId: string;
  memberName: string;
  threshold: number;
  consecutiveCount: number;
  now: Date;
};

export type BuildA14NegativeMemberBalanceAlertInput = {
  orgId: string;
  memberId: string;
  memberName: string;
  balance: string;
  sourceEventId: string;
  now: Date;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CONFIG_LABELS: Record<string, string> = {
  base_quota_amount: "cuota base",
  interest_rate_pct: "tasa de interés",
  mora_threshold_days: "días de mora",
  no_slip_consecutive_threshold: "aportes sin foto consecutivos",
  safety_margin_amount: "margen de seguridad",
};

function dedupWindowEnd(now: Date, days: number): Date {
  return new Date(now.getTime() + days * MS_PER_DAY);
}

function baseAlert(input: {
  orgId: string;
  alertKind: Sprint7AlertInsert["alertKind"];
  severity: Sprint7AlertSeverity;
  audience: Sprint7AlertAudience;
  subjectKind: string;
  subjectId: string | null;
  payload: Sprint7AlertPayload;
  dedupWindowEnd: Date | null;
  now: Date;
}): Sprint7AlertInsert {
  return {
    id: randomUUID(),
    orgId: input.orgId,
    alertKind: input.alertKind,
    severity: input.severity,
    audience: input.audience,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    payload: input.payload,
    dedupWindowEnd: input.dedupWindowEnd,
    dismissedAt: null,
    dismissedBy: null,
    snoozedUntil: null,
    createdAt: input.now,
  };
}

function cents(value: string): number {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative || trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const centsText = fraction.padEnd(2, "0").slice(0, 2);
  const amount = Number.parseInt(whole, 10) * 100 + Number.parseInt(centsText || "0", 10);
  return negative ? -amount : amount;
}

function money(valueInCents: number): string {
  const sign = valueInCents < 0 ? "-" : "";
  const absolute = Math.abs(valueInCents);
  const amount = (absolute / 100).toLocaleString("es-EC", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${amount}`;
}

function monthLabel(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1, 1));
  return new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(date)
    .replace(/\s+de\s+/, " ");
}

function configLabel(key: string): string {
  return CONFIG_LABELS[key] ?? key.replaceAll("_", " ");
}

export function buildA4LiquidityLowMarginAlert(input: BuildA4LiquidityLowMarginAlertInput): Sprint7AlertInsert {
  const shortfall = cents(input.safetyMarginAmount) - cents(input.projectedBalance);
  return baseAlert({
    orgId: input.orgId,
    alertKind: "A4",
    severity: "high",
    audience: "treasurer",
    subjectKind: "liquidity_projection",
    subjectId: null,
    payload: {
      copy: `La liquidez proyectada de ${monthLabel(input.month)} queda ${money(shortfall)} por debajo del margen de seguridad.`,
      month: input.month,
      projectedBalance: input.projectedBalance,
      safetyMarginAmount: input.safetyMarginAmount,
      shortfall: money(shortfall),
    },
    dedupWindowEnd: dedupWindowEnd(input.now, 7),
    now: input.now,
  });
}

export function buildA5ShareOutCommitmentAlert(input: BuildA5ShareOutCommitmentAlertInput): Sprint7AlertInsert {
  const shortfall = cents(input.commitment) - cents(input.projectedAvailable);
  return baseAlert({
    orgId: input.orgId,
    alertKind: "A5",
    severity: "high",
    audience: "treasurer",
    subjectKind: "share_out_commitment",
    subjectId: null,
    payload: {
      copy: `El compromiso de reparto ${input.year} excede la proyección disponible por ${money(shortfall)}.`,
      year: input.year,
      commitment: input.commitment,
      projectedAvailable: input.projectedAvailable,
      shortfall: money(shortfall),
    },
    dedupWindowEnd: dedupWindowEnd(input.now, 7),
    now: input.now,
  });
}

export function buildA6LoanPastDueAlert(input: BuildA6LoanPastDueAlertInput): Sprint7AlertInsert {
  const copy = input.borrowerKind === "member"
    ? `El préstamo de ${input.borrowerName} está en mora desde hace ${input.daysLate} días.`
    : `El préstamo externo de ${input.borrowerName} está en mora desde hace ${input.daysLate} días. Garante: ${input.guarantorName ?? "sin registrar"}.`;

  return baseAlert({
    orgId: input.orgId,
    alertKind: "A6",
    severity: "high",
    audience: "treasurer",
    subjectKind: "loan",
    subjectId: input.loanId,
    payload: {
      copy,
      loanId: input.loanId,
      borrowerName: input.borrowerName,
      borrowerKind: input.borrowerKind,
      guarantorName: input.guarantorName ?? null,
      daysLate: input.daysLate,
    },
    dedupWindowEnd: dedupWindowEnd(input.now, 1),
    now: input.now,
  });
}

export function buildA9GroupConfigChangedAlert(input: BuildA9GroupConfigChangedAlertInput): Sprint7AlertInsert {
  const changedLabels = input.changedKeys.map(configLabel);
  return baseAlert({
    orgId: input.orgId,
    alertKind: "A9",
    severity: "low",
    audience: "treasurer",
    subjectKind: "group_config",
    subjectId: input.configId,
    payload: {
      copy: `${input.actorLabel} cambió la configuración del grupo: ${changedLabels.join(", ")}.`,
      configId: input.configId,
      changedKeys: input.changedKeys,
      actorLabel: input.actorLabel,
    },
    dedupWindowEnd: null,
    now: input.now,
  });
}

export function buildA11ContributionMissingPhotoAlert(input: BuildA11ContributionMissingPhotoAlertInput): Sprint7AlertInsert {
  return baseAlert({
    orgId: input.orgId,
    alertKind: "A11",
    severity: "low",
    audience: "treasurer",
    subjectKind: "member",
    subjectId: input.memberId,
    payload: {
      copy: `${input.memberName} registró ${input.consecutiveCount} aportes consecutivos sin foto de comprobante.`,
      memberId: input.memberId,
      memberName: input.memberName,
      threshold: input.threshold,
      consecutiveCount: input.consecutiveCount,
    },
    dedupWindowEnd: dedupWindowEnd(input.now, 7),
    now: input.now,
  });
}

export function buildA14NegativeMemberBalanceAlert(input: BuildA14NegativeMemberBalanceAlertInput): Sprint7AlertInsert {
  return baseAlert({
    orgId: input.orgId,
    alertKind: "A14",
    severity: "critical",
    audience: "both",
    subjectKind: "member",
    subjectId: input.memberId,
    payload: {
      copy: `${input.memberName} tiene saldo negativo de ${money(cents(input.balance))}.`,
      memberId: input.memberId,
      memberName: input.memberName,
      balance: input.balance,
      sourceEventId: input.sourceEventId,
    },
    dedupWindowEnd: null,
    now: input.now,
  });
}
