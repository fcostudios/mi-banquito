import { createPilotService, evaluatePilotExitChecklist } from "@mi-banquito/domain";

import { requirePlatformOperator } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";

import { addPilotLogEntryAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.pilotLog;

export default async function ScrAdminPilotLogPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformOperator();
  const { id } = await params;
  const entries = await createPilotService().listEntries(id);
  const checklist = evaluatePilotExitChecklist(entries.map((row) => ({
    observedOn: row.observedOn,
    cleanMonth: row.cleanMonth,
    wouldNotReturnToPaper: row.wouldNotReturnToPaper,
  })));

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 p-6" data-screen="SCR-admin-pilot-log">
      <header>
        <h1 className="text-3xl font-bold text-text-primary">{copy.title}</h1>
        <p className="mt-2 text-text-secondary">{copy.description}</p>
      </header>

      <section className="rounded-md border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold text-text-primary">{copy.exitCriteria}</h2>
        <ul className="mt-3 grid gap-2 text-sm text-text-secondary">
          <li>{checklist.hasThreeCleanMonths ? copy.ready : copy.pending} - {copy.threeCleanMonths}</li>
          <li>{checklist.hasWouldNotReturnAffirmation ? copy.ready : copy.pending} - {copy.wouldNotReturn}</li>
          <li>{checklist.readyToExit ? copy.readyToClose : copy.monitoring}</li>
        </ul>
      </section>

      <form action={addPilotLogEntryAction} className="grid gap-3 rounded-md border border-border bg-surface p-5">
        <input type="hidden" name="orgId" value={id} />
        <input className="rounded-md border border-border p-2" aria-label={copy.observedOn} name="observedOn" type="date" required />
        <input className="rounded-md border border-border p-2" aria-label={copy.vocabularyAnswer} name="vocabularyAnswer" placeholder={copy.vocabularyAnswer} required />
        <input className="rounded-md border border-border p-2" aria-label={copy.paperValue} name="paperValue" placeholder={copy.paperValue} required />
        <input className="rounded-md border border-border p-2" aria-label={copy.systemValue} name="systemValue" placeholder={copy.systemValue} required />
        <input className="rounded-md border border-border p-2" aria-label={copy.discrepancy} name="discrepancy" placeholder={copy.discrepancy} required />
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" name="cleanMonth" value="yes" />
          {copy.cleanMonth}
        </label>
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" name="wouldNotReturnToPaper" value="yes" />
          {copy.wouldNotReturnCheckbox}
        </label>
        <textarea className="rounded-md border border-border p-2" aria-label={copy.note} name="note" placeholder={copy.note} />
        <button className="min-h-11 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground" type="submit">{copy.save}</button>
      </form>

      <section className="grid gap-3">
        {entries.map((row) => (
          <article key={row.id} className="rounded-md border border-border bg-surface p-4">
            <h2 className="font-semibold text-text-primary">{row.observedOn}</h2>
            <p className="text-sm text-text-secondary">
              {copy.paperValue}: {row.paperValue} - {copy.systemValue}: {row.systemValue} - {copy.discrepancy}: {row.discrepancy}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
