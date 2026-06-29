import Link from "next/link";
import { createLedgerService } from "@mi-banquito/domain";
import { ButtonPrimary, StatusPill } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

const copy = messages.sprint1.members;

export default async function MemberListPage({
  searchParams,
}: {
  searchParams: Promise<{ nueva?: string }>;
}) {
  const session = await requireTreasurer();
  const rows = await createLedgerService().listMembersWithCompliance(session.orgId);
  const { nueva } = await searchParams;

  return (
    <main className="flex w-full flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <Link href="/socias/nueva">
          <ButtonPrimary labelKey={copy.add} />
        </Link>
      </header>
      <div className="grid gap-2">
        {rows.length === 0 ? <p className="text-text-secondary">{copy.empty}</p> : null}
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/socias/${row.id}`}
            className={`grid gap-2 rounded-md border border-border bg-surface p-4 text-text-primary ${nueva === row.id ? "ring-2 ring-primary" : ""}`}
          >
            <div className="flex items-center justify-between gap-3">
              <strong>{row.displayName}</strong>
              <StatusPill tone={row.complianceTone} label={row.complianceState} />
            </div>
            <div className="text-sm text-text-secondary">
              {row.whatsappNumber ?? ""} {row.role} {row.status}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
