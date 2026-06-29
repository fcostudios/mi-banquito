import Link from "next/link";
import { createLedgerService } from "@mi-banquito/domain";
import { StatusPill } from "@mi-banquito/ui";
import { auth0 } from "@/lib/auth0";
import { getDbOrgIdFromUser } from "@/lib/auth/session-claims";
import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

export default async function ScrTreasurerHomePage() {
  const session = await auth0.getSession();
  const orgId = getDbOrgIdFromUser(session?.user);
  const rows = orgId ? await createLedgerService().listComplianceRows(orgId) : [];
  const title = messages.pages.home.title;

  return (
    <main className="flex w-full flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
      <section className="grid gap-3">
        {rows.map((row) => (
          <Link key={row.memberId} href={`/socias/${row.memberId}`} className="flex items-center justify-between rounded-md border border-border bg-surface p-4">
            <span className="font-medium text-text-primary">{row.displayName}</span>
            <StatusPill tone={row.tone} label={row.state} />
          </Link>
        ))}
      </section>
    </main>
  );
}
