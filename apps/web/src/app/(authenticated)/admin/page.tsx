import Link from "next/link";
import { createAdminHealthService } from "@mi-banquito/domain";
import { ButtonPrimary } from "@mi-banquito/ui";

import { AdminHealthDashboard } from "@/components/admin/admin-health-dashboard";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import { getDriftRunnerDeploymentStatus } from "@/lib/drift/runner";
import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

const copy = messages.adminOrgs.home;

export default async function ScrAdminHomePage() {
  await requirePlatformOperator();
  const dashboard = await createAdminHealthService().getDashboard();
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

      <AdminHealthDashboard
        snapshots={dashboard.snapshots}
        drift={dashboard.drift}
        consecutiveCleanMonths={dashboard.consecutiveCleanMonths}
        runnerDeployment={getDriftRunnerDeploymentStatus()}
      />
    </main>
  );
}
