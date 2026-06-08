// SCAFFOLD (SCR-loans-list) — generated page stub. Build the real screen per its spec: docs/screens/SCR-loans-list.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrLoansListPage() {
  const title = pages["prestamos"]?.title ?? "Préstamos";
  return (
    <div className="p-6" data-scaffold={"SCR-loans-list"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-loans-list"}
      </p>
    </div>
  );
}
