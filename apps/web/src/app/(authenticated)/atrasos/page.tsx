// SCAFFOLD (SCR-ar-aging) — generated page stub. Build the real screen per its spec: docs/screens/SCR-ar-aging.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrArAgingPage() {
  const title = pages["atrasos"]?.title ?? "Atrasos";
  return (
    <div className="p-6" data-scaffold={"SCR-ar-aging"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-ar-aging"}
      </p>
    </div>
  );
}
