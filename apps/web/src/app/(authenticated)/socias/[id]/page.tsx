import { notFound } from "next/navigation";
import { createLedgerService, createMemberStatementService, createMovementService, createReportingService, memberStatementPreviewFromArchivedPayload } from "@mi-banquito/domain";

import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { generateMemberStatementsAction } from "../../estados/actions";
import { transitionMemberStatusAction } from "./actions";
import { MemberDetailView } from "./member-detail-view";

export const dynamic = "force-dynamic";

export default async function ScrMemberDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ estado?: string }>;
}) {
  const session = await requireTreasurer();
  const { id } = await params;
  const { estado } = await (searchParams ?? Promise.resolve({} as { estado?: string }));
  const ledger = createLedgerService();
  const [row, balanceRow, archivedStatements, deposits] = await Promise.all([
    ledger.getMember(session.orgId, id), ledger.getMemberBalance(session.orgId, id),
    createReportingService().listStatementArchive(session.orgId), createMovementService().listMemberDeposits(session.orgId, id),
  ]);
  if (!row) notFound();
  const latestPeriodClose = archivedStatements.find((statement) => statement.kind === "monthly_close" && statement.periodCloseId && statement.artifactStatus === "ready");
  const latestMemberStatement = archivedStatements.find((statement) =>
    statement.kind === "monthly_member" && statement.memberId === row.id
    && statement.periodLabel === latestPeriodClose?.periodLabel && statement.pdfUri);
  const archivedPreview = latestMemberStatement
    ? memberStatementPreviewFromArchivedPayload({
        canonicalPayload: latestMemberStatement.canonicalPayload,
        canonicalPayloadHash: latestMemberStatement.canonicalPayloadHash,
        expectedMemberId: row.id,
        expectedPeriodLabel: latestMemberStatement.periodLabel,
      })
    : null;
  const preview = archivedPreview ?? (!latestMemberStatement && latestPeriodClose?.periodCloseId && row.status === "activo"
    ? await createMemberStatementService().preview({
        orgId: session.orgId, periodCloseId: latestPeriodClose.periodCloseId,
        memberId: row.id, statementCopy: messages.statementPdf.monthlyMember,
      })
    : null);

  return <div data-screen="SCR-member-detail"><MemberDetailView
    generateAction={generateMemberStatementsAction}
    transitionAction={transitionMemberStatusAction}
    view={{
      member: { id: row.id, displayName: row.displayName, status: row.status, role: row.role, initialSavingsBalance: row.initialSavingsBalance },
      currentBalance: balanceRow?.currentBalance ?? row.initialSavingsBalance,
      balanceShareUrl: balanceRow?.balanceShareUrl ?? null,
      deposits,
      periodCloseId: latestPeriodClose?.periodCloseId ?? null,
      preview,
      archiveUri: latestMemberStatement?.pdfUri ?? null,
      archiveHash: latestMemberStatement?.canonicalPayloadHash ?? null,
      archiveGeneratedAt: latestMemberStatement?.generatedAt.toISOString() ?? null,
      generated: estado === "generado" && Boolean(latestMemberStatement),
    }}
  /></div>;
}
