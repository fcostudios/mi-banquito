import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileBar } from "@/components/layout/mobile-bar";
import { OfflineQueueIndicator } from "@/components/offline/offline-queue-indicator";
import { getShellSession } from "@/lib/auth/require-session";
import { createAlertsService } from "@mi-banquito/domain";
import messages from "@/lib/i18n/en-US.json";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const shell = await getShellSession();
  const alerts = shell.orgId ? await createAlertsService().listVisibleAlerts({
    orgId: shell.orgId,
    audience: "treasurer",
    now: new Date(),
  }) : [];

  return (
    <div className="flex min-h-screen bg-background" data-ui-stabilized="authenticated-shell">
      <Sidebar roles={shell.roles} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          displayName={shell.displayName}
          email={shell.email}
          alertCount={alerts.length}
          alerts={alerts}
          copy={messages.shell.header}
        />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>
      </div>
      <MobileBar roles={shell.roles} />
      <OfflineQueueIndicator />
    </div>
  );
}
