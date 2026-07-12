import Link from "next/link";
import { createAdminAuditService } from "@mi-banquito/domain";
import { asc } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import { organization } from "@mi-banquito/db/schema";

import { auditFiltersFromSearchParams, auditQueryString, type AdminAuditSearchParams } from "@/lib/admin-audit-query";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";

const copy = messages.adminAudit;

export default async function ScrAdminAuditPage({ searchParams }: { searchParams: Promise<AdminAuditSearchParams> }) {
  await requirePlatformOperator();
  const params = await searchParams;
  let filterError = false;
  let filters;
  try {
    filters = auditFiltersFromSearchParams(params);
  } catch {
    filterError = true;
    filters = {};
  }
  const [page, organizations] = await Promise.all([
    createAdminAuditService().list({ ...filters, limit: 50 }),
    db.select({ id: organization.id, displayName: organization.displayName }).from(organization).orderBy(asc(organization.displayName)),
  ]);
  const orgNames = new Map(organizations.map((row) => [row.id, row.displayName]));
  const exportQuery = auditQueryString(params, ["cursor"]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6" data-screen="SCR-admin-audit">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{copy.subtitle}</p>
      </header>

      <form className="grid grid-cols-1 gap-3 border-y border-border py-4 sm:grid-cols-2 lg:grid-cols-5" data-testid="filters">
        <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
          {copy.organization}
          <select className="min-h-10 border border-border bg-surface px-3" defaultValue={typeof params.org_id === "string" ? params.org_id : ""} name="org_id">
            <option value="">{copy.allOrganizations}</option>
            {organizations.map((org) => <option key={org.id} value={org.id}>{org.displayName}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
          {copy.actor}
          <select className="min-h-10 border border-border bg-surface px-3" defaultValue={typeof params.actor_kind === "string" ? params.actor_kind : ""} name="actor_kind">
            <option value="">{copy.allActors}</option>
            <option value="member">{copy.member}</option>
            <option value="platform_operator">{copy.platformOperator}</option>
            <option value="system">{copy.system}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
          {copy.action}
          <input className="min-h-10 border border-border bg-surface px-3" defaultValue={typeof params.action_kind === "string" ? params.action_kind : ""} name="action_kind" type="search" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
          {copy.from}
          <input className="min-h-10 border border-border bg-surface px-3" defaultValue={typeof params.from === "string" ? params.from : ""} name="from" type="date" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
          {copy.to}
          <input className="min-h-10 border border-border bg-surface px-3" defaultValue={typeof params.to === "string" ? params.to : ""} name="to" type="date" />
        </label>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
          <button className="min-h-10 bg-primary px-4 font-semibold text-text-on-primary" type="submit">{copy.apply}</button>
          <Link className="inline-flex min-h-10 items-center border border-border px-4 font-semibold text-text-primary" href="/admin/audit">{copy.clear}</Link>
          <a className="inline-flex min-h-10 items-center border border-primary px-4 font-semibold text-primary" href={`/admin/audit/export${exportQuery ? `?${exportQuery}` : ""}`}>{copy.exportCsv}</a>
        </div>
      </form>

      {filterError ? <p className="border border-error-text bg-error-bg p-3 text-sm text-text-primary" role="alert">{copy.invalidFilters}</p> : null}

      <section className="overflow-x-auto" data-testid="audit_table">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-semibold">{copy.when}</th>
              <th className="px-3 py-2 font-semibold">{copy.organization}</th>
              <th className="px-3 py-2 font-semibold">{copy.actor}</th>
              <th className="px-3 py-2 font-semibold">{copy.action}</th>
              <th className="px-3 py-2 font-semibold">{copy.subject}</th>
              <th className="px-3 py-2 font-semibold">{copy.detail}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {page.rows.map((row) => (
              <tr className="align-top" key={row.id}>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-text-secondary">{row.at.toISOString()}</td>
                <td className="px-3 py-3 text-text-primary">{row.orgId ? orgNames.get(row.orgId) ?? row.orgId : copy.platformScope}</td>
                <td className="px-3 py-3 text-text-primary"><span className="block font-medium">{row.actorKind}</span><span className="font-mono text-xs text-text-secondary">{row.actorId}</span></td>
                <td className="px-3 py-3 font-medium text-text-primary">{row.actionKind}</td>
                <td className="px-3 py-3 text-text-primary"><span className="block">{row.subjectKind}</span><span className="font-mono text-xs text-text-secondary">{row.subjectId ?? copy.noSubject}</span></td>
                <td className="max-w-md px-3 py-3">
                  <details>
                    <summary className="cursor-pointer font-semibold text-primary">{copy.viewPayload}</summary>
                    <pre className="mt-2 max-h-72 overflow-auto border border-border bg-surface-muted p-3 font-mono text-xs text-text-primary">{JSON.stringify(row.payloadSnapshot, null, 2)}</pre>
                    {row.reason ? <p className="mt-2 whitespace-pre-wrap text-xs text-text-secondary">{row.reason}</p> : null}
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {page.rows.length === 0 ? <p className="py-10 text-center text-sm text-text-secondary">{copy.empty}</p> : null}
      </section>

      {page.nextCursor ? (
        <nav aria-label={copy.pagination} className="flex justify-end">
          <Link className="inline-flex min-h-10 items-center border border-border px-4 font-semibold text-text-primary" href={`/admin/audit?${auditQueryString({ ...params, cursor: page.nextCursor })}`}>{copy.next}</Link>
        </nav>
      ) : null}
    </main>
  );
}
