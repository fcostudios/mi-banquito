import { UploadCloud } from "lucide-react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@mi-banquito/db";
import { organization, platformOperator } from "@mi-banquito/db/schema";

import { requirePlatformOperator } from "@/lib/auth/require-session";
import { loadTenantExportHistory, parseTenantExportPageOrgId } from "@/lib/admin-export-service";
import messages from "@/lib/i18n/en-US.json";

import { exportOrgData } from "./actions";

const copy = messages.adminExport;

export default async function ScrAdminExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePlatformOperator();
  const { id: rawId } = await params;
  const id = parseTenantExportPageOrgId(rawId);
  if (!id) notFound();
  const [{ error }, [org], history, operators] = await Promise.all([
    searchParams,
    db.select({ id: organization.id, displayName: organization.displayName }).from(organization).where(eq(organization.id, id)).limit(1),
    loadTenantExportHistory(id),
    db.select({ id: platformOperator.id, displayName: platformOperator.displayName }).from(platformOperator),
  ]);
  if (!org) notFound();
  const operatorNames = new Map(operators.map((operator) => [operator.id, operator.displayName]));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6" data-screen="SCR-admin-export">
      <header>
        <p className="text-sm font-semibold text-primary">{org.displayName}</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-text-secondary">{copy.description}</p>
      </header>

      {error ? (
        <p className="border border-error-text bg-error-bg p-3 text-sm text-text-primary" role="alert">
          {error === "statement_artifact" ? copy.statementError : copy.generationError}
        </p>
      ) : null}

      <section className="flex flex-col gap-3 border-y border-border py-5 sm:flex-row sm:items-center sm:justify-between" data-testid="export_action">
        <div>
          <h2 className="font-semibold text-text-primary">{copy.completeArchive}</h2>
          <p className="mt-1 text-sm text-text-secondary">{copy.completeArchiveDetail}</p>
        </div>
        <form action={exportOrgData}>
          <input name="orgId" type="hidden" value={id} />
          <button className="inline-flex min-h-11 items-center gap-2 bg-primary px-4 font-semibold text-text-on-primary" type="submit">
            <UploadCloud aria-hidden="true" className="h-4 w-4" />
            {copy.exportNow}
          </button>
        </form>
      </section>

      <section data-testid="export_history">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">{copy.history}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-semibold">{copy.generatedAt}</th>
                <th className="px-3 py-2 font-semibold">{copy.operator}</th>
                <th className="px-3 py-2 font-semibold">{copy.archive}</th>
                <th className="px-3 py-2 font-semibold">{copy.sha256}</th>
                <th className="px-3 py-2 text-right font-semibold">{copy.size}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-3 py-3 text-text-primary">{row.generatedAt.toISOString()}</td>
                  <td className="px-3 py-3 text-text-primary">{operatorNames.get(row.operatorId) ?? row.payload.operatorUserId}</td>
                  <td className="px-3 py-3"><a className="font-semibold text-primary underline-offset-4 hover:underline" href={`/admin/orgs/${id}/export/${row.id}`}>{copy.download}</a></td>
                  <td className="max-w-xs break-all px-3 py-3 font-mono text-xs text-text-secondary">{row.payload.zipSha256}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-text-primary">{new Intl.NumberFormat("en-US").format(row.payload.sizeBytes)} B</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {history.length === 0 ? <p className="py-10 text-center text-sm text-text-secondary">{copy.empty}</p> : null}
      </section>
    </main>
  );
}
