// SCAFFOLD (SCR-admin-cron-runs) — generated page stub. Build the real screen per its spec: docs/screens/SCR-admin-cron-runs.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrAdminCronRunsPage() {
  const title = pages["admin/cron-runs"]?.title ?? "Estado de crons";
  return (
    <div className="p-6" data-scaffold={"SCR-admin-cron-runs"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-admin-cron-runs"}
      </p>
    </div>
  );
}
