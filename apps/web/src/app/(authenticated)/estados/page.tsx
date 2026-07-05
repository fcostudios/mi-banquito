import Link from "next/link";
import { createReportingService } from "@mi-banquito/domain";

import { requireTreasurer } from "@/lib/auth/require-session";
import { ecDate } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

const pageCopy = messages.pages.estados;
const copy = messages.statementArchive;

export default async function ScrStatementsArchivePage() {
  const session = await requireTreasurer();
  const rows = await createReportingService().listStatementArchive(session.orgId);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6" data-screen="SCR-statements-archive">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{pageCopy.title}</h1>
        <p className="mt-2 text-text-secondary">{copy.description}</p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-secondary">{copy.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">{copy.kind}</th>
                <th className="px-4 py-3 font-medium">{copy.period}</th>
                <th className="px-4 py-3 font-medium">{copy.generatedAt}</th>
                <th className="px-4 py-3 font-medium">{copy.hash}</th>
                <th className="px-4 py-3 font-medium">{copy.openPdf}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-medium text-text-primary">{row.kind}</td>
                  <td className="px-4 py-3 text-text-primary">{row.periodLabel}</td>
                  <td className="px-4 py-3 text-text-primary">{ecDate.format(row.generatedAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{row.canonicalPayloadHash.slice(0, 12)}</td>
                  <td className="px-4 py-3">
                    <Link className="text-primary underline-offset-4 hover:underline" href={row.pdfUri}>
                      {copy.openPdf}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
