// SCAFFOLD (SCR-cash-flow-projection) — generated page stub. Build the real screen per its spec: docs/screens/SCR-cash-flow-projection.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrCashFlowProjectionPage() {
  const title = pages["liquidez"]?.title ?? "Liquidez proyectada";
  return (
    <div className="p-6" data-scaffold={"SCR-cash-flow-projection"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-cash-flow-projection"}
      </p>
    </div>
  );
}
