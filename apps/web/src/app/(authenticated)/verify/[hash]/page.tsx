// SCAFFOLD (SCR-public-verify-pdf) — generated page stub. Build the real screen per its spec: docs/screens/SCR-public-verify-pdf.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrPublicVerifyPdfPage() {
  const title = pages["verify/[hash]"]?.title ?? "Verificar documento";
  return (
    <div className="p-6" data-scaffold={"SCR-public-verify-pdf"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-public-verify-pdf"}
      </p>
    </div>
  );
}
