import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import { alert, alertAction, auditLogEntry, groupConfig, organization, periodClose } from "@mi-banquito/db/schema";
import { withTenantTransaction } from "@mi-banquito/db/tenant";
import { writeWithAudit } from "./audit";

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

export interface AlertsService {
  readonly context: "alerts";
  listVisibleAlerts(input: { orgId: string; audience: AlertAudience; now?: Date }): Promise<VisibleAlert[]>;
  countVisibleAlerts(input: { orgId: string; audience: AlertAudience; now?: Date }): Promise<number>;
  dismissAlert(input: { orgId: string; alertId: string; actorId: string; audience: AlertAudience; reason?: string }): Promise<void>;
  snoozeAlert(input: { orgId: string; alertId: string; actorId: string; audience: AlertAudience; snoozedUntil: Date; reason?: string }): Promise<void>;
  emitCloseOverdueAlerts(input: { today: Date }): Promise<CloseOverdueAlertRunSummary>;
}

type AlertPayload = {
  title?: string;
  body?: string;
  message?: string;
};

type AlertReadTx = {
  select(): {
    from(table: typeof alert): {
      where(condition: unknown): Promise<Array<typeof alert.$inferSelect>>;
    };
  };
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
