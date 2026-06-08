// SCAFFOLD (SCR-first-run-wizard) — generated page stub. Build the real screen per its spec: docs/screens/SCR-first-run-wizard.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrFirstRunWizardPage() {
  const title = pages["bienvenida"]?.title ?? "Bienvenida";
  return (
    <div className="p-6" data-scaffold={"SCR-first-run-wizard"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-first-run-wizard"}
      </p>
    </div>
  );
}
