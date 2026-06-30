import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileBar } from "@/components/layout/mobile-bar";
import { getShellSession } from "@/lib/auth/require-session";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const shell = await getShellSession();

  return (
    <div className="flex min-h-screen bg-background" data-ui-stabilized="authenticated-shell">
      <Sidebar roles={shell.roles} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header displayName={shell.displayName} email={shell.email} />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>
      </div>
      <MobileBar roles={shell.roles} />
    </div>
  );
}
