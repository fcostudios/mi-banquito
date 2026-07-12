import { parseAuditDateRange, type AdminAuditActorKind, type AdminAuditFilters } from "@mi-banquito/domain";

const ACTOR_KINDS = new Set<AdminAuditActorKind>(["member", "platform_operator", "system"]);

type SearchValue = string | string[] | undefined;

export type AdminAuditSearchParams = Record<string, SearchValue>;

function scalar(value: SearchValue): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function auditFiltersFromSearchParams(searchParams: AdminAuditSearchParams): AdminAuditFilters {
  const orgId = scalar(searchParams.org_id);
  if (orgId && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(orgId)) throw new Error("audit_org_invalid");
  const actorValue = scalar(searchParams.actor_kind);
  if (actorValue && !ACTOR_KINDS.has(actorValue as AdminAuditActorKind)) throw new Error("audit_actor_invalid");
  const from = scalar(searchParams.from);
  const to = scalar(searchParams.to);

  return {
    orgId,
    actorKind: actorValue as AdminAuditActorKind | undefined,
    actionKind: scalar(searchParams.action_kind),
    cursor: scalar(searchParams.cursor),
    ...parseAuditDateRange({ from, to }),
  };
}

export function auditQueryString(searchParams: AdminAuditSearchParams, omit: string[] = []): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (omit.includes(key) || typeof value !== "string" || !value.trim()) continue;
    query.set(key, value);
  }
  return query.toString();
}
