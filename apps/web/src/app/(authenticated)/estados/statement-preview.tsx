import type { MemberStatementPreview } from "@mi-banquito/domain";

import messages from "@/lib/i18n/en-US.json";
import { ecDate } from "@/lib/format/es-ec";

export function StatementPreview({
  preview,
  archiveUri,
  archiveGeneratedAt = null,
}: {
  preview: MemberStatementPreview;
  archiveUri: string | null;
  archiveGeneratedAt?: string | null;
}) {
  const { payload } = preview;
  return (
    <section
      className="grid gap-5 rounded-md border border-border bg-surface p-5"
      data-testid="member_statement_preview"
    >
      <header className="grid gap-1 border-b border-border pb-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-sm font-semibold text-primary">{payload.orgName}</p>
          <h2 className="text-xl font-bold text-text-primary">{payload.member.displayName}</h2>
        </div>
        <p className="text-sm text-text-secondary">{payload.periodLabel}</p>
      </header>

      {payload.sections.filter((section) => section.id !== "fund-movements").map((section) => (
        <div className="grid gap-3" key={section.id}>
          <h3 className="font-semibold text-text-primary">{section.title}</h3>
          <dl className="grid gap-2">
            {section.rows.map((row, index) => (
              <div className="grid gap-1 border-b border-border pb-2 last:border-b-0 sm:grid-cols-[1fr_auto]" key={`${row.label}-${index}`}>
                <dt className="text-sm text-text-secondary">{row.label}</dt>
                <dd className="font-semibold tabular-nums text-text-primary">
                  {"value" in row ? row.value : row.amount}
                  {"details" in row && row.details.length > 0 ? (
                    <ul className="mt-1 text-xs font-normal text-text-secondary">
                      {row.details.map((detail) => <li key={detail}>{detail}</li>)}
                    </ul>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {payload.verificationMovements.length > 0 ? (
        <section className="grid gap-3" data-testid="movements_transparency">
          <h3 className="font-semibold text-text-primary">{messages.statementArchive.fundMovementsTitle}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">{messages.statementArchive.movementDate}</th>
                  <th className="px-3 py-2 font-medium">{messages.statementArchive.movementConcept}</th>
                  <th className="px-3 py-2 font-medium">{messages.statementArchive.movementCategory}</th>
                  <th className="px-3 py-2 font-medium">{messages.statementArchive.movementAccount}</th>
                  <th className="px-3 py-2 font-medium">{messages.statementArchive.movementStatus}</th>
                  <th className="px-3 py-2 text-right font-medium">{messages.statementArchive.movementAmount}</th>
                </tr>
              </thead>
              <tbody>
                {payload.verificationMovements.map((movement) => (
                  <tr className="border-b border-border last:border-b-0" key={movement.sourceId}>
                    <td className="px-3 py-2 text-text-secondary">{movement.datedOn}</td>
                    <td className="px-3 py-2 text-text-primary">
                      {movement.reversesId ? `${messages.statementArchive.reversalLabel} · ${movement.label}` : movement.label}
                      {movement.reversesId ? <span className="block text-xs text-text-secondary">{messages.statementArchive.movementReversal}: {movement.reversesId}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-text-primary">{movement.category}</td>
                    <td className="px-3 py-2 text-text-primary">{movement.accountName ?? messages.statementArchive.noAccount}</td>
                    <td className="px-3 py-2 text-text-primary">{movement.reconciliationStatus ?? messages.statementArchive.reconciled}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-text-primary">{movement.signedAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {archiveUri ? (
        <footer className="grid gap-2 border-t border-border pt-4">
          <p className="break-all text-xs text-text-secondary">
            {messages.statementArchive.archivedHash}: {preview.canonicalPayloadHash}
          </p>
          {archiveGeneratedAt ? (
            <p className="text-xs text-text-secondary">
              {messages.statementArchive.archivedGeneratedAt}: {ecDate.format(new Date(archiveGeneratedAt))}
            </p>
          ) : null}
          <a className="font-semibold text-primary underline-offset-4 hover:underline" href={archiveUri} target="_blank" rel="noreferrer">
            {messages.statementArchive.openPdf}
          </a>
        </footer>
      ) : null}
    </section>
  );
}
