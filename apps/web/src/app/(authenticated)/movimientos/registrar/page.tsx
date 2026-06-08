// SCAFFOLD (SCR-record-movement) — generated page stub. Build the real screen per its spec: docs/screens/SCR-record-movement.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrRecordMovementPage() {
  const title = pages["movimientos/registrar"]?.title ?? "Registrar movimiento";
  return (
    <div className="p-6" data-scaffold={"SCR-record-movement"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-record-movement"}
      </p>
    </div>
  );
}
