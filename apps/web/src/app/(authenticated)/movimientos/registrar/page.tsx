import { randomUUID } from "node:crypto";

import {
  createMovementService,
  createPlatformService,
  createTreasurerCompensationService,
} from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import {
  recordExpenseAction,
  recordTransferAction,
  recordTreasurerCompensationAction,
  regularizePendingDepositAction,
} from "./actions";
import { ecuadorTodayISO, MovementForms } from "./movement-forms";
import {
  mergePendingRows,
  parsePendingCursor,
  parsePendingSelection,
  type SearchValue,
} from "./pending-pagination";

export const dynamic = "force-dynamic";

export default async function ScrRecordMovementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const session = await requireTreasurer();
  const search = await searchParams;
  const cursor = parsePendingCursor(search);
  const selectedKey = parsePendingSelection(search);
  const requestedFiscalYear = typeof search.fiscalYear === "string" ? Number(search.fiscalYear) : Number.NaN;
  let fiscalYear: number;
  if (Number.isInteger(requestedFiscalYear) && requestedFiscalYear >= 2000 && requestedFiscalYear <= 2200) {
    fiscalYear = requestedFiscalYear;
  } else {
    const currentConfig = await createPlatformService().getCurrentGroupConfig(session.orgId);
    if (!currentConfig) throw new Error("movement_group_config_required");
    const [year, month, day] = ecuadorTodayISO().split("-").map(Number) as [number, number, number];
    fiscalYear = month > currentConfig.fiscalYearStartMonth
      || (month === currentConfig.fiscalYearStartMonth && day >= currentConfig.fiscalYearStartDay)
      ? year
      : year - 1;
  }
  const movements = createMovementService();
  const [accounts, pendingPage, selectedPending, compensation] = await Promise.all([
    movements.listActiveGroupAccountBalances(session.orgId),
    movements.listPendingDepositsPage(session.orgId, { cursor, limit: 50 }),
    selectedKey ? movements.getPendingDeposit(session.orgId, selectedKey) : Promise.resolve(null),
    createTreasurerCompensationService().getBreakdown({ orgId: session.orgId, fiscalYear }),
  ]);
  const pendingDeposits = mergePendingRows(pendingPage.rows, selectedPending);

  return (
    <MovementForms
      accounts={accounts.map(({ id, name, last4, balance }) => ({ id, name, last4, balance }))}
      search={search}
      expenseAction={recordExpenseAction}
      transferAction={recordTransferAction}
      regularizationAction={regularizePendingDepositAction}
      compensationAction={recordTreasurerCompensationAction}
      compensation={compensation}
      fiscalYear={fiscalYear}
      pendingDeposits={pendingDeposits.map((row) => ({
        id: row.id,
        sourceKind: row.sourceKind,
        memberName: row.memberName,
        accountId: row.accountId,
        accountName: row.accountName,
        amount: row.amount,
        remaining: row.remaining,
        datedOn: row.datedOn,
      }))}
      nextCursor={pendingPage.nextCursor}
      expenseClientRequestId={randomUUID()}
      transferClientRequestId={randomUUID()}
      regularizationClientRequestId={randomUUID()}
      compensationClientRequestId={randomUUID()}
      today={ecuadorTodayISO()}
    />
  );
}
