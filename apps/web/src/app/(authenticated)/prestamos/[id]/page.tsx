// SCAFFOLD (SCR-loan-detail) — generated page stub. Build the real screen per its spec: docs/screens/SCR-loan-detail.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrLoanDetailPage() {
  const title = pages["prestamos/[id]"]?.title ?? "Detalle del préstamo";
  return (
    <div className="p-6" data-scaffold={"SCR-loan-detail"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-loan-detail"}
      </p>
    </div>
  );
}
