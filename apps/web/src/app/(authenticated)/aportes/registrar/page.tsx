// SCAFFOLD (SCR-record-contribution) — generated page stub. Build the real screen per its spec: docs/screens/SCR-record-contribution.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrRecordContributionPage() {
  const title = pages["aportes/registrar"]?.title ?? "Registrar aporte";
  return (
    <div className="p-6" data-scaffold={"SCR-record-contribution"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-record-contribution"}
      </p>
    </div>
  );
}
