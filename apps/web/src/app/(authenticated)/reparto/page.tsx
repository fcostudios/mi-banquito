// SCAFFOLD (SCR-year-end-share-out) — generated page stub. Build the real screen per its spec: docs/screens/SCR-year-end-share-out.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrYearEndShareOutPage() {
  const title = pages["reparto"]?.title ?? "Reparto fin de año";
  return (
    <div className="p-6" data-scaffold={"SCR-year-end-share-out"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-year-end-share-out"}
      </p>
    </div>
  );
}
