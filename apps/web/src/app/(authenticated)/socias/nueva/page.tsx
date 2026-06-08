// SCAFFOLD (SCR-add-member) — generated page stub. Build the real screen per its spec: docs/screens/SCR-add-member.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrAddMemberPage() {
  const title = pages["socias/nueva"]?.title ?? "Agregar socia";
  return (
    <div className="p-6" data-scaffold={"SCR-add-member"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-add-member"}
      </p>
    </div>
  );
}
