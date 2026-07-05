import Link from "next/link";
import { notFound } from "next/navigation";
import { createPlatformService } from "@mi-banquito/domain";
import { ButtonPrimary, ButtonSecondary, FormField, StatusPill } from "@mi-banquito/ui";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import { ecDate } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import { updateOrganizationLifecycleAction } from "../actions";

export const dynamic = "force-dynamic";

const copy = messages.adminOrgs.detail;

export default async function ScrAdminOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformOperator();
  const { id } = await params;
  const platform = createPlatformService();
  const [org, closeSnapshot] = await Promise.all([
    platform.getOrganization(id),
    platform.getOrganizationCloseOverdueSnapshot(id),
  ]);

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

      {closeSnapshot ? (
        <section className="grid gap-4 rounded-md border border-border bg-surface p-5" aria-label={copy.closeHealthTitle}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-text-primary">{copy.closeHealthTitle}</h2>
            <StatusPill
              tone={closeSnapshot.overdue ? "warning" : "success"}
              label={closeSnapshot.overdue ? copy.closeHealthOverdue : copy.closeHealthOk}
            />
          </div>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-text-secondary">{copy.lastClose}</dt>
              <dd className="mt-1 font-medium text-text-primary">
                {closeSnapshot.latestClosedAt ? ecDate.format(closeSnapshot.latestClosedAt) : copy.neverClosed}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-secondary">{copy.daysSinceClose}</dt>
              <dd className="mt-1 font-medium text-text-primary">{closeSnapshot.daysSinceClose}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-secondary">{copy.closeThreshold}</dt>
              <dd className="mt-1 font-medium text-text-primary">{closeSnapshot.thresholdDays}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="grid gap-4 rounded-md border border-border bg-surface p-5" aria-label={copy.lifecycleTitle}>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{copy.lifecycleTitle}</h2>
          <p className="text-sm text-text-secondary">{copy.lifecycleDescription}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <form action={updateOrganizationLifecycleAction} className="grid gap-3">
            <input type="hidden" name="orgId" value={org.id} />
            <input type="hidden" name="status" value="paused" />
            <FormField labelKey={copy.reason}>
              <textarea
                name="reason"
                className="min-h-20 w-full rounded-md border border-border bg-surface px-4 py-3 text-text-primary focus:border-primary"
                required
              />
            </FormField>
            <ButtonSecondary type="submit">{copy.freeze}</ButtonSecondary>
          </form>
          <form action={updateOrganizationLifecycleAction} className="grid gap-3">
            <input type="hidden" name="orgId" value={org.id} />
            <input type="hidden" name="status" value="archived" />
            <FormField labelKey={copy.reason}>
              <textarea
                name="reason"
                className="min-h-20 w-full rounded-md border border-border bg-surface px-4 py-3 text-text-primary focus:border-primary"
                required
              />
            </FormField>
            <ButtonPrimary type="submit">{copy.archive}</ButtonPrimary>
          </form>
        </div>
      </section>
    </main>
  );
}
