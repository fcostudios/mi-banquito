import { createHash, randomUUID } from "node:crypto";

export type Sprint7AlertSeverity = "low" | "medium" | "high" | "critical";
export type Sprint7AlertAudience = "treasurer" | "platform_operator" | "both";

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
  dedupWindowEnd: Date;
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
  borrowerKind: "member" | "non_member";
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

export function deterministicAlertSubjectId(input: {
  orgId: string;
  alertKind: "A4" | "A5";
  naturalKey: string | number;
}): string {
  const bytes = createHash("sha256")
    .update(`${input.orgId}:${input.alertKind}:${input.naturalKey}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function baseAlert(input: {
  orgId: string;
  alertKind: Sprint7AlertInsert["alertKind"];
  severity: Sprint7AlertSeverity;
  audience: Sprint7AlertAudience;
  subjectKind: string;
  subjectId: string | null;
  payload: Sprint7AlertPayload;
  dedupWindowEnd: Date;
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
  const fractionalTenThousandths = Number.parseInt(fraction.padEnd(4, "0").slice(0, 4), 10);
  const amount = Number.parseInt(whole, 10) * 100 + Math.round(fractionalTenThousandths / 100);
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
  const copy = `La liquidez proyectada de ${monthLabel(input.month)} queda ${money(shortfall)} por debajo del margen de seguridad.`;
  return baseAlert({
    orgId: input.orgId,
    alertKind: "A4",
    severity: "high",
    audience: "treasurer",
    subjectKind: "liquidity_projection",
    subjectId: deterministicAlertSubjectId({ orgId: input.orgId, alertKind: "A4", naturalKey: input.month }),
    payload: {
      title: "Liquidez bajo margen",
      body: copy,
      copy,
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
  const copy = `El compromiso de reparto ${input.year} es ${money(cents(input.commitment))}; la proyección disponible es ${money(cents(input.projectedAvailable))}; faltan ${money(shortfall)}.`;
  return baseAlert({
    orgId: input.orgId,
    alertKind: "A5",
    severity: "high",
    audience: "treasurer",
    subjectKind: "year_end_share_out",
    subjectId: deterministicAlertSubjectId({ orgId: input.orgId, alertKind: "A5", naturalKey: input.year }),
    payload: {
      title: "Compromiso de reparto excede proyección",
      body: copy,
      copy,
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
      title: "Préstamo en mora",
      body: copy,
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
  const copy = `${input.actorLabel} cambió la configuración del grupo: ${changedLabels.join(", ")}.`;
  return baseAlert({
    orgId: input.orgId,
    alertKind: "A9",
    severity: "low",
    audience: "treasurer",
    subjectKind: "group_config",
    subjectId: input.configId,
    payload: {
      title: "Cambio de configuración del grupo",
      body: copy,
      copy,
      configId: input.configId,
      changedKeys: input.changedKeys,
      actorLabel: input.actorLabel,
    },
    dedupWindowEnd: input.now,
    now: input.now,
  });
}

export function buildA11ContributionMissingPhotoAlert(input: BuildA11ContributionMissingPhotoAlertInput): Sprint7AlertInsert {
  const copy = `${input.memberName} registró ${input.consecutiveCount} aportes consecutivos sin foto de comprobante.`;
  return baseAlert({
    orgId: input.orgId,
    alertKind: "A11",
    severity: "low",
    audience: "treasurer",
    subjectKind: "member",
    subjectId: input.memberId,
    payload: {
      title: "Aporte sin foto de comprobante",
      body: copy,
      copy,
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
  const copy = `${input.memberName} tiene saldo negativo de ${money(cents(input.balance))}.`;
  return baseAlert({
    orgId: input.orgId,
    alertKind: "A14",
    severity: "critical",
    audience: "both",
    subjectKind: "member",
    subjectId: input.memberId,
    payload: {
      title: "Saldo de miembro negativo",
      body: copy,
      copy,
      memberId: input.memberId,
      memberName: input.memberName,
      balance: input.balance,
      sourceEventId: input.sourceEventId,
    },
    dedupWindowEnd: input.now,
    now: input.now,
  });
}
