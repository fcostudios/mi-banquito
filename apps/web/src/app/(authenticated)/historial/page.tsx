// SCAFFOLD (SCR-history) — generated page stub. Build the real screen per its spec: docs/screens/SCR-history.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrHistoryPage() {
  const title = pages["historial"]?.title ?? "Historial";
  return (
    <div className="p-6" data-scaffold={"SCR-history"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-history"}
      </p>
    </div>
  );
}
