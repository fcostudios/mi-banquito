import type { StatementArchivePageView } from "./statement-archive-view";
import type { StatementArchiveSummary } from "@mi-banquito/domain";

type ArchiveRow = {
  id: string;
  kind: string;
  memberId: string | null;
  periodLabel: string;
  periodCloseId: string | null;
  pdfUri: string;
  generatedAt: Date;
  canonicalPayloadHash: string;
  artifactStatus: "pending" | "ready" | "failed";
};

type MemberRow = { id: string; displayName: string; status: string };

export function buildStatementArchivePageView(input: {
  rows: ArchiveRow[];
  members: MemberRow[];
  historicalMemberLabel: string;
  summary?: StatementArchiveSummary | null;
}): StatementArchivePageView {
  const latestPeriodClose = input.rows.find((row) =>
    row.kind === "monthly_close" && row.periodCloseId && row.artifactStatus === "ready");
  const activeMembers = input.members.filter((row) => row.status === "activo");
  const activeIds = new Set(activeMembers.map((row) => row.id));
  const memberById = new Map(input.members.map((row) => [row.id, row]));
  const memberRows = input.rows.filter((row) => row.kind === "monthly_member" && row.memberId);

  return {
    summary: input.summary ?? null,
    latestReadyPeriodClose: latestPeriodClose?.periodCloseId
      ? { id: latestPeriodClose.periodCloseId, periodLabel: latestPeriodClose.periodLabel }
      : null,
    activeMemberCount: activeMembers.length,
    latestActiveArchiveCount: memberRows.filter((row) =>
      activeIds.has(row.memberId!) && row.periodLabel === latestPeriodClose?.periodLabel).length,
    memberArchives: memberRows.map((row) => ({
      id: row.id,
      memberId: row.memberId!,
      memberName: memberById.get(row.memberId!)?.displayName ?? input.historicalMemberLabel,
      periodLabel: row.periodLabel,
      pdfUri: row.pdfUri,
    })),
    archiveRows: input.rows.filter((row) => row.kind !== "monthly_member").map((row) => ({
      id: row.id, kind: row.kind, periodLabel: row.periodLabel, generatedAt: row.generatedAt.toISOString(),
      canonicalPayloadHash: row.canonicalPayloadHash, pdfUri: row.pdfUri, artifactStatus: row.artifactStatus,
    })),
  };
}
