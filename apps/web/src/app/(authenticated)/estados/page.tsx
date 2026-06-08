// SCAFFOLD (SCR-statements-archive) — generated page stub. Build the real screen per its spec: docs/screens/SCR-statements-archive.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrStatementsArchivePage() {
  const title = pages["estados"]?.title ?? "Estados de cuenta";
  return (
    <div className="p-6" data-scaffold={"SCR-statements-archive"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-statements-archive"}
      </p>
    </div>
  );
}
