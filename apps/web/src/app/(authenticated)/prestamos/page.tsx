import Link from "next/link";
import { createLoanService } from "@mi-banquito/domain";
import { StatusPill } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { ecCurrency } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

const copy = messages.sprint2.loansList;

const statusTone = (status: string) => status === "pagado" ? "success" : status === "en_mora" ? "danger" : "neutral";

export default async function ScrLoansListPage() {
  const session = await requireTreasurer();
  const loans = await createLoanService().listLoans(session.orgId);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6" data-screen="SCR-loans-list">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
          <p className="text-text-secondary">{copy.description}</p>
        </div>
        <Link
          href="/prestamos/nuevo"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground"
        >
          {copy.newLoan}
        </Link>
      </div>

      <section className="grid overflow-hidden rounded-md border border-border bg-surface">
        {loans.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">{copy.empty}</p>
        ) : loans.map((loan) => (
          <Link
            key={loan.id}
            href={`/prestamos/${loan.id}`}
            className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center"
          >
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <strong className="text-text-primary">{loan.borrowerName}</strong>
                <StatusPill tone={statusTone(loan.status)} label={loan.status} />
              </div>
              <p className="mt-1 text-sm text-text-secondary">{loan.borrowerKind}</p>
            </div>
            <span className="font-semibold text-text-primary">{ecCurrency.format(Number(loan.principalAmount))}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
