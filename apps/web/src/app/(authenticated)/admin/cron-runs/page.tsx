import { desc } from "drizzle-orm";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { db } from "@mi-banquito/db";
import { cronRun } from "@mi-banquito/db/schema";
import { replayCronRun } from "./actions";

type CronRunCopy = {
  title: string;
  description: string;
  endpoint: string;
  timestamp: string;
  duration: string;
  orgs: string;
  failures: string;
  summary: string;
  replay: string;
  fromDate: string;
  toDate: string;
  empty: string;
};

const fallbackCopy: CronRunCopy = {
  title: "Cron status",
  description: "Review cron history and replay a date range when recovery is needed.",
  endpoint: "Endpoint",
  timestamp: "Timestamp",
  duration: "Duration",
  orgs: "Orgs",
  failures: "Failures",
  summary: "Summary",
  replay: "Replay",
  fromDate: "From date",
  toDate: "To date",
  empty: "No cron runs have been recorded yet.",
};

const copy = ((messages as { adminCronRuns?: Partial<CronRunCopy> }).adminCronRuns ?? {}) as Partial<CronRunCopy>;
const t: CronRunCopy = { ...fallbackCopy, ...copy };

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatSummary(summary: unknown): string {
  if (!summary || typeof summary !== "object") {
    return "{}";
  }
  return JSON.stringify(summary);
}

export default async function ScrAdminCronRunsPage() {
  await requirePlatformOperator();
  const runs = await db
    .select()
    .from(cronRun)
    .orderBy(desc(cronRun.startedAt));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6" data-screen="SCR-admin-cron-runs">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-text-primary">{t.title}</h1>
        <p className="max-w-3xl text-sm text-text-secondary">{t.description}</p>
      </header>

      <section className="overflow-x-auto rounded-md border border-border bg-surface">
        <table className="min-w-full divide-y divide-border text-left text-sm">
          <thead className="bg-surface-muted text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-semibold">{t.endpoint}</th>
              <th className="px-4 py-3 font-semibold">{t.timestamp}</th>
              <th className="px-4 py-3 font-semibold">{t.duration}</th>
              <th className="px-4 py-3 font-semibold">{t.orgs}</th>
              <th className="px-4 py-3 font-semibold">{t.failures}</th>
              <th className="px-4 py-3 font-semibold">{t.summary}</th>
              <th className="px-4 py-3 font-semibold">{t.replay}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-text-secondary" colSpan={7}>
                  {t.empty}
                </td>
              </tr>
            ) : runs.map((run) => (
              <tr key={run.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-text-primary">{run.endpoint}</td>
                <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{formatDateTime(run.startedAt)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{run.durationMs}ms</td>
                <td className="px-4 py-3 text-text-secondary">{run.orgsProcessed}</td>
                <td className="px-4 py-3 text-text-secondary">{run.failureCount}</td>
                <td className="max-w-md px-4 py-3">
                  <code className="block max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-muted p-2 text-xs text-text-secondary">
                    {formatSummary(run.summary)}
                  </code>
                </td>
                <td className="px-4 py-3">
                  <form action={replayCronRun} className="grid min-w-64 gap-2">
                    <input type="hidden" name="endpoint" value={run.endpoint} />
                    <label className="grid gap-1 text-xs font-medium text-text-secondary">
                      <span>{t.fromDate}</span>
                      <input
                        className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text-primary"
                        type="date"
                        name="from_date"
                        defaultValue={run.replayFrom ?? new Date(run.startedAt).toISOString().slice(0, 10)}
                        required
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-text-secondary">
                      <span>{t.toDate}</span>
                      <input
                        className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text-primary"
                        type="date"
                        name="to_date"
                        defaultValue={run.replayTo ?? new Date(run.startedAt).toISOString().slice(0, 10)}
                        required
                      />
                    </label>
                    <button
                      className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-text-on-primary"
                      type="submit"
                    >
                      {t.replay}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
