import Link from "next/link";
import { notFound } from "next/navigation";
import { createPlatformService } from "@mi-banquito/domain";
import { ButtonSecondary } from "@mi-banquito/ui";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

const copy = messages.adminOrgs.businessRules;

export default async function ScrAdminBusinessRulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const operator = await requirePlatformOperator();
  const { id } = await params;
  const service = createPlatformService();
  const org = await service.getOrganization(id);

  if (!org) {
    notFound();
  }

  const [current, rows] = await Promise.all([
    service.getCurrentGroupConfig(org.id),
    service.listBusinessRuleRows(org.id),
  ]);
  await service.recordBusinessRulesView(org.id, operator.actorId);

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6"
      data-screen="SCR-admin-business-rules"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
          <p className="mt-2 text-text-secondary">{copy.description}</p>
          <p className="mt-2 text-sm text-text-secondary">
            {copy.organization}: {org.displayName}
            {current ? ` · ${copy.currentVersion}: ${current.version}` : ""}
          </p>
        </div>
        <Link href={`/admin/orgs/${org.id}/business-rules/export`}>
          <ButtonSecondary labelKey={copy.exportCsv} />
        </Link>
      </header>

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-surface-muted text-text-secondary">
            <tr>
              <th scope="col" className="border-b border-border px-4 py-3 font-medium">
                {copy.rule}
              </th>
              <th scope="col" className="border-b border-border px-4 py-3 font-medium">
                {copy.value}
              </th>
              <th scope="col" className="border-b border-border px-4 py-3 font-medium">
                {copy.priorValue}
              </th>
              <th scope="col" className="border-b border-border px-4 py-3 font-medium">
                {copy.newValue}
              </th>
              <th scope="col" className="border-b border-border px-4 py-3 font-medium">
                {copy.validFrom}
              </th>
              <th scope="col" className="border-b border-border px-4 py-3 font-medium">
                {copy.validTo}
              </th>
              <th scope="col" className="border-b border-border px-4 py-3 font-medium">
                {copy.lastChangedAt}
              </th>
              <th scope="col" className="border-b border-border px-4 py-3 font-medium">
                {copy.lastChangedBy}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((row) => (
              <tr key={`${row.rule}-${row.validFrom}-${row.lastChangedAt}`} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-4 py-3 font-medium text-text-primary">
                  {row.rule}
                </th>
                <td className="px-4 py-3 text-text-secondary">{row.currentValue}</td>
                <td className="px-4 py-3 text-text-secondary">{row.priorValue || "—"}</td>
                <td className="px-4 py-3 text-text-secondary">{row.newValue}</td>
                <td className="px-4 py-3 text-text-secondary">{row.validFrom}</td>
                <td className="px-4 py-3 text-text-secondary">{row.validTo || "vigente"}</td>
                <td className="px-4 py-3 text-text-secondary">{row.lastChangedAt}</td>
                <td className="px-4 py-3 text-text-secondary">
                  {row.lastChangedBy} ({row.lastChangedByKind})
                </td>
              </tr>
            )) : (
              <tr>
                <td className="px-4 py-6 text-text-secondary" colSpan={8}>
                  {copy.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
