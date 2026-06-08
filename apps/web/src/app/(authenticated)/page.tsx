// SCAFFOLD (SCR-treasurer-home) — generated page stub. Build the real screen per its spec: docs/screens/SCR-treasurer-home.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrTreasurerHomePage() {
  const title = pages["home"]?.title ?? "Inicio";
  return (
    <div className="p-6" data-scaffold={"SCR-treasurer-home"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-treasurer-home"}
      </p>
    </div>
  );
}
