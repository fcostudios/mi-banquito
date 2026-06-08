// SCAFFOLD (SCR-record-repayment) — generated page stub. Build the real screen per its spec: docs/screens/SCR-record-repayment.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrRecordRepaymentPage() {
  const title = pages["prestamos/[id]/pago"]?.title ?? "Registrar pago";
  return (
    <div className="p-6" data-scaffold={"SCR-record-repayment"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-record-repayment"}
      </p>
    </div>
  );
}
