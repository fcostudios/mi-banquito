// SCAFFOLD (SCR-admin-home) — generated page stub. Build the real screen per its spec: docs/screens/SCR-admin-home.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrAdminHomePage() {
  const title = pages["admin"]?.title ?? "Admin Inicio";
  return (
    <div className="p-6" data-scaffold={"SCR-admin-home"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-admin-home"}
      </p>
    </div>
  );
}
