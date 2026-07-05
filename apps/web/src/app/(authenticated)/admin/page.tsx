import Link from "next/link";
import { createPlatformService } from "@mi-banquito/domain";
import { ButtonPrimary, StatusPill } from "@mi-banquito/ui";

import { requirePlatformOperator } from "@/lib/auth/require-session";
import { ecDate } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

const copy = messages.adminOrgs.home;

export default async function ScrAdminHomePage() {
  await requirePlatformOperator();
  const organizations = await createPlatformService().listOrganizations();
  const activeCount = organizations.filter((org) => org.status === "active").length;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6" data-screen="SCR-admin-home">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
          <p className="mt-2 text-text-secondary">{copy.description}</p>
        </div>
        <Link href="/admin/orgs/nueva">
          <ButtonPrimary labelKey={copy.newOrganization} />
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-2" aria-label={copy.totalOrganizations}>
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-sm text-text-secondary">{copy.activeOrganizations}</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">{activeCount}</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-sm text-text-secondary">{copy.totalOrganizations}</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">{organizations.length}</p>
        </div>
      </section>

      {organizations.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-secondary">{copy.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">{copy.organization}</th>
                <th className="px-4 py-3 font-medium">{copy.status}</th>
                <th className="px-4 py-3 font-medium">{copy.createdAt}</th>
                <th className="px-4 py-3 font-medium">{copy.orgId}</th>
                <th className="px-4 py-3 font-medium">{copy.open}</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr key={org.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-medium text-text-primary">{org.displayName}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={org.status === "active" ? "success" : "neutral"} label={org.status} />
                  </td>
                  <td className="px-4 py-3 text-text-primary">{ecDate.format(org.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{org.id}</td>
                  <td className="px-4 py-3">
                    <Link className="text-primary underline-offset-4 hover:underline" href={`/admin/orgs/${org.id}`}>
                      {copy.open}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
