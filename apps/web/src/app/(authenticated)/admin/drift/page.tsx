// SCAFFOLD (SCR-admin-drift) — generated page stub. Build the real screen per its spec: docs/screens/SCR-admin-drift.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrAdminDriftPage() {
  const title = pages["admin/drift"]?.title ?? "Estado del substrato";
  return (
    <div className="p-6" data-scaffold={"SCR-admin-drift"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-admin-drift"}
      </p>
    </div>
  );
}
