import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import {
  alert,
  alertAction,
  auditLogEntry,
  contributionCycle,
  groupConfig,
  memberComplianceState,
  organization,
  periodClose,
  projectedLiquidity,
} from "@mi-banquito/db/schema";
import { withTenantTransaction } from "@mi-banquito/db/tenant";
import { writeWithAudit } from "./audit";
import {
  buildA4LiquidityLowMarginAlert,
  buildA5ShareOutCommitmentAlert,
  deterministicAlertSubjectId,
} from "./sprint7-alerts";

export type AlertAudience = "treasurer" | "platform_operator";
export type AlertActionKind = "dismiss" | "snooze";

export type EffectiveAlertStateInput = {
  alert: { id: string; severity: string; createdAt: Date | string };
  actions: Array<{ actionKind: string; snoozedUntil: Date | string | null; createdAt: Date | string }>;
  now: Date;
};

export type EffectiveAlertState = {
  visible: boolean;
  dismissed: boolean;
  snoozedUntil: Date | null;
};

export type VisibleAlert = {
  id: string;
  alertKind: string;
  severity: string;
  audience: string;
  title: string;
  body: string;
  createdAt: Date;
  whatsAppText: string;
};

export type CloseOverdueAlertInput = {
  today: Date | string;
  latestClosedAt: Date | string | null;
  thresholdDays?: number | null;
  fallbackStartedAt?: Date | string | null;
};

export type CloseOverdueAlertState = {
  overdue: boolean;
  daysSinceClose: number;
  thresholdDays: number;
};

export type CloseOverdueAlertRunSummary = {
  orgsScanned: number;
  alertsEmitted: number;
  alertsSkippedExisting: number;
  alertsCleared: number;
  failures: Array<{ orgId: string; message: string }>;
};

export type Sprint6AlertRunSummary = {
  pendingReconciliationAlertsEmitted: number;
  loanDueSoonAlertsEmitted: number;
  contributionLateAlertsEmitted: number;
  skippedExisting: number;
  failures: Array<{ orgId: string; message: string }>;
};

export type Sprint7AlertRunSummary = {
  a4OrgsScanned: number;
  a4MonthsScanned: number;
  a4AlertsEmitted: number;
  a4AlertsSkippedExisting: number;
  a4Failures: number;
  a5CommitmentsScanned: number;
  a5AlertsEmitted: number;
  a5AlertsSkippedExisting: number;
  a5Failures: number;
  failures: Array<{ orgId: string; message: string }>;
};

export interface AlertsService {
  readonly context: "alerts";
  listVisibleAlerts(input: { orgId: string; audience: AlertAudience; now?: Date }): Promise<VisibleAlert[]>;
  countVisibleAlerts(input: { orgId: string; audience: AlertAudience; now?: Date }): Promise<number>;
  dismissAlert(input: { orgId: string; alertId: string; actorId: string; audience: AlertAudience; reason?: string }): Promise<void>;
  snoozeAlert(input: { orgId: string; alertId: string; actorId: string; audience: AlertAudience; snoozedUntil: Date; reason?: string }): Promise<void>;
  emitCloseOverdueAlerts(input: { today: Date }): Promise<CloseOverdueAlertRunSummary>;
  emitSprint6DailyAlerts(input: { today: Date }): Promise<Sprint6AlertRunSummary>;
  emitSprint7DailyAlerts(input: { today: Date }): Promise<Sprint7AlertRunSummary>;
}

type AlertPayload = Record<string, unknown> & {
  title?: string;
  body?: string;
  message?: string;
};

type AlertReadTx = {
  select(): any;
};

type Sprint6DueSoonRow = {
  loan_id: string;
  member: string | null;
  outstanding: string | number;
};

type Sprint6LateContributionRow = {
  member_id: string;
  display_name: string;
  closes_on: string;
};

type Sprint7ShareOutCommitmentRow = {
  year: number | string;
  commitment: string | number;
  projected_available: string | number | null;
  source_kind?: "share_out" | "governance_decision" | string;
  status?: string | null;
  version?: number | string | null;
  valid_to?: Date | string | null;
  committed_at?: Date | string | null;
};

const SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000000";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_CLOSE_OVERDUE_THRESHOLD_DAYS = 14;

function dateValue(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function dayStartUtc(value: Date | string): Date {
  const date = dateValue(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function payloadObject(value: unknown): AlertPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AlertPayload : {};
}

function payloadText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function closeOverdueThreshold(config: unknown): number {
  const value = config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>).close_overdue_threshold_days
    : undefined;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CLOSE_OVERDUE_THRESHOLD_DAYS;
}

export function closeOverdueAlertState(input: CloseOverdueAlertInput): CloseOverdueAlertState {
  const thresholdDays = Number.isInteger(input.thresholdDays) && Number(input.thresholdDays) > 0
    ? Number(input.thresholdDays)
    : DEFAULT_CLOSE_OVERDUE_THRESHOLD_DAYS;
  const today = dayStartUtc(input.today);
  const reference = input.latestClosedAt ?? input.fallbackStartedAt;
  if (!reference) {
    return { overdue: false, daysSinceClose: 0, thresholdDays };
  }

  const daysSinceClose = Math.max(0, Math.floor((today.getTime() - dayStartUtc(reference).getTime()) / MS_PER_DAY));
  return {
    overdue: daysSinceClose > thresholdDays,
    daysSinceClose,
    thresholdDays,
  };
}

export function pendingReconciliationAlertPayload(input: { prevMonth: string }) {
  return {
    title: "Conciliación pendiente",
    body: `El mes de ${input.prevMonth} aún no está cerrado. Te recomiendo cerrar antes de la próxima reunión.`,
    prevMonth: input.prevMonth,
  };
}

export function loanDueSoonAlertPayload(input: { member: string; outstanding: string }) {
  return {
    title: "Préstamo próximo a vencer",
    body: `El préstamo de ${input.member} vence en 7 días. Saldo actual: USD ${input.outstanding}.`,
    member: input.member,
    outstanding: input.outstanding,
  };
}

export function contributionLateAlertPayload(input: { month: string; member: string; days: number }) {
  return {
    title: "Aporte atrasado",
    body: `El aporte de ${input.month} de ${input.member} está atrasado por ${input.days} días.`,
    month: input.month,
    member: input.member,
    days: input.days,
  };
}

export function effectiveAlertState(input: EffectiveAlertStateInput): EffectiveAlertState {
  const [latest] = [...input.actions].sort(
    (a, b) => dateValue(b.createdAt).getTime() - dateValue(a.createdAt).getTime(),
  );
  if (!latest) {
    return { visible: true, dismissed: false, snoozedUntil: null };
  }
  if (latest.actionKind === "dismiss") {
    return { visible: false, dismissed: true, snoozedUntil: null };
  }
  const snoozedUntil = latest.snoozedUntil ? dateValue(latest.snoozedUntil) : null;
  if (latest.actionKind === "snooze" && snoozedUntil && snoozedUntil > input.now) {
    return { visible: false, dismissed: false, snoozedUntil };
  }
  return { visible: true, dismissed: false, snoozedUntil: null };
}

export function whatsAppAlertText(input: { title: string; body: string }): string {
  return `Mi Banquito: ${input.title}. ${input.body}`;
}

function alertTitle(row: typeof alert.$inferSelect): string {
  const payload = payloadObject(row.payload);
  return payloadText(payload.title) ?? row.alertKind;
}

function alertBody(row: typeof alert.$inferSelect): string {
  const payload = payloadObject(row.payload);
  return payloadText(payload.body) ?? payloadText(payload.message) ?? "";
}

function visibleAlert(row: typeof alert.$inferSelect): VisibleAlert {
  const title = alertTitle(row);
  const body = alertBody(row);
  return {
    id: row.id,
    alertKind: row.alertKind,
    severity: row.severity,
    audience: row.audience,
    title,
    body,
    createdAt: dateValue(row.createdAt),
    whatsAppText: whatsAppAlertText({ title, body }),
  };
}

function actionsByAlert(rows: Array<typeof alertAction.$inferSelect>): Map<string, Array<typeof alertAction.$inferSelect>> {
  const grouped = new Map<string, Array<typeof alertAction.$inferSelect>>();
  for (const row of rows) {
    grouped.set(row.alertId, [...(grouped.get(row.alertId) ?? []), row]);
  }
  return grouped;
}

async function assertActionableAlert(input: {
  tx: AlertReadTx;
  orgId: string;
  alertId: string;
  audience: AlertAudience;
}): Promise<void> {
  const [row] = await input.tx.select().from(alert)
    .where(and(
      eq(alert.orgId, input.orgId),
      eq(alert.id, input.alertId),
      or(eq(alert.audience, input.audience), eq(alert.audience, "both")),
    ));
  if (!row) {
    throw new Error("alert_not_actionable");
  }
}

function esMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(date)
    .replace(/\s+de\s+/, " ");
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function monthOnly(value: Date | string): string {
  return (value instanceof Date ? value.toISOString() : value).slice(0, 7);
}

function money4(value: unknown): bigint {
  const trimmed = String(value ?? "0").trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative || trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const fractional = Number.parseInt(fraction.padEnd(4, "0").slice(0, 4), 10) || 0;
  const amount = BigInt(Number.parseInt(whole, 10) || 0) * BigInt(10000) + BigInt(fractional);
  return negative ? -amount : amount;
}

function currentSafetyMarginAmount(row: unknown): string {
  const record = row && typeof row === "object" && !Array.isArray(row)
    ? row as Record<string, unknown>
    : {};
  if (record.safetyMarginAmount !== undefined && record.safetyMarginAmount !== null) {
    return String(record.safetyMarginAmount);
  }
  const config = record.config && typeof record.config === "object" && !Array.isArray(record.config)
    ? record.config as Record<string, unknown>
    : {};
  return String(config.safety_margin_amount ?? config.safetyMarginAmount ?? "0.0000");
}

function executeRows<T>(result: { rows?: T[] } | T[]): T[] {
  return Array.isArray(result) ? result : result.rows ?? [];
}

function commitmentStatusRank(row: Sprint7ShareOutCommitmentRow): number {
  if (row.status === "approved") return 3;
  if (row.status === "draft") return 2;
  if (row.status === "locked") return 1;
  return 0;
}

function commitmentSourceRank(row: Sprint7ShareOutCommitmentRow): number {
  return row.source_kind === "share_out" ? 2 : 1;
}

function commitmentVersion(row: Sprint7ShareOutCommitmentRow): number {
  const version = row.version === null || row.version === undefined ? 0 : Number(row.version);
  return Number.isFinite(version) ? version : 0;
}

function commitmentAt(row: Sprint7ShareOutCommitmentRow): number {
  const at = row.committed_at ? dateValue(row.committed_at).getTime() : 0;
  return Number.isFinite(at) ? at : 0;
}

function compareCommitmentRows(a: Sprint7ShareOutCommitmentRow, b: Sprint7ShareOutCommitmentRow): number {
  const aSort = [
    commitmentAt(a),
    commitmentStatusRank(a),
    commitmentVersion(a),
    commitmentSourceRank(a),
  ];
  const bSort = [
    commitmentAt(b),
    commitmentStatusRank(b),
    commitmentVersion(b),
    commitmentSourceRank(b),
  ];

  for (let index = 0; index < aSort.length; index += 1) {
    const difference = aSort[index] - bSort[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

function isActiveShareOutCommitment(row: Sprint7ShareOutCommitmentRow, currentYear: number): boolean {
  const year = Number(row.year);
  if (!Number.isInteger(year) || year < currentYear) return false;
  if (row.source_kind === "share_out") {
    return row.status === "draft" || row.status === "approved";
  }
  if (row.source_kind === "governance_decision") {
    return row.status === "approved" && !row.valid_to;
  }
  return row.status === undefined || row.status === null || row.status === "approved" || row.status === "draft";
}

function latestCommitmentByYear(rows: Sprint7ShareOutCommitmentRow[], currentYear: number): Sprint7ShareOutCommitmentRow[] {
  const latest = new Map<number, Sprint7ShareOutCommitmentRow>();
  for (const row of rows) {
    if (!isActiveShareOutCommitment(row, currentYear)) continue;
    const year = Number(row.year);
    if (!Number.isInteger(year)) continue;
    const current = latest.get(year);
    if (!current) {
      latest.set(year, row);
      continue;
    }

    if (compareCommitmentRows(row, current) > 0) {
      latest.set(year, row);
    }
  }

  return [...latest.values()].sort((a, b) => Number(a.year) - Number(b.year));
}

async function hasActiveDedupedAlert(input: {
  tx: AlertReadTx;
  orgId: string;
  alertKind: string;
  subjectKind: string;
  subjectId: string;
  today: Date;
}): Promise<boolean> {
  const [existing] = await input.tx.select().from(alert)
    .where(and(
      eq(alert.orgId, input.orgId),
      eq(alert.alertKind, input.alertKind),
      eq(alert.subjectKind, input.subjectKind),
      eq(alert.subjectId, input.subjectId),
    ))
    .orderBy(desc(alert.createdAt));

  return Boolean(existing && dateValue(existing.dedupWindowEnd) > input.today);
}

async function alertActionsForRows(input: {
  tx: AlertReadTx;
  orgId: string;
  rows: Array<typeof alert.$inferSelect>;
}): Promise<Map<string, Array<typeof alertAction.$inferSelect>>> {
  if (input.rows.length === 0) {
    return new Map();
  }

  const actions = await input.tx.select().from(alertAction)
    .where(and(
      eq(alertAction.orgId, input.orgId),
      inArray(alertAction.alertId, input.rows.map((row) => row.id)),
    ))
    .orderBy(desc(alertAction.createdAt));

  return actionsByAlert(actions);
}

type Sprint7DedupedAlertMatch = {
  row: typeof alert.$inferSelect;
  state: EffectiveAlertState;
};

async function findDedupedAlertForPayload(input: {
  tx: AlertReadTx;
  orgId: string;
  alertKind: string;
  subjectKind: string;
  subjectId: string;
  payloadKey: string;
  payloadValue: string | number;
  today: Date;
}): Promise<Sprint7DedupedAlertMatch | null> {
  const rows = await input.tx.select().from(alert)
    .where(and(
      eq(alert.orgId, input.orgId),
      eq(alert.alertKind, input.alertKind),
      eq(alert.subjectKind, input.subjectKind),
      eq(alert.subjectId, input.subjectId),
    ))
    .orderBy(desc(alert.createdAt));
  const actions = await alertActionsForRows({ tx: input.tx, orgId: input.orgId, rows });

  for (const row of rows) {
    const payload = payloadObject(row.payload);
    if (
      dateValue(row.dedupWindowEnd) > input.today
      && String(payload[input.payloadKey]) === String(input.payloadValue)
    ) {
      return {
        row,
        state: effectiveAlertState({
        alert: row,
        actions: actions.get(row.id) ?? [],
        now: input.today,
        }),
      };
    }
  }

  return null;
}

async function reopenSprint7Alert(input: {
  tx: AlertReadTx & { insert(table: unknown): any };
  orgId: string;
  alertId: string;
  alertKind: "A4" | "A5";
  payloadSnapshot: Record<string, unknown>;
  today: Date;
}): Promise<void> {
  await input.tx.insert(alertAction).values({
    orgId: input.orgId,
    alertId: input.alertId,
    actionKind: "system_reopen",
    snoozedUntil: null,
    actorId: SYSTEM_ACTOR_ID,
    actorKind: "system",
    reason: "Condición volvió a incumplirse",
    createdAt: input.today,
  });
  await input.tx.insert(auditLogEntry).values({
    orgId: input.orgId,
    actorKind: "system",
    actorId: SYSTEM_ACTOR_ID,
    actionKind: input.alertKind === "A4"
      ? "alert.liquidity_low_margin.reopen"
      : "alert.shareout_commitment.reopen",
    subjectKind: "alert",
    subjectId: input.alertId,
    payloadSnapshot: {
      orgId: input.orgId,
      alertKind: input.alertKind,
      alertId: input.alertId,
      ...input.payloadSnapshot,
    },
    reason: null,
    at: input.today,
    createdAt: input.today,
  });
}

async function latestShareOutCommitmentRows(input: {
  tx: AlertReadTx & { execute(query: unknown): Promise<{ rows?: Sprint7ShareOutCommitmentRow[] } | Sprint7ShareOutCommitmentRow[]> };
  orgId: string;
  currentYear: number;
}): Promise<Sprint7ShareOutCommitmentRow[]> {
  const result = await input.tx.execute(sql`
    WITH commitment_candidates AS (
      SELECT
        year,
        COALESCE(total_approved, total_commitment, reparto_total) AS commitment,
        status::text AS status,
        0 AS version,
        NULL::timestamp AS valid_to,
        COALESCE(approved_at, created_at) AS committed_at,
        'share_out' AS source_kind
      FROM year_end_share_out
      WHERE org_id = ${input.orgId}
        AND year >= ${input.currentYear}
        AND status IN ('draft', 'approved')

      UNION ALL

      SELECT
        year,
        reparto_total AS commitment,
        status::text AS status,
        version,
        valid_to,
        COALESCE(decided_at, valid_from, created_at) AS committed_at,
        'governance_decision' AS source_kind
      FROM surplus_governance_decision
      WHERE org_id = ${input.orgId}
        AND year >= ${input.currentYear}
        AND status = 'approved'
        AND valid_to IS NULL
    )
    SELECT
      cc.year,
      cc.commitment::numeric(18, 4)::text AS commitment,
      COALESCE(projected.available_capital, capital.available_capital, 0)::numeric(18, 4)::text AS projected_available,
      cc.source_kind,
      cc.status,
      cc.version,
      cc.valid_to,
      cc.committed_at
    FROM commitment_candidates cc
    LEFT JOIN LATERAL (
      SELECT pl.available_capital
      FROM mv_liquidez_proyectada pl
      WHERE pl.org_id = ${input.orgId}
        AND EXTRACT(YEAR FROM pl.month_on)::integer = cc.year
      ORDER BY pl.month_on DESC
      LIMIT 1
    ) projected ON TRUE
    LEFT JOIN mv_available_capital capital
      ON capital.org_id = ${input.orgId}
    ORDER BY cc.year, cc.committed_at DESC, cc.version DESC
  `);
  return latestCommitmentByYear(executeRows(result), input.currentYear);
}

async function clearResolvedSprint7Alerts(input: {
  tx: AlertReadTx & { insert(table: unknown): any };
  orgId: string;
  alertKind: "A4" | "A5";
  subjectKind: string;
  payloadKey: "month" | "year";
  activeKeys: Set<string>;
  today: Date;
}): Promise<void> {
  const existingAlerts = await input.tx.select().from(alert)
    .where(and(
      eq(alert.orgId, input.orgId),
      eq(alert.alertKind, input.alertKind),
      eq(alert.subjectKind, input.subjectKind),
    ))
    .orderBy(desc(alert.createdAt));
  const actions = await alertActionsForRows({ tx: input.tx, orgId: input.orgId, rows: existingAlerts });

  for (const row of existingAlerts) {
    const payload = payloadObject(row.payload);
    const key = payload[input.payloadKey] === undefined || payload[input.payloadKey] === null
      ? ""
      : String(payload[input.payloadKey]);
    const naturalSubjectId = key
      ? deterministicAlertSubjectId({
        orgId: input.orgId,
        alertKind: input.alertKind,
        naturalKey: key,
      })
      : null;
    const resolved = !input.activeKeys.has(key);
    const expired = dateValue(row.dedupWindowEnd) <= input.today;
    const superseded = Boolean(naturalSubjectId && row.subjectId !== naturalSubjectId);
    if (!resolved && !expired && !superseded) {
      continue;
    }
    const state = effectiveAlertState({
      alert: row,
      actions: actions.get(row.id) ?? [],
      now: input.today,
    });
    if (state.dismissed) {
      continue;
    }

    await input.tx.insert(alertAction).values({
      orgId: input.orgId,
      alertId: row.id,
      actionKind: "dismiss",
      snoozedUntil: null,
      actorId: SYSTEM_ACTOR_ID,
      actorKind: "system",
      reason: "Condición resuelta o ventana de deduplicación vencida",
      createdAt: input.today,
    });
    await input.tx.insert(auditLogEntry).values({
      orgId: input.orgId,
      actorKind: "system",
      actorId: SYSTEM_ACTOR_ID,
      actionKind: input.alertKind === "A4"
        ? "alert.liquidity_low_margin.clear"
        : "alert.shareout_commitment.clear",
      subjectKind: "alert",
      subjectId: row.id,
      payloadSnapshot: {
        orgId: input.orgId,
        alertKind: input.alertKind,
        alertId: row.id,
        [input.payloadKey]: key || null,
        dedupWindowEnd: dateValue(row.dedupWindowEnd).toISOString(),
        resolved,
        expired,
        superseded,
      },
      reason: null,
      at: input.today,
      createdAt: input.today,
    });
  }
}

export const createAlertsService = (): AlertsService => ({
  context: "alerts",
  async listVisibleAlerts(input) {
    const now = input.now ?? new Date();
    return withTenantTransaction(input.orgId, async (tx) => {
      const rows = await tx.select().from(alert)
        .where(and(
          eq(alert.orgId, input.orgId),
          or(eq(alert.audience, input.audience), eq(alert.audience, "both")),
        ))
        .orderBy(desc(alert.createdAt));
      if (rows.length === 0) {
        return [];
      }

      const actions = await tx.select().from(alertAction)
        .where(and(
          eq(alertAction.orgId, input.orgId),
          inArray(alertAction.alertId, rows.map((row) => row.id)),
        ))
        .orderBy(desc(alertAction.createdAt));
      const grouped = actionsByAlert(actions);

      return rows
        .filter((row) => effectiveAlertState({
          alert: row,
          actions: grouped.get(row.id) ?? [],
          now,
        }).visible)
        .map(visibleAlert);
    });
  },
  async countVisibleAlerts(input) {
    return (await this.listVisibleAlerts(input)).length;
  },
  async dismissAlert(input) {
    const now = new Date();
    await withTenantTransaction(input.orgId, async (tx) => writeWithAudit({
      write: async () => {
        await assertActionableAlert({ tx, orgId: input.orgId, alertId: input.alertId, audience: input.audience });
        await tx.insert(alertAction).values({
          orgId: input.orgId,
          alertId: input.alertId,
          actionKind: "dismiss",
          snoozedUntil: null,
          actorId: input.actorId,
          actorKind: "member",
          reason: input.reason ?? null,
          createdAt: now,
        });
      },
      audit: async () => {
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "alert.dismiss",
          subjectKind: "alert",
          subjectId: input.alertId,
          payloadSnapshot: { alertId: input.alertId },
          reason: input.reason ?? null,
          at: now,
          createdAt: now,
        });
      },
    }));
  },
  async snoozeAlert(input) {
    const now = new Date();
    await withTenantTransaction(input.orgId, async (tx) => writeWithAudit({
      write: async () => {
        await assertActionableAlert({ tx, orgId: input.orgId, alertId: input.alertId, audience: input.audience });
        await tx.insert(alertAction).values({
          orgId: input.orgId,
          alertId: input.alertId,
          actionKind: "snooze",
          snoozedUntil: input.snoozedUntil,
          actorId: input.actorId,
          actorKind: "member",
          reason: input.reason ?? null,
          createdAt: now,
        });
      },
      audit: async () => {
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "alert.snooze",
          subjectKind: "alert",
          subjectId: input.alertId,
          payloadSnapshot: { alertId: input.alertId, snoozedUntil: input.snoozedUntil.toISOString() },
          reason: input.reason ?? null,
          at: now,
          createdAt: now,
        });
      },
    }));
  },
  async emitSprint6DailyAlerts(input) {
    const today = dayStartUtc(input.today);
    const dedupWindowEnd = new Date(today.getTime() + MS_PER_DAY);
    const dueSoonOn = new Date(today.getTime() + 7 * MS_PER_DAY).toISOString().slice(0, 10);
    const todayOn = today.toISOString().slice(0, 10);
    const month = esMonthYear(today);
    const summary: Sprint6AlertRunSummary = {
      pendingReconciliationAlertsEmitted: 0,
      loanDueSoonAlertsEmitted: 0,
      contributionLateAlertsEmitted: 0,
      skippedExisting: 0,
      failures: [],
    };

    const orgs = await db.select({ id: organization.id }).from(organization)
      .where(eq(organization.status, "active"));

    for (const org of orgs) {
      try {
        await withTenantTransaction(org.id, async (tx) => {
          if (today.getUTCDate() === 5) {
            const prevMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
            const prevMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
            const [closedPriorCycle] = await tx.select({ id: periodClose.id })
              .from(periodClose)
              .innerJoin(contributionCycle, and(
                eq(contributionCycle.id, periodClose.cycleId),
                eq(contributionCycle.orgId, periodClose.orgId),
              ))
              .where(and(
                eq(periodClose.orgId, org.id),
                sql`${contributionCycle.closesOn} >= ${dateOnly(prevMonthStart)}`,
                sql`${contributionCycle.closesOn} <= ${dateOnly(prevMonthEnd)}`,
              ))
              .limit(1);
            const subjectId = org.id;
            if (closedPriorCycle) {
              summary.skippedExisting += 1;
            } else {
            const existing = await hasActiveDedupedAlert({
              tx,
              orgId: org.id,
              alertKind: "A1",
              subjectKind: "contribution_cycle",
              subjectId,
              today,
            });

            if (existing) {
              summary.skippedExisting += 1;
            } else {
              const prevMonth = esMonthYear(prevMonthStart);
              await tx.insert(alert).values({
                orgId: org.id,
                alertKind: "A1",
                severity: "high",
                audience: "treasurer",
                subjectKind: "contribution_cycle",
                subjectId,
                payload: pendingReconciliationAlertPayload({ prevMonth }),
                dedupWindowEnd,
                dismissedAt: null,
                dismissedBy: null,
                snoozedUntil: null,
                createdAt: today,
              });
              summary.pendingReconciliationAlertsEmitted += 1;
            }
            }
          }

          const dueSoonResult = await (tx as { execute(query: unknown): Promise<{ rows?: Sprint6DueSoonRow[] } | Sprint6DueSoonRow[]> }).execute(sql`
            SELECT
              l.id AS loan_id,
              COALESCE(m.display_name, 'persona externa') AS member,
              GREATEST(
                COALESCE(ls.principal_due, 0) - COALESCE(ls.paid_principal_to_date, 0)
                + COALESCE(ls.interest_due, 0) - COALESCE(ls.paid_interest_to_date, 0),
                0
              )::numeric(18, 2)::text AS outstanding
            FROM loan_schedule ls
            JOIN loan l
              ON l.id = ls.loan_id
             AND l.org_id = ls.org_id
            LEFT JOIN member m
              ON m.id = COALESCE(l.member_id, l.borrower_member_id)
             AND m.org_id = l.org_id
            WHERE ls.org_id = ${org.id}
              AND ls.status = 'pendiente'
              AND ls.due_on >= ${todayOn}
              AND ls.due_on <= ${dueSoonOn}
          `);
          const dueSoonRows = Array.isArray(dueSoonResult) ? dueSoonResult : dueSoonResult.rows ?? [];

          for (const row of dueSoonRows) {
            const subjectId = row.loan_id;
            const existing = await hasActiveDedupedAlert({
              tx,
              orgId: org.id,
              alertKind: "A2",
              subjectKind: "loan",
              subjectId,
              today,
            });
            if (existing) {
              summary.skippedExisting += 1;
              continue;
            }

            await tx.insert(alert).values({
              orgId: org.id,
              alertKind: "A2",
              severity: "medium",
              audience: "treasurer",
              subjectKind: "loan",
              subjectId,
              payload: loanDueSoonAlertPayload({
                member: row.member ?? "persona externa",
                outstanding: Number(row.outstanding).toFixed(2),
              }),
              dedupWindowEnd,
              dismissedAt: null,
              dismissedBy: null,
              snoozedUntil: null,
              createdAt: today,
            });
            summary.loanDueSoonAlertsEmitted += 1;
          }

          const lateResult = await (tx as { execute(query: unknown): Promise<{ rows?: Sprint6LateContributionRow[] } | Sprint6LateContributionRow[]> }).execute(sql`
            WITH current_cycle AS (
              SELECT DISTINCT ON (cc.org_id)
                cc.org_id,
                cc.closes_on
              FROM contribution_cycle cc
              WHERE cc.org_id = ${org.id}
                AND cc.status = 'open'
              ORDER BY cc.org_id, cc.closes_on DESC, cc.created_at DESC
            )
            SELECT
              mcs.member_id,
              mcs.display_name,
              current_cycle.closes_on::text AS closes_on
            FROM mv_member_compliance_state mcs
            JOIN current_cycle
              ON current_cycle.org_id = mcs.org_id
            WHERE mcs.org_id = ${org.id}
              AND mcs.state = 'atrasado'
          `);
          const lateRows = Array.isArray(lateResult) ? lateResult : lateResult.rows ?? [];

          for (const row of lateRows) {
            const subjectId = row.member_id;
            const closesOn = new Date(`${row.closes_on}T00:00:00.000Z`);
            const daysLate = Math.max(0, Math.floor((today.getTime() - closesOn.getTime()) / MS_PER_DAY));
            const existing = await hasActiveDedupedAlert({
              tx,
              orgId: org.id,
              alertKind: "A3",
              subjectKind: "member",
              subjectId,
              today,
            });
            if (existing) {
              summary.skippedExisting += 1;
              continue;
            }

            await tx.insert(alert).values({
              orgId: org.id,
              alertKind: "A3",
              severity: "medium",
              audience: "treasurer",
              subjectKind: "member",
              subjectId,
              payload: contributionLateAlertPayload({ month, member: row.display_name, days: daysLate }),
              dedupWindowEnd,
              dismissedAt: null,
              dismissedBy: null,
              snoozedUntil: null,
              createdAt: today,
            });
            summary.contributionLateAlertsEmitted += 1;
          }
        });
      } catch (error) {
        summary.failures.push({
          orgId: org.id,
          message: error instanceof Error ? error.message : "Unknown Sprint 6 alert failure",
        });
      }
    }

    return summary;
  },
  async emitSprint7DailyAlerts(input) {
    const today = dayStartUtc(input.today);
    const horizonStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const summary: Sprint7AlertRunSummary = {
      a4OrgsScanned: 0,
      a4MonthsScanned: 0,
      a4AlertsEmitted: 0,
      a4AlertsSkippedExisting: 0,
      a4Failures: 0,
      a5CommitmentsScanned: 0,
      a5AlertsEmitted: 0,
      a5AlertsSkippedExisting: 0,
      a5Failures: 0,
      failures: [],
    };

    const orgs = await db.select({ id: organization.id }).from(organization)
      .where(eq(organization.status, "active"));

    for (const org of orgs) {
      summary.a4OrgsScanned += 1;
      try {
        await withTenantTransaction(org.id, async (tx) => {
          const activeA4Months = new Set<string>();
          const [config] = await tx.select({
            safetyMarginAmount: groupConfig.safetyMarginAmount,
            config: groupConfig.config,
          })
            .from(groupConfig)
            .where(and(eq(groupConfig.orgId, org.id), isNull(groupConfig.validTo)))
            .orderBy(desc(groupConfig.version))
            .limit(1);
          const safetyMarginAmount = currentSafetyMarginAmount(config);
          const projections = await tx.select({
            monthOn: projectedLiquidity.monthOn,
            projectedBalance: projectedLiquidity.projectedBalance,
          })
            .from(projectedLiquidity)
            .where(and(
              eq(projectedLiquidity.orgId, org.id),
              sql`${projectedLiquidity.monthOn} >= ${dateOnly(horizonStart)}`,
            ))
            .orderBy(asc(projectedLiquidity.monthOn))
            .limit(12);

          for (const row of projections) {
            summary.a4MonthsScanned += 1;
            const projectedBalance = String(row.projectedBalance);
            if (money4(projectedBalance) >= money4(safetyMarginAmount)) {
              continue;
            }

            const month = monthOnly(row.monthOn);
            activeA4Months.add(month);
            const subjectId = deterministicAlertSubjectId({
              orgId: org.id,
              alertKind: "A4",
              naturalKey: month,
            });
            const existing = await findDedupedAlertForPayload({
              tx,
              orgId: org.id,
              alertKind: "A4",
              subjectKind: "liquidity_projection",
              subjectId,
              payloadKey: "month",
              payloadValue: month,
              today,
            });
            if (existing?.state.dismissed) {
              await reopenSprint7Alert({
                tx,
                orgId: org.id,
                alertId: existing.row.id,
                alertKind: "A4",
                payloadSnapshot: {
                  month,
                  projectedBalance,
                  safetyMarginAmount,
                },
                today,
              });
              summary.a4AlertsEmitted += 1;
              continue;
            }
            if (existing) {
              summary.a4AlertsSkippedExisting += 1;
              continue;
            }

            const alertRow = buildA4LiquidityLowMarginAlert({
              orgId: org.id,
              month,
              projectedBalance,
              safetyMarginAmount,
              now: today,
            });
            await tx.insert(alert).values(alertRow);
            await tx.insert(auditLogEntry).values({
              orgId: org.id,
              actorKind: "system",
              actorId: SYSTEM_ACTOR_ID,
              actionKind: "alert.liquidity_low_margin.emit",
              subjectKind: "alert",
              subjectId: alertRow.id,
              payloadSnapshot: {
                orgId: org.id,
                month,
                projectedBalance,
                safetyMarginAmount,
              },
              reason: null,
              at: today,
              createdAt: today,
            });
            summary.a4AlertsEmitted += 1;
          }

          await clearResolvedSprint7Alerts({
            tx,
            orgId: org.id,
            alertKind: "A4",
            subjectKind: "liquidity_projection",
            payloadKey: "month",
            activeKeys: activeA4Months,
            today,
          });
        });
      } catch (error) {
        summary.a4Failures += 1;
        summary.failures.push({
          orgId: org.id,
          message: error instanceof Error ? error.message : "Unknown A4 liquidity alert failure",
        });
      }

      try {
        await withTenantTransaction(org.id, async (tx) => {
          const activeA5Years = new Set<string>();
          const commitmentRows = await latestShareOutCommitmentRows({
            tx,
            orgId: org.id,
            currentYear: today.getUTCFullYear(),
          });
          for (const row of commitmentRows) {
            summary.a5CommitmentsScanned += 1;
            const year = Number(row.year);
            const commitment = String(row.commitment);
            const projectedAvailable = String(row.projected_available ?? "0.0000");
            if (!Number.isInteger(year) || money4(commitment) <= money4(projectedAvailable)) {
              continue;
            }

            activeA5Years.add(String(year));
            const subjectId = deterministicAlertSubjectId({
              orgId: org.id,
              alertKind: "A5",
              naturalKey: year,
            });
            const existing = await findDedupedAlertForPayload({
              tx,
              orgId: org.id,
              alertKind: "A5",
              subjectKind: "year_end_share_out",
              subjectId,
              payloadKey: "year",
              payloadValue: year,
              today,
            });
            if (existing?.state.dismissed) {
              await reopenSprint7Alert({
                tx,
                orgId: org.id,
                alertId: existing.row.id,
                alertKind: "A5",
                payloadSnapshot: {
                  year,
                  commitment,
                  projectedAvailable,
                },
                today,
              });
              summary.a5AlertsEmitted += 1;
              continue;
            }
            if (existing) {
              summary.a5AlertsSkippedExisting += 1;
              continue;
            }

            const alertRow = buildA5ShareOutCommitmentAlert({
              orgId: org.id,
              year,
              commitment,
              projectedAvailable,
              now: today,
            });
            await tx.insert(alert).values(alertRow);
            await tx.insert(auditLogEntry).values({
              orgId: org.id,
              actorKind: "system",
              actorId: SYSTEM_ACTOR_ID,
              actionKind: "alert.shareout_commitment.emit",
              subjectKind: "alert",
              subjectId: alertRow.id,
              payloadSnapshot: {
                orgId: org.id,
                year,
                commitment,
                projectedAvailable,
              },
              reason: null,
              at: today,
              createdAt: today,
            });
            summary.a5AlertsEmitted += 1;
          }

          await clearResolvedSprint7Alerts({
            tx,
            orgId: org.id,
            alertKind: "A5",
            subjectKind: "year_end_share_out",
            payloadKey: "year",
            activeKeys: activeA5Years,
            today,
          });
        });
      } catch (error) {
        summary.a5Failures += 1;
        summary.failures.push({
          orgId: org.id,
          message: error instanceof Error ? error.message : "Unknown A5 share-out alert failure",
        });
      }
    }

    return summary;
  },
  async emitCloseOverdueAlerts(input) {
    const summary: CloseOverdueAlertRunSummary = {
      orgsScanned: 0,
      alertsEmitted: 0,
      alertsSkippedExisting: 0,
      alertsCleared: 0,
      failures: [],
    };
    const today = dayStartUtc(input.today);
    const dedupWindowEnd = new Date(today.getTime() + MS_PER_DAY);
    const orgs = await db.select({
      id: organization.id,
      displayName: organization.displayName,
      createdAt: organization.createdAt,
    }).from(organization)
      .where(eq(organization.status, "active"));

    for (const org of orgs) {
      summary.orgsScanned += 1;
      try {
        await withTenantTransaction(org.id, async (tx) => {
          const [config] = await tx.select({ config: groupConfig.config })
            .from(groupConfig)
            .where(and(eq(groupConfig.orgId, org.id), isNull(groupConfig.validTo)))
            .orderBy(desc(groupConfig.version))
            .limit(1);
          const [latestClose] = await tx.select({ closedAt: periodClose.closedAt })
            .from(periodClose)
            .where(eq(periodClose.orgId, org.id))
            .orderBy(desc(periodClose.closedAt))
            .limit(1);
          const existingAlerts = await tx.select().from(alert)
            .where(and(
              eq(alert.orgId, org.id),
              eq(alert.alertKind, "A8"),
              eq(alert.subjectKind, "organization"),
              eq(alert.subjectId, org.id),
            ))
            .orderBy(desc(alert.createdAt));
          const [existing] = existingAlerts;

          const state = closeOverdueAlertState({
            today,
            latestClosedAt: latestClose?.closedAt ?? null,
            fallbackStartedAt: org.createdAt,
            thresholdDays: closeOverdueThreshold(config?.config),
          });

          if (!state.overdue) {
            for (const staleAlert of existingAlerts) {
              await tx.insert(alertAction).values({
                orgId: org.id,
                alertId: staleAlert.id,
                actionKind: "dismiss",
                snoozedUntil: null,
                actorId: SYSTEM_ACTOR_ID,
                actorKind: "system",
                reason: "Período cerrado o dentro del umbral",
                createdAt: today,
              });
              await tx.insert(auditLogEntry).values({
                orgId: org.id,
                actorKind: "system",
                actorId: SYSTEM_ACTOR_ID,
                actionKind: "alert.close_overdue.clear",
                subjectKind: "alert",
                subjectId: staleAlert.id,
                payloadSnapshot: {
                  orgId: org.id,
                  daysSinceClose: state.daysSinceClose,
                  thresholdDays: state.thresholdDays,
                },
                reason: "Período cerrado o dentro del umbral",
                at: today,
                createdAt: today,
              });
              summary.alertsCleared += 1;
            }
            return;
          }

          if (existing && dateValue(existing.dedupWindowEnd) > today) {
            summary.alertsSkippedExisting += 1;
            return;
          }

          const [row] = await tx.insert(alert).values({
            orgId: org.id,
            alertKind: "A8",
            severity: "medium",
            audience: "both",
            subjectKind: "organization",
            subjectId: org.id,
            payload: {
              title: "Cierre pendiente",
              body: `No has cerrado el mes en los últimos ${state.daysSinceClose} días.`,
              orgId: org.id,
              orgName: org.displayName,
              daysSinceClose: state.daysSinceClose,
              thresholdDays: state.thresholdDays,
            },
            dedupWindowEnd,
            dismissedAt: null,
            dismissedBy: null,
            snoozedUntil: null,
            createdAt: today,
          }).returning();

          await tx.insert(auditLogEntry).values({
            orgId: org.id,
            actorKind: "system",
            actorId: SYSTEM_ACTOR_ID,
            actionKind: "alert.close_overdue.emit",
            subjectKind: "alert",
            subjectId: row.id,
            payloadSnapshot: {
              orgId: org.id,
              daysSinceClose: state.daysSinceClose,
              thresholdDays: state.thresholdDays,
            },
            reason: null,
            at: today,
            createdAt: today,
          });
          summary.alertsEmitted += 1;
        });
      } catch (error) {
        summary.failures.push({
          orgId: org.id,
          message: error instanceof Error ? error.message : "Unknown close overdue alert failure",
        });
      }
    }

    return summary;
  },
});
