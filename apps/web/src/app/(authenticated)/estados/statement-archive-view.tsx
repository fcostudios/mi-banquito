import Link from "next/link";
import { ButtonPrimary } from "@mi-banquito/ui";
import { money, type StatementArchiveSummary } from "@mi-banquito/domain";

import { ecDate } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import { ROUTE_SCR_MEMBER_DETAIL } from "@/lib/routes";

type FormAction = (formData: FormData) => void | Promise<void>;

export type StatementArchivePageView = {
  latestReadyPeriodClose: { id: string; periodLabel: string } | null;
  activeMemberCount: number;
  latestActiveArchiveCount: number;
  memberArchives: Array<{ id: string; memberId: string; memberName: string; periodLabel: string; pdfUri: string }>;
  summary?: StatementArchiveSummary | null;
  archiveRows?: Array<{
    id: string; kind: string; periodLabel: string; generatedAt: string;
    canonicalPayloadHash: string; pdfUri: string; artifactStatus: "pending" | "ready" | "failed";
  }>;
};

const pageCopy = messages.pages.estados;
const copy = messages.statementArchive;

export function StatementArchiveView({
  view,
  generateAction,
  shareAction,
}: {
  view: StatementArchivePageView;
  generateAction: FormAction;
  shareAction: FormAction;
}) {
  const rows = view.archiveRows ?? [];
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{pageCopy.title}</h1>
        <p className="mt-2 text-text-secondary">{copy.description}</p>
      </div>
      {view.summary ? (
        <section className="grid gap-4" data-testid="period_summary">
          <h2 className="text-lg font-bold text-text-primary">
            {copy.summaryTitle.replace("{{period}}", view.summary.periodLabel)}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { id: "members", label: copy.summaryMembers, value: String(view.summary.members) },
              { id: "in", label: copy.summaryIn, value: money(view.summary.in) },
              { id: "out", label: copy.summaryOut, value: money(view.summary.out) },
              { id: "movements", label: copy.summaryMovements, value: money(view.summary.movements) },
              { id: "saldo", label: copy.summaryBalance, value: money(view.summary.saldo) },
            ].map((metric) => (
              <article className="rounded-md border border-border bg-surface p-4" data-testid={metric.id} key={metric.id}>
                <p className="text-sm text-text-secondary">{metric.label}</p>
                <p className="mt-1 font-semibold tabular-nums text-text-primary">{metric.value}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {view.latestReadyPeriodClose ? (
        <form action={generateAction} className="rounded-md border border-border bg-surface p-4">
          <input type="hidden" name="periodCloseId" value={view.latestReadyPeriodClose.id} />
          <ButtonPrimary type="submit">{copy.generateMemberStatements.replace("{{period}}", view.latestReadyPeriodClose.periodLabel)}</ButtonPrimary>
        </form>
      ) : null}
      <p className="text-sm text-text-secondary">
        {copy.memberStatementsReady
          .replace("{{ready}}", String(view.latestActiveArchiveCount))
          .replace("{{active}}", String(view.activeMemberCount))}
      </p>
      {view.memberArchives.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-text-secondary"><tr>
              <th className="px-4 py-3 font-medium">{copy.member}</th>
              <th className="px-4 py-3 font-medium">{copy.period}</th>
              <th className="px-4 py-3 font-medium">{copy.openPdf}</th>
            </tr></thead>
            <tbody>{view.memberArchives.map((row) => (
              <tr className="border-b border-border last:border-b-0" key={row.id}>
                <td className="px-4 py-3 font-medium text-text-primary">
                  <Link className="text-primary underline-offset-4 hover:underline" href={ROUTE_SCR_MEMBER_DETAIL.replace("[id]", row.memberId)}>{row.memberName}</Link>
                </td>
                <td className="px-4 py-3 text-text-primary">{row.periodLabel}</td>
                <td className="px-4 py-3">
                  <Link className="text-primary underline-offset-4 hover:underline" href={row.pdfUri}>{copy.openPdf}</Link>
                  <form action={shareAction} className="mt-2">
                    <input type="hidden" name="statementArchiveId" value={row.id} />
                    <ButtonPrimary type="submit">{copy.shareWhatsapp}</ButtonPrimary>
                  </form>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-secondary">{copy.empty}</p>
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-text-secondary"><tr>
              <th className="px-4 py-3 font-medium">{copy.kind}</th>
              <th className="px-4 py-3 font-medium">{copy.period}</th>
              <th className="px-4 py-3 font-medium">{copy.generatedAt}</th>
              <th className="px-4 py-3 font-medium">{copy.hash}</th>
              <th className="px-4 py-3 font-medium">{copy.openPdf}</th>
            </tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 font-medium text-text-primary">{row.kind}</td>
                <td className="px-4 py-3 text-text-primary">{row.periodLabel}</td>
                <td className="px-4 py-3 text-text-primary">{ecDate.format(new Date(row.generatedAt))}</td>
                <td className="px-4 py-3 font-mono text-xs text-text-secondary">{row.canonicalPayloadHash.slice(0, 12)}</td>
                <td className="px-4 py-3">{row.artifactStatus === "ready" ? (
                  <Link className="text-primary underline-offset-4 hover:underline" href={row.pdfUri}>{copy.openPdf}</Link>
                ) : <span className="text-text-secondary">{messages.monthlyClose.artifactProcessing}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
