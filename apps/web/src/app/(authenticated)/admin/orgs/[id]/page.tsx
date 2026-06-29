import Link from "next/link";
import { notFound } from "next/navigation";
import { createPlatformService } from "@mi-banquito/domain";
import { ButtonSecondary, StatusPill } from "@mi-banquito/ui";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import { ecDate } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

const copy = messages.adminOrgs.detail;

export default async function ScrAdminOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformOperator();
  const { id } = await params;
  const org = await createPlatformService().getOrganization(id);

  if (!org) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{org.displayName}</h1>
          <p className="mt-2 text-text-secondary">{copy.title}</p>
        </div>
        <Link href={`/admin/orgs/${org.id}/config`}>
          <ButtonSecondary labelKey={copy.configLink} />
        </Link>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-md border border-border bg-surface p-4">
          <dt className="text-sm text-text-secondary">{copy.status}</dt>
          <dd className="mt-2">
            <StatusPill tone={org.status === "active" ? "success" : "neutral"} label={org.status} />
          </dd>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <dt className="text-sm text-text-secondary">{copy.country}</dt>
          <dd className="mt-2 font-medium text-text-primary">{org.countryCode}</dd>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <dt className="text-sm text-text-secondary">{copy.currency}</dt>
          <dd className="mt-2 font-medium text-text-primary">{org.currencyCode}</dd>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <dt className="text-sm text-text-secondary">{copy.timezone}</dt>
          <dd className="mt-2 font-medium text-text-primary">{org.timezone}</dd>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <dt className="text-sm text-text-secondary">{copy.language}</dt>
          <dd className="mt-2 font-medium text-text-primary">{org.defaultLanguage}</dd>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <dt className="text-sm text-text-secondary">{copy.createdAt}</dt>
          <dd className="mt-2 font-medium text-text-primary">{ecDate.format(org.createdAt)}</dd>
        </div>
      </dl>
    </main>
  );
}
