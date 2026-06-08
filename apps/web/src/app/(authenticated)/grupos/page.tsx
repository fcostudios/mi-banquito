// SCAFFOLD (SCR-group-picker) — generated page stub. Build the real screen per its spec: docs/screens/SCR-group-picker.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrGroupPickerPage() {
  const title = pages["grupos"]?.title ?? "Mis grupos";
  return (
    <div className="p-6" data-scaffold={"SCR-group-picker"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-group-picker"}
      </p>
    </div>
  );
}
