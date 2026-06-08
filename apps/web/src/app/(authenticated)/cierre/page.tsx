// SCAFFOLD (SCR-monthly-close) — generated page stub. Build the real screen per its spec: docs/screens/SCR-monthly-close.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrMonthlyClosePage() {
  const title = pages["cierre"]?.title ?? "Cierre del mes";
  return (
    <div className="p-6" data-scaffold={"SCR-monthly-close"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-monthly-close"}
      </p>
    </div>
  );
}
