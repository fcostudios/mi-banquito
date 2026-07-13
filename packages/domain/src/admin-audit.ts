import { Buffer } from "node:buffer";

import { sql } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import { auditLogEntry } from "@mi-banquito/db/schema";

export type AdminAuditRow = typeof auditLogEntry.$inferSelect;
export type AdminAuditActorKind = AdminAuditRow["actorKind"];

export type AdminAuditCursor = {
  at: string;
  id: string;
};

export type AdminAuditFilters = {
  orgId?: string;
  actorKind?: AdminAuditActorKind;
  actionKind?: string;
  fromAt?: Date;
  toAtExclusive?: Date;
  cursor?: string;
  limit?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AuditFunctionRow = {
  id: string;
  org_id: string | null;
  actor_kind: AdminAuditActorKind;
  actor_id: string;
  action_kind: string;
  subject_kind: string;
  subject_id: string | null;
  payload_snapshot: unknown;
  reason: string | null;
  at: Date | string;
  created_at: Date | string;
};

function encodeCursor(row: AdminAuditRow): string {
  return Buffer.from(JSON.stringify({ at: row.at.toISOString(), id: row.id }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): AdminAuditCursor | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<AdminAuditCursor>;
    if (typeof value.at !== "string" || !Number.isFinite(Date.parse(value.at))) throw new Error("invalid_at");
    if (typeof value.id !== "string" || !UUID_RE.test(value.id)) throw new Error("invalid_id");
    return { at: value.at, id: value.id };
  } catch {
    throw new Error("audit_cursor_invalid");
  }
}

function dateFromDay(value: string, addDay: boolean): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("audit_date_invalid");
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const milliseconds = Date.UTC(year, month - 1, day + (addDay ? 1 : 0));
  const date = new Date(milliseconds);
  const expected = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== expected) {
    throw new Error("audit_date_invalid");
  }
  return date;
}

export function parseAuditDateRange(input: { from?: string; to?: string }): Pick<AdminAuditFilters, "fromAt" | "toAtExclusive"> {
  const fromAt = input.from ? dateFromDay(input.from, false) : undefined;
  const toAtExclusive = input.to ? dateFromDay(input.to, true) : undefined;
  if (fromAt && toAtExclusive && fromAt >= toAtExclusive) throw new Error("audit_date_range_invalid");
  return { fromAt, toAtExclusive };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function csvCell(value: unknown): string {
  let text = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const AUDIT_CSV_HEADERS = [
  "id",
  "org_id",
  "actor_kind",
  "actor_id",
  "action_kind",
  "subject_kind",
  "subject_id",
  "payload_snapshot",
  "reason",
  "at",
] as const;

export function auditRowsToCsv(rows: AdminAuditRow[]): string {
  const lines = rows.map(auditRowToCsv);
  return `${AUDIT_CSV_HEADERS.join(",")}\r\n${lines.length ? `${lines.join("\r\n")}\r\n` : ""}`;
}

function auditRowToCsv(row: AdminAuditRow): string {
  return [
    row.id,
    row.orgId,
    row.actorKind,
    row.actorId,
    row.actionKind,
    row.subjectKind,
    row.subjectId,
    stableJson(row.payloadSnapshot),
    row.reason,
    row.at,
  ].map(csvCell).join(",");
}

export function auditRowsToCsvStream(rows: AsyncIterable<AdminAuditRow>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = rows[Symbol.asyncIterator]();
  let headerPending = true;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (headerPending) {
        headerPending = false;
        controller.enqueue(encoder.encode(`${AUDIT_CSV_HEADERS.join(",")}\r\n`));
        return;
      }
      const next = await iterator.next();
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`${auditRowToCsv(next.value)}\r\n`));
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

function mapRow(row: AuditFunctionRow): AdminAuditRow {
  return {
    id: row.id,
    orgId: row.org_id,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    actionKind: row.action_kind,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    payloadSnapshot: row.payload_snapshot,
    reason: row.reason,
    at: row.at instanceof Date ? row.at : new Date(`${row.at}Z`),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(`${row.created_at}Z`),
  };
}

export function createAdminAuditService(executor: Pick<typeof db, "execute"> = db) {
  async function list(filters: AdminAuditFilters = {}) {
    const requestedLimit = filters.limit ?? 50;
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 500) {
      throw new Error("audit_limit_invalid");
    }
    const cursor = decodeCursor(filters.cursor);
    const actionKind = filters.actionKind?.trim() || null;
    const result = await executor.execute(sql<AuditFunctionRow>`
      SELECT * FROM admin_read_audit_log(
        ${filters.orgId ?? null}::uuid,
        ${filters.actorKind ?? null}::audit_log_entry_actor_kind_enum,
        ${actionKind},
        ${filters.fromAt ?? null}::timestamptz,
        ${filters.toAtExclusive ?? null}::timestamptz,
        ${cursor ? new Date(cursor.at) : null}::timestamptz,
        ${cursor?.id ?? null}::uuid,
        ${requestedLimit + 1}
      )
    `);
    const mapped = (result.rows as unknown as AuditFunctionRow[]).map(mapRow);
    const hasMore = mapped.length > requestedLimit;
    const rows = mapped.slice(0, requestedLimit);
    return {
      rows,
      nextCursor: hasMore && rows.length ? encodeCursor(rows[rows.length - 1]!) : null,
    };
  }

  async function* iterate(filters: Omit<AdminAuditFilters, "cursor" | "limit">): AsyncGenerator<AdminAuditRow> {
    let cursor: string | undefined;
    do {
      const page = await list({ ...filters, cursor, limit: 500 });
      for (const row of page.rows) yield row;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  async function listAll(filters: Omit<AdminAuditFilters, "cursor" | "limit">) {
    const rows: AdminAuditRow[] = [];
    for await (const row of iterate(filters)) rows.push(row);
    return rows;
  }

  return { list, iterate, listAll };
}
