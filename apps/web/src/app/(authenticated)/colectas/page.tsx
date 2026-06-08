// SCAFFOLD (SCR-solidarity-collection) — generated page stub. Build the real screen per its spec: docs/screens/SCR-solidarity-collection.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrSolidarityCollectionPage() {
  const title = pages["colectas"]?.title ?? "Colecta solidaria";
  return (
    <div className="p-6" data-scaffold={"SCR-solidarity-collection"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-solidarity-collection"}
      </p>
    </div>
  );
}
