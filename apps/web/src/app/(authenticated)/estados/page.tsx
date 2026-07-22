import { createLedgerService, createReportingService } from "@mi-banquito/domain";

import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { generateMemberStatementsAction, shareStatementAction } from "./actions";
import { StatementArchiveView } from "./statement-archive-view";
import { buildStatementArchivePageView } from "./statement-archive-view-model";

export const dynamic = "force-dynamic";

export default async function ScrStatementsArchivePage() {
  const session = await requireTreasurer();
  const reporting = createReportingService();
  const [rows, members, summary] = await Promise.all([
    reporting.listStatementArchive(session.orgId),
    createLedgerService().listMembers(session.orgId),
    reporting.getLatestStatementSummary(session.orgId),
  ]);
  return <div data-screen="SCR-statements-archive"><StatementArchiveView
    generateAction={generateMemberStatementsAction}
    shareAction={shareStatementAction}
    view={buildStatementArchivePageView({ rows, members, summary, historicalMemberLabel: messages.statementArchive.historicalMember })}
  /></div>;
}
