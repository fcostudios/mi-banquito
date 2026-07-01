import Link from "next/link";
import { notFound } from "next/navigation";
import { createLoanService } from "@mi-banquito/domain";
import { StatusPill } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { ecCurrency } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

const copy = messages.sprint2.loanDetail;
const statusTone = (status: string) => status === "pagado" ? "success" : status === "en_mora" ? "danger" : "neutral";

export default async function ScrLoanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ repayment?: string; interest?: string; principal?: string; remaining?: string }>;
}) {
  const session = await requireTreasurer();
  const { id } = await params;
  const detail = await createLoanService().getLoanDetail(session.orgId, id);
  if (!detail) notFound();
  const query = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6" data-screen="SCR-loan-detail">
      <header className="grid gap-4 rounded-md border border-border bg-surface p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-sm font-semibold text-primary">{copy.title}</p>
          <h1 className="mt-2 text-3xl font-bold text-text-primary">{detail.borrowerName}</h1>
          <p className="mt-2 text-text-secondary">{detail.borrowerKind}</p>
        </div>
        <StatusPill tone={statusTone(detail.status)} label={detail.status} />
      </header>

      {query?.repayment ? (
        <section className="rounded-md border border-border bg-surface p-4 text-sm text-text-primary" role="status">
          {copy.paymentRecorded}: {copy.interest} {query.interest ?? "0.0000"} · {copy.principal} {query.principal ?? "0.0000"} · {copy.remainingPrincipal} {query.remaining ?? "0.0000"}
        </section>
      ) : null}

      <nav className="flex flex-wrap gap-2" aria-label={copy.tabs}>
        {[
          [copy.summary, "#resumen"],
          [copy.schedule, "#cronograma"],
          [copy.payments, "#pagos"],
          [copy.history, "#historial"],
          [copy.actions, "#acciones"],
        ].map(([label, href]) => (
          <a key={href} href={href} className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold text-text-primary">
            {label}
          </a>
        ))}
      </nav>

      <section id="resumen" className="grid gap-4 rounded-md border border-border bg-surface p-5" aria-label={copy.summary}>
        <h2 className="text-xl font-semibold text-text-primary">{copy.summary}</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label={copy.principal} value={ecCurrency.format(Number(detail.principalAmount))} />
          <Metric label={copy.rate} value={`${detail.rateValue}%`} />
          <Metric label={copy.term} value={`${detail.termPeriods}`} />
          <Metric label={copy.originatedOn} value={detail.originatedOn} />
        </div>
        <div className="grid gap-2 text-sm text-text-secondary">
          {detail.guarantorName ? <p>{copy.guarantor}: {detail.guarantorName}</p> : null}
          {detail.referrerName ? <p>{copy.referrer}: {detail.referrerName}</p> : null}
        </div>
      </section>

      <section id="cronograma" className="grid gap-3 rounded-md border border-border bg-surface p-5" aria-label={copy.schedule}>
        <h2 className="text-xl font-semibold text-text-primary">{copy.schedule}</h2>
        <div className="grid gap-2">
          {detail.schedule.map((row) => {
            const fee = detail.fees.find((item) => item.datedOn === row.dueOn);
            return (
              <div key={row.periodIndex} className="grid gap-2 border-b border-border py-3 last:border-b-0 md:grid-cols-[auto_1fr_auto] md:items-center">
                <span className="font-semibold text-text-primary">{row.periodIndex}</span>
                <p className="text-sm text-text-secondary">
                  {row.dueOn} · {copy.principal}: {row.principalDue} · {copy.interest}: {row.interestDue}
                  {" · "}{copy.paidPrincipal}: {row.paidPrincipalToDate} · {copy.paidInterest}: {row.paidInterestToDate}
                  {fee ? ` · ${copy.fee}: ${fee.amount}` : ""}
                </p>
                <StatusPill tone={statusTone(row.status)} label={row.status} />
              </div>
            );
          })}
        </div>
      </section>

      <section id="pagos" className="grid gap-3 rounded-md border border-border bg-surface p-5" aria-label={copy.payments}>
        <h2 className="text-xl font-semibold text-text-primary">{copy.payments}</h2>
        {detail.repayments.length === 0 ? (
          <p className="text-sm text-text-secondary">{copy.noPayments}</p>
        ) : detail.repayments.map((row) => (
          <div key={row.id} className="grid gap-2 border-b border-border py-2 text-sm text-text-secondary last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
            <p>
              {row.datedOn} · {copy.interest}: {row.appliedToInterest} · {copy.principal}: {row.appliedToPrincipal}
            </p>
            {!row.reversesId && !row.reverseReason ? (
              <span className="font-semibold text-primary">{copy.reverse}</span>
            ) : null}
          </div>
        ))}
      </section>

      <section id="historial" className="grid gap-3 rounded-md border border-border bg-surface p-5" aria-label={copy.history}>
        <h2 className="text-xl font-semibold text-text-primary">{copy.history}</h2>
        {detail.accruals.length === 0 ? (
          <p className="text-sm text-text-secondary">{copy.noAccruals}</p>
        ) : detail.accruals.map((row) => (
          <p key={row.accruedOn} className="border-b border-border py-2 text-sm text-text-secondary last:border-b-0">
            {row.accruedOn} · {copy.interest}: {row.interestAmount} · {copy.principal}: {row.principalBasis}
          </p>
        ))}
      </section>

      <section id="acciones" className="rounded-md border border-border bg-surface p-5" aria-label={copy.actions}>
        <h2 className="text-xl font-semibold text-text-primary">{copy.actions}</h2>
        <Link
          href={`/prestamos/${detail.id}/pago`}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground"
        >
          {copy.recordPayment}
        </Link>
        {detail.repayments.some((row) => !row.reversesId && !row.reverseReason) ? (
          <p className="mt-3 text-sm font-semibold text-primary">{copy.reverse}</p>
        ) : null}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-muted p-4">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}
