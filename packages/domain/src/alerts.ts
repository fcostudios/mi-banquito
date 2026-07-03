import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import { alert, alertAction, auditLogEntry } from "@mi-banquito/db/schema";
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

export interface AlertsService {
  readonly context: "alerts";
  listVisibleAlerts(input: { orgId: string; audience: AlertAudience; now?: Date }): Promise<VisibleAlert[]>;
  countVisibleAlerts(input: { orgId: string; audience: AlertAudience; now?: Date }): Promise<number>;
  dismissAlert(input: { orgId: string; alertId: string; actorId: string; audience: AlertAudience; reason?: string }): Promise<void>;
  snoozeAlert(input: { orgId: string; alertId: string; actorId: string; audience: AlertAudience; snoozedUntil: Date; reason?: string }): Promise<void>;
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

function dateValue(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function payloadObject(value: unknown): AlertPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AlertPayload : {};
}

function payloadText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
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
});
