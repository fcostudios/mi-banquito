import { notFound } from "next/navigation";
import { verifyHashSchema } from "@mi-banquito/contracts";
import { createReportingService, money, normalizeArchivedStatementMovement } from "@mi-banquito/domain";

import messages from "@/lib/i18n/en-US.json";
import { verifyAnotherStatementAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function VerifyStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ hash: string }>;
  searchParams?: Promise<{ verifyError?: string }>;
}) {
  const { hash } = await params;
  const query: { verifyError?: string } = await (searchParams ?? Promise.resolve({}));
  const parsed = verifyHashSchema.safeParse(hash);
  if (!parsed.success) notFound();

  const result = await createReportingService().verifyStatementHash(parsed.data.toLowerCase());
  if (!result.matched) notFound();
  const movements = result.movements.map(normalizeArchivedStatementMovement);
  if (movements.some((movement) => movement === null)) notFound();
  const canonicalMovements = movements.filter((movement) => movement !== null);
  const expectedPdfUri = `/statement-archive/public/${parsed.data.toLowerCase()}.pdf`;
  const archivedPdfUri = result.pdfUri === expectedPdfUri ? result.pdfUri : null;

  const copy = messages.verifier;
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6" data-screen="SCR-public-verify-pdf">
      <section className="rounded-md border border-border bg-surface p-5" data-testid="public_header">
        <p className="text-sm font-semibold text-primary">{messages.app_name}</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="mt-2 text-text-secondary">{copy.publicDescription}</p>
      </section>

      <form action={verifyAnotherStatementAction} className="grid gap-3 rounded-md border border-border bg-surface p-5" data-testid="verify_input">
        <input name="currentHash" type="hidden" value={parsed.data.toLowerCase()} />
        <label className="font-semibold text-text-primary" htmlFor="verification-hash">{copy.hashLabel}</label>
        <input
          autoComplete="off"
          className="min-h-12 rounded-md border border-border bg-surface px-3 font-mono text-sm text-text-primary"
          defaultValue={parsed.data.toLowerCase()}
          data-testid="hash"
          id="verification-hash"
          maxLength={64}
          minLength={64}
          name="hash"
          pattern="[0-9a-fA-F]{64}"
          required
          spellCheck={false}
          type="text"
        />
        {query.verifyError === "invalid-hash" ? (
          <p className="text-sm text-danger" role="alert">{copy.invalidHash}</p>
        ) : null}
        <button className="min-h-12 rounded-md bg-primary px-4 font-semibold text-text-on-primary" data-testid="btn_verify" type="submit">
          {copy.verifyAnother}
        </button>
      </form>

      <section className="rounded-md border border-border bg-surface p-5" data-testid="result_banner">
        <h2 className="text-lg font-bold text-text-primary">{copy.authenticTitle}</h2>
        <p className="mt-2 text-text-secondary">{copy.authenticBody}</p>
      </section>

      <section className="rounded-md border border-border bg-surface p-5" data-testid="qr_scan_hint">
        <h2 className="font-semibold text-text-primary">{copy.qrTitle}</h2>
        <p className="mt-2 text-sm text-text-secondary">{copy.qrHint}</p>
      </section>

      <section className="grid gap-2 rounded-md border border-border bg-surface p-5" data-testid="verify_result">
        <h2 className="font-semibold text-text-primary">{copy.detailsTitle}</h2>
        <p className="text-text-secondary">{result.groupName}</p>
        <p className="text-sm text-text-secondary">{copy.generatedAt}: {result.generatedAt.slice(0, 10)}</p>
      </section>

      <section className="grid gap-2 rounded-md border border-border bg-surface p-5" data-testid="pdf_preview">
        <h2 className="font-semibold text-text-primary">{copy.pdfPreviewTitle}</h2>
        <p className="text-sm text-text-secondary">
          {copy.pdfPreviewSummary
            .replace("{{group}}", result.groupName)
            .replace("{{period}}", result.periodLabel ?? copy.unknownPeriod)
            .replace("{{movements}}", String(canonicalMovements.length))}
        </p>
        {archivedPdfUri ? (
          <a className="font-semibold text-primary underline-offset-4 hover:underline" href={archivedPdfUri} target="_blank" rel="noreferrer">
            {copy.openArchivedPdf}
          </a>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-md border border-border bg-surface p-5" data-testid="movements_transparency">
        <div>
          <h2 className="font-semibold text-text-primary">{copy.movementsTitle}</h2>
          <p className="mt-1 text-sm text-text-secondary">{copy.movementsDescription}</p>
        </div>
        {canonicalMovements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">{copy.date}</th>
                  <th className="px-3 py-2 font-medium">{copy.concept}</th>
                  <th className="px-3 py-2 font-medium">{copy.category}</th>
                  <th className="px-3 py-2 font-medium">{copy.account}</th>
                  <th className="px-3 py-2 font-medium">{copy.status}</th>
                  <th className="px-3 py-2 text-right font-medium">{copy.amount}</th>
                </tr>
              </thead>
              <tbody>
                {canonicalMovements.map((movement) => (
                  <tr className="border-b border-border last:border-b-0" key={movement.sourceId}>
                    <td className="px-3 py-2 text-text-secondary">{movement.datedOn}</td>
                    <td className="px-3 py-2 text-text-primary">
                      {movement.reversesId ? `${copy.reversalLabel} · ${movement.label}` : movement.label}
                      {movement.reversesId ? (
                        <span className="block text-xs text-text-secondary">{copy.reverses}: {movement.reversesId}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-text-primary">{movement.category}</td>
                    <td className="px-3 py-2 text-text-primary">{movement.accountName ?? copy.noAccount}</td>
                    <td className="px-3 py-2 text-text-primary">{movement.reconciliationStatus ?? copy.reconciled}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-text-primary">{money(movement.signedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">{copy.noMovements}</p>
        )}
      </section>
    </main>
  );
}
