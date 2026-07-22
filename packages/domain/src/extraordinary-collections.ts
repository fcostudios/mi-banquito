import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  account,
  auditLogEntry,
  expense,
  extraordinaryCollection,
  extraordinaryCollectionLine,
  member,
  transfer,
} from "@mi-banquito/db/schema";
import {
  lockTenantMoneyWrites,
  withTenantTransaction,
  withWritableTenantTransaction,
} from "@mi-banquito/db/tenant";

import { formatMoney4Units, parseMoney4Units, parseNonNegativeMoney4 } from "./money4";

export type CollectionKind = "solidarity" | "treasurer_recognition";
export type CollectionStatus = "open" | "collecting" | "paid_out" | "closed" | "cancelled";
export type CollectionDisposition = "returned" | "retained";

export type CollectionProgress = {
  contributors: number;
  activeMembers: number;
  collected: string;
  regularized: string;
  pending: string;
};

export type CollectionProgressLine = {
  id: string;
  memberId: string;
  amount: string;
  reconciliationStatus: "pending" | "regularized";
  reversesId: string | null;
};

export type CollectionView = typeof extraordinaryCollection.$inferSelect & {
  beneficiaryName: string;
  activeMemberCount: number;
  progress: CollectionProgress;
  lines: Array<typeof extraordinaryCollectionLine.$inferSelect & {
    memberName: string;
    accountName: string;
  }>;
};

export type OpenCollectionInput = {
  orgId: string; actorId: string; kind: CollectionKind; purpose: string;
  beneficiaryMemberId: string; targetAmount: string | null;
  recognitionFiscalYear: number | null; openedOn: string; clientRequestId: string;
};
export type AddCollectionLineInput = {
  orgId: string; actorId: string; collectionId: string; memberId: string;
  accountId: string; amount: string; datedOn: string; clientRequestId: string;
};
export type ReverseCollectionLineInput = {
  orgId: string; actorId: string; lineId: string; reason: string; clientRequestId: string;
};
export type SurplusDispositionInput = {
  disposition: CollectionDisposition | null;
  dispositionMotive: string | null;
  returnAccountId: string | null;
};
export type CancelCollectionInput = SurplusDispositionInput & {
  orgId: string; actorId: string; collectionId: string; datedOn: string; clientRequestId: string;
};
export type CloseRecognitionCollectionInput = {
  orgId: string; actorId: string; collectionId: string;
  dispositionMotive: string; clientRequestId: string;
};
export type PayoutCollectionInput = SurplusDispositionInput & {
  orgId: string; actorId: string; collectionId: string; sourceAccountId: string;
  payoutAmount: string; datedOn: string; clientRequestId: string;
};
export type ReversePayoutInput = {
  orgId: string; actorId: string; collectionId: string;
  reason: string; datedOn: string; clientRequestId: string;
};

export type CollectionListCursor = { openedOn: string; id: string };
export type CollectionListInput = {
  orgId: string;
  cursor?: CollectionListCursor | null;
  /** Defaults to 50 and is capped at 100. */
  limit?: number;
};

export interface ExtraordinaryCollectionService {
  /** Use the final row's openedOn/id as the cursor for the next page. */
  list(input: CollectionListInput): Promise<CollectionView[]>;
  get(input: { orgId: string; collectionId: string }): Promise<CollectionView | null>;
  open(input: OpenCollectionInput): Promise<typeof extraordinaryCollection.$inferSelect>;
  addLine(input: AddCollectionLineInput): Promise<typeof extraordinaryCollectionLine.$inferSelect>;
  reverseLine(input: ReverseCollectionLineInput): Promise<typeof extraordinaryCollectionLine.$inferSelect>;
  cancel(input: CancelCollectionInput): Promise<typeof extraordinaryCollection.$inferSelect>;
  closeRecognition(input: CloseRecognitionCollectionInput): Promise<typeof extraordinaryCollection.$inferSelect>;
  payout(input: PayoutCollectionInput): Promise<typeof extraordinaryCollection.$inferSelect>;
  reversePayout(input: ReversePayoutInput): Promise<typeof expense.$inferSelect>;
}

export function collectionProgress(input: {
  activeMemberCount: number;
  lines: CollectionProgressLine[];
}): CollectionProgress {
  if (!Number.isSafeInteger(input.activeMemberCount) || input.activeMemberCount < 0) {
    throw new Error("collection_active_member_count_invalid");
  }

  let regularizedUnits = BigInt(0);
  let pendingUnits = BigInt(0);
  const memberTotals = new Map<string, bigint>();

  for (const line of input.lines) {
    if (line.amount !== line.amount.trim()) throw new Error("money4_invalid");
    const units = parseMoney4Units(line.amount);
    if (units < BigInt(0)) throw new Error("collection_amount_non_negative_required");
    const signedUnits = line.reversesId === null ? units : -units;
    if (line.reconciliationStatus === "regularized") {
      regularizedUnits += signedUnits;
    } else if (line.reconciliationStatus === "pending") {
      pendingUnits += signedUnits;
    } else {
      throw new Error("collection_reconciliation_status_invalid");
    }
    memberTotals.set(line.memberId, (memberTotals.get(line.memberId) ?? BigInt(0)) + signedUnits);
  }

  const collectedUnits = regularizedUnits + pendingUnits;
  return {
    contributors: [...memberTotals.values()].filter((units) => units > BigInt(0)).length,
    activeMembers: input.activeMemberCount,
    collected: formatMoney4Units(collectedUnits),
    regularized: formatMoney4Units(regularizedUnits),
    pending: formatMoney4Units(pendingUnits),
  };
}

export function collectionSettlement(input: { regularized: string; payout: string }): {
  ceiling: string;
  payout: string;
  surplus: string;
} {
  const regularizedUnits = parseMoney4Units(input.regularized);
  const payoutUnits = parseMoney4Units(input.payout);
  if (regularizedUnits < BigInt(0)) throw new Error("collection_regularized_total_invalid");
  if (payoutUnits <= BigInt(0)) throw new Error("collection_payout_amount_positive_required");
  if (payoutUnits > regularizedUnits) throw new Error("collection_payout_exceeds_ceiling");
  return {
    ceiling: formatMoney4Units(regularizedUnits),
    payout: formatMoney4Units(payoutUnits),
    surplus: formatMoney4Units(regularizedUnits - payoutUnits),
  };
}

function assertDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("collection_date_invalid");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("collection_date_invalid");
  }
  return value;
}

function assertTerminalChronology(
  datedOn: string,
  openedOn: string,
  lines: ReadonlyArray<{ datedOn: string }>,
): void {
  if (datedOn < openedOn) throw new Error("collection_terminal_date_before_opened");
  if (lines.some((line) => datedOn < String(line.datedOn))) {
    throw new Error("collection_terminal_date_before_line");
  }
}

function assertCollectionListCursor(cursor: CollectionListCursor): void {
  try {
    assertDateOnly(cursor.openedOn);
  } catch {
    throw new Error("collection_list_cursor_invalid");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cursor.id)) {
    throw new Error("collection_list_cursor_invalid");
  }
}

function assertPurpose(value: string): string {
  const purpose = value.trim();
  if (purpose.length < 3 || purpose.length > 500) throw new Error("collection_purpose_invalid");
  return purpose;
}

function assertCollectionKind(value: string): asserts value is CollectionKind {
  if (value !== "solidarity" && value !== "treasurer_recognition") {
    throw new Error("collection_kind_invalid");
  }
}

function assertRecognitionYear(kind: CollectionKind, year: number | null): void {
  if (kind === "treasurer_recognition") {
    if (year === null) throw new Error("collection_recognition_year_required");
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      throw new Error("collection_recognition_year_invalid");
    }
    return;
  }
  if (year !== null) throw new Error("collection_recognition_year_forbidden");
}

function parsePositiveCollectionMoney(value: string): string {
  if (value !== value.trim()) throw new Error("money4_invalid");
  const units = parseMoney4Units(value);
  if (units <= BigInt(0)) throw new Error("collection_payout_amount_positive_required");
  return formatMoney4Units(units);
}

function assertDisposition(input: SurplusDispositionInput, surplusUnits: bigint): {
  disposition: CollectionDisposition | null;
  dispositionMotive: string | null;
} {
  if (surplusUnits === BigInt(0)) {
    if (input.disposition !== null || input.dispositionMotive !== null || input.returnAccountId !== null) {
      throw new Error("collection_disposition_invalid");
    }
    return { disposition: null, dispositionMotive: null };
  }
  if (surplusUnits < BigInt(0)) throw new Error("collection_surplus_negative");
  if (input.disposition === "returned") {
    if (input.returnAccountId === null || input.dispositionMotive !== null) {
      throw new Error("collection_disposition_invalid");
    }
    return { disposition: "returned", dispositionMotive: null };
  }
  if (input.disposition === "retained") {
    const motive = input.dispositionMotive?.trim() ?? "";
    if (motive.length < 3 || input.returnAccountId !== null) {
      throw new Error("collection_disposition_invalid");
    }
    return { disposition: "retained", dispositionMotive: motive };
  }
  throw new Error("collection_disposition_invalid");
}

type CollectionTransaction = Parameters<Parameters<typeof withWritableTenantTransaction>[1]>[0];
type LiveRegularizedLine = { id: string; accountId: string; amount: string };

async function collectionHoldingProjection(
  tx: CollectionTransaction,
  orgId: string,
  liveLines: LiveRegularizedLine[],
): Promise<{ holdingUnits: Map<string, bigint>; sourceAccountIds: Set<string> }> {
  const lineAccountIds = [...new Set(liveLines.map((line) => line.accountId))];
  const lineAccounts = lineAccountIds.length === 0 ? [] : await tx.select({
    id: account.id,
    isGroupFund: account.isGroupFund,
    status: account.status,
  }).from(account).where(and(
    eq(account.orgId, orgId),
    inArray(account.id, lineAccountIds),
  )).for("update");
  const lineAccountById = new Map(lineAccounts.map((row) => [row.id, row]));
  const externalLineIds = liveLines.filter((line) => (
    lineAccountById.get(line.accountId)?.isGroupFund === false
  )).map((line) => line.id);
  const liveRegularizations = externalLineIds.length === 0 ? [] : await tx.select({
    lineId: transfer.regularizesId,
    targetAccountId: transfer.toAccountId,
    amount: transfer.amount,
  }).from(transfer).where(and(
    eq(transfer.orgId, orgId),
    eq(transfer.purpose, "regularization"),
    eq(transfer.regularizesKind, "extraordinary_collection"),
    inArray(transfer.regularizesId, externalLineIds),
    isNull(transfer.reversesId),
    sql`${transfer.amount} > 0 AND ${transfer.amount} <> 'NaN'::numeric`,
    sql`NOT EXISTS (
      SELECT 1 FROM transfer reversal
      WHERE reversal.org_id = ${transfer.orgId} AND reversal.reverses_id = ${transfer.id}
    )`,
  )).for("update");
  const targetAccountIds = [...new Set(liveRegularizations.map((row) => row.targetAccountId))];
  const targetAccounts = targetAccountIds.length === 0 ? [] : await tx.select({
    id: account.id,
    isGroupFund: account.isGroupFund,
    status: account.status,
  }).from(account).where(and(
    eq(account.orgId, orgId),
    inArray(account.id, targetAccountIds),
  )).for("update");
  const activeGroupIds = new Set(targetAccounts.filter((row) => (
    row.status === "active" && row.isGroupFund
  )).map((row) => row.id));
  const holdingUnits = new Map<string, bigint>();
  const sourceAccountIds = new Set<string>();
  for (const line of liveLines) {
    const lineAccount = lineAccountById.get(line.accountId);
    if (!lineAccount) continue;
    if (lineAccount.isGroupFund) {
      sourceAccountIds.add(lineAccount.id);
      if (lineAccount.status === "active") {
        holdingUnits.set(lineAccount.id, (holdingUnits.get(lineAccount.id) ?? BigInt(0)) + parseMoney4Units(line.amount));
      }
    }
  }
  for (const regularization of liveRegularizations) {
    sourceAccountIds.add(regularization.targetAccountId);
    if (activeGroupIds.has(regularization.targetAccountId)) {
      holdingUnits.set(
        regularization.targetAccountId,
        (holdingUnits.get(regularization.targetAccountId) ?? BigInt(0)) + parseMoney4Units(String(regularization.amount)),
      );
    }
  }
  return { holdingUnits, sourceAccountIds };
}

type CollectionCommandSnapshot = Record<string, string | null> & {
  command: string;
  clientRequestId: string;
  collectionId: string;
};

async function replaySubjectForAudit(
  tx: CollectionTransaction,
  input: {
    orgId: string;
    actionKind: "collection.opened" | "collection.line.added" | "collection.line.reversed";
    clientRequestId: string;
    expectedPayload: Record<string, unknown>;
    expectedReason?: string | null;
  },
): Promise<string | null> {
  const rows = await tx.select({
    actionKind: auditLogEntry.actionKind,
    subjectId: auditLogEntry.subjectId,
    payload: auditLogEntry.payloadSnapshot,
    reason: auditLogEntry.reason,
  }).from(auditLogEntry).where(and(
    eq(auditLogEntry.orgId, input.orgId),
    sql`${auditLogEntry.payloadSnapshot}->>'clientRequestId' = ${input.clientRequestId}`,
  ));
  if (rows.length === 0) return null;
  const anchors = rows.filter((row) => row.actionKind === input.actionKind);
  if (anchors.length !== 1) throw new Error("collection_idempotency_conflict");
  const anchor = anchors[0];
  const payload = anchor.payload as Record<string, unknown> | null;
  if (
    !payload
    || !Object.entries(input.expectedPayload).every(([key, value]) => payload[key] === value)
    || (input.expectedReason !== undefined && anchor.reason !== input.expectedReason)
  ) {
    throw new Error("collection_idempotency_conflict");
  }
  return anchor.subjectId;
}

async function isEquivalentCompletedCommand(
  tx: CollectionTransaction,
  orgId: string,
  expected: CollectionCommandSnapshot,
): Promise<boolean> {
  const rows = await tx.select({
    subjectId: auditLogEntry.subjectId,
    payload: auditLogEntry.payloadSnapshot,
  }).from(auditLogEntry).where(and(
    eq(auditLogEntry.orgId, orgId),
    eq(auditLogEntry.actionKind, "collection.command.completed"),
  ));
  const replay = rows.find((row) => (
    (row.payload as { clientRequestId?: unknown } | null)?.clientRequestId === expected.clientRequestId
  ));
  if (!replay) return false;
  const actual = replay.payload as Record<string, unknown> | null;
  if (
    replay.subjectId !== expected.collectionId
    || actual === null
    || Object.keys(actual).length !== Object.keys(expected).length
    || !Object.entries(expected).every(([key, value]) => actual[key] === value)
  ) {
    throw new Error("collection_idempotency_conflict");
  }
  return true;
}

async function insertCompletedCommandAudit(
  tx: CollectionTransaction,
  input: { orgId: string; actorId: string; at: Date; snapshot: CollectionCommandSnapshot },
): Promise<void> {
  await tx.insert(auditLogEntry).values({
    orgId: input.orgId,
    actorKind: "member",
    actorId: input.actorId,
    actionKind: "collection.command.completed",
    subjectKind: "extraordinary_collection",
    subjectId: input.snapshot.collectionId,
    payloadSnapshot: input.snapshot,
    reason: null,
    at: input.at,
    createdAt: input.at,
  });
}

export function createExtraordinaryCollectionService(
  options: { now?: () => Date } = {},
): ExtraordinaryCollectionService {
  const now = options.now ?? (() => new Date());
  const beneficiary = alias(member, "collection_beneficiary");
  const lineMember = alias(member, "collection_line_member");

  const readViews = async (input: {
    orgId: string;
    collectionId?: string;
    cursor?: CollectionListCursor | null;
    limit?: number;
  }): Promise<CollectionView[]> => (
    withTenantTransaction(input.orgId, async (tx) => {
      const limit = input.collectionId ? 1 : (input.limit ?? 50);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("collection_list_limit_invalid");
      }
      if (input.cursor) assertCollectionListCursor(input.cursor);
      const cursorPredicate = input.cursor && !input.collectionId ? or(
        lt(extraordinaryCollection.openedOn, input.cursor.openedOn),
        and(
          eq(extraordinaryCollection.openedOn, input.cursor.openedOn),
          lt(extraordinaryCollection.id, input.cursor.id),
        ),
      ) : undefined;
      const selectedHeaders = tx.select().from(extraordinaryCollection).where(and(
          eq(extraordinaryCollection.orgId, input.orgId),
          input.collectionId ? eq(extraordinaryCollection.id, input.collectionId) : undefined,
          cursorPredicate,
        )).orderBy(desc(extraordinaryCollection.openedOn), desc(extraordinaryCollection.id))
        .limit(limit)
        .as("selected_collection");
      const rows = await tx.select({
        header: {
          id: selectedHeaders.id,
          orgId: selectedHeaders.orgId,
          kind: selectedHeaders.kind,
          purpose: selectedHeaders.purpose,
          beneficiaryMemberId: selectedHeaders.beneficiaryMemberId,
          targetAmount: selectedHeaders.targetAmount,
          status: selectedHeaders.status,
          openedOn: selectedHeaders.openedOn,
          paidOutExpenseId: selectedHeaders.paidOutExpenseId,
          surplusAmount: selectedHeaders.surplusAmount,
          disposition: selectedHeaders.disposition,
          dispositionMotive: selectedHeaders.dispositionMotive,
          surplusTransferId: selectedHeaders.surplusTransferId,
          recognitionFiscalYear: selectedHeaders.recognitionFiscalYear,
          createdAt: selectedHeaders.createdAt,
          createdBy: selectedHeaders.createdBy,
        },
        beneficiaryName: beneficiary.displayName,
        line: extraordinaryCollectionLine,
        memberName: lineMember.displayName,
        accountName: account.name,
        activeMemberCount: sql<number>`(
          SELECT count(*)::int FROM member active_member
          WHERE active_member.org_id = ${input.orgId} AND active_member.status = 'activo'
        )`,
      }).from(selectedHeaders)
        .innerJoin(beneficiary, and(
          eq(beneficiary.orgId, selectedHeaders.orgId),
          eq(beneficiary.id, selectedHeaders.beneficiaryMemberId),
        ))
        .leftJoin(extraordinaryCollectionLine, and(
          eq(extraordinaryCollectionLine.orgId, selectedHeaders.orgId),
          eq(extraordinaryCollectionLine.collectionId, selectedHeaders.id),
        ))
        .leftJoin(lineMember, and(
          eq(lineMember.orgId, extraordinaryCollectionLine.orgId),
          eq(lineMember.id, extraordinaryCollectionLine.memberId),
        ))
        .leftJoin(account, and(
          eq(account.orgId, extraordinaryCollectionLine.orgId),
          eq(account.id, extraordinaryCollectionLine.accountId),
        ))
        .orderBy(
          desc(selectedHeaders.openedOn),
          desc(selectedHeaders.id),
          asc(extraordinaryCollectionLine.datedOn),
          asc(sql`${extraordinaryCollectionLine.reversesId} IS NOT NULL`),
          asc(extraordinaryCollectionLine.createdAt),
          asc(extraordinaryCollectionLine.id),
        );
      const views = new Map<string, CollectionView>();
      for (const row of rows) {
        let view = views.get(row.header.id);
        if (!view) {
          const activeMemberCount = Number(row.activeMemberCount);
          const createdView: CollectionView = {
            ...row.header,
            beneficiaryName: row.beneficiaryName,
            activeMemberCount,
            progress: collectionProgress({ activeMemberCount, lines: [] }),
            lines: [],
          };
          views.set(row.header.id, createdView);
          view = createdView;
        }
        if (row.line) {
          if (row.memberName === null || row.accountName === null) {
            throw new Error("collection_read_integrity_invalid");
          }
          view.lines.push({ ...row.line, memberName: row.memberName, accountName: row.accountName });
        }
      }
      for (const view of views.values()) {
        view.progress = collectionProgress({ activeMemberCount: view.activeMemberCount, lines: view.lines });
      }
      return [...views.values()];
    })
  );

  return {
    async list(input) {
      return readViews(input);
    },

    async get(input) {
      const [view] = await readViews(input);
      return view ?? null;
    },

    async open(input) {
      assertCollectionKind(input.kind);
      assertRecognitionYear(input.kind, input.recognitionFiscalYear);
      const purpose = assertPurpose(input.purpose);
      const targetAmount = input.targetAmount === null ? null : parseNonNegativeMoney4(input.targetAmount);
      const openedOn = assertDateOnly(input.openedOn);

      return withWritableTenantTransaction(input.orgId, async (tx) => {
        await lockTenantMoneyWrites(tx, input.orgId);
        const openPayload = {
          kind: input.kind,
          purpose,
          beneficiaryMemberId: input.beneficiaryMemberId,
          targetAmount,
          recognitionFiscalYear: input.recognitionFiscalYear,
          openedOn,
          actorId: input.actorId,
          clientRequestId: input.clientRequestId,
        };
        const replayId = await replaySubjectForAudit(tx, {
          orgId: input.orgId,
          actionKind: "collection.opened",
          clientRequestId: input.clientRequestId,
          expectedPayload: openPayload,
        });
        if (replayId) {
          const [replay] = await tx.select().from(extraordinaryCollection).where(and(
            eq(extraordinaryCollection.orgId, input.orgId),
            eq(extraordinaryCollection.id, replayId),
          )).limit(1);
          if (!replay) throw new Error("collection_replay_outcome_missing");
          return replay;
        }
        const [beneficiary] = await tx.select({ id: member.id }).from(member).where(and(
          eq(member.orgId, input.orgId),
          eq(member.id, input.beneficiaryMemberId),
          eq(member.status, "activo"),
        )).limit(1);
        if (!beneficiary) throw new Error("collection_beneficiary_unavailable");

        const timestamp = now();
        const [saved] = await tx.insert(extraordinaryCollection).values({
          orgId: input.orgId,
          kind: input.kind,
          purpose,
          beneficiaryMemberId: beneficiary.id,
          targetAmount,
          status: "open",
          openedOn,
          paidOutExpenseId: null,
          surplusAmount: null,
          disposition: null,
          dispositionMotive: null,
          surplusTransferId: null,
          recognitionFiscalYear: input.recognitionFiscalYear,
          createdAt: timestamp,
          createdBy: input.actorId,
        }).returning();
        if (!saved) throw new Error("collection_not_saved");

        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "collection.opened",
          subjectKind: "extraordinary_collection",
          subjectId: saved.id,
          payloadSnapshot: openPayload,
          reason: null,
          at: timestamp,
          createdAt: timestamp,
        });
        return saved;
      });
    },

    async addLine(input) {
      const amount = parseNonNegativeMoney4(input.amount);
      const datedOn = assertDateOnly(input.datedOn);

      return withWritableTenantTransaction(input.orgId, async (tx) => {
        await lockTenantMoneyWrites(tx, input.orgId);
        const addPayload = {
          collectionId: input.collectionId,
          memberId: input.memberId,
          accountId: input.accountId,
          amount,
          datedOn,
          actorId: input.actorId,
          clientRequestId: input.clientRequestId,
        };
        const replayId = await replaySubjectForAudit(tx, {
          orgId: input.orgId,
          actionKind: "collection.line.added",
          clientRequestId: input.clientRequestId,
          expectedPayload: addPayload,
        });
        if (replayId) {
          const [replay] = await tx.select().from(extraordinaryCollectionLine).where(and(
            eq(extraordinaryCollectionLine.orgId, input.orgId),
            eq(extraordinaryCollectionLine.id, replayId),
          )).limit(1);
          if (!replay) throw new Error("collection_replay_outcome_missing");
          return replay;
        }
        const [header] = await tx.select().from(extraordinaryCollection).where(and(
          eq(extraordinaryCollection.orgId, input.orgId),
          eq(extraordinaryCollection.id, input.collectionId),
        )).for("update").limit(1);
        if (!header) throw new Error("collection_not_found");
        if (header.status !== "open" && header.status !== "collecting") {
          throw new Error("collection_not_collecting");
        }

        const [contributor] = await tx.select({ id: member.id }).from(member).where(and(
          eq(member.orgId, input.orgId),
          eq(member.id, input.memberId),
          eq(member.status, "activo"),
        )).limit(1);
        if (!contributor) throw new Error("collection_member_unavailable");
        const [receivingAccount] = await tx.select({
          id: account.id,
          isGroupFund: account.isGroupFund,
        }).from(account).where(and(
          eq(account.orgId, input.orgId),
          eq(account.id, input.accountId),
          eq(account.status, "active"),
        )).for("update").limit(1);
        if (!receivingAccount) throw new Error("collection_account_unavailable");
        const reconciliationStatus = receivingAccount.isGroupFund || amount === "0.0000" ? "regularized" : "pending";
        const timestamp = now();
        const [saved] = await tx.insert(extraordinaryCollectionLine).values({
          orgId: input.orgId,
          collectionId: header.id,
          memberId: contributor.id,
          amount,
          accountId: receivingAccount.id,
          reconciliationStatus,
          datedOn,
          slipPhotoId: null,
          reversesId: null,
          reverseReason: null,
          createdAt: timestamp,
          createdBy: input.actorId,
        }).returning();
        if (!saved) throw new Error("collection_line_not_saved");

        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "collection.line.added",
          subjectKind: "extraordinary_collection_line",
          subjectId: saved.id,
          payloadSnapshot: {
            ...addPayload,
            reconciliationStatus,
          },
          reason: null,
          at: timestamp,
          createdAt: timestamp,
        });

        if (header.status === "open") {
          await tx.update(extraordinaryCollection).set({ status: "collecting" }).where(and(
            eq(extraordinaryCollection.orgId, input.orgId),
            eq(extraordinaryCollection.id, header.id),
            eq(extraordinaryCollection.status, "open"),
          ));
          await tx.insert(auditLogEntry).values({
            orgId: input.orgId,
            actorKind: "member",
            actorId: input.actorId,
            actionKind: "collection.status.changed",
            subjectKind: "extraordinary_collection",
            subjectId: header.id,
            payloadSnapshot: { from: "open", to: "collecting", clientRequestId: input.clientRequestId },
            reason: null,
            at: timestamp,
            createdAt: timestamp,
          });
        }
        return saved;
      });
    },

    async reverseLine(input) {
      const reason = input.reason.trim();
      if (reason.length < 10) throw new Error("collection_reverse_reason_invalid");

      return withWritableTenantTransaction(input.orgId, async (tx) => {
        await lockTenantMoneyWrites(tx, input.orgId);
        const reversePayload = {
          originalLineId: input.lineId,
          actorId: input.actorId,
          clientRequestId: input.clientRequestId,
        };
        const replayId = await replaySubjectForAudit(tx, {
          orgId: input.orgId,
          actionKind: "collection.line.reversed",
          clientRequestId: input.clientRequestId,
          expectedPayload: reversePayload,
          expectedReason: reason,
        });
        if (replayId) {
          const [replay] = await tx.select().from(extraordinaryCollectionLine).where(and(
            eq(extraordinaryCollectionLine.orgId, input.orgId),
            eq(extraordinaryCollectionLine.id, replayId),
          )).limit(1);
          if (!replay) throw new Error("collection_replay_outcome_missing");
          return replay;
        }
        const [original] = await tx.select().from(extraordinaryCollectionLine).where(and(
          eq(extraordinaryCollectionLine.orgId, input.orgId),
          eq(extraordinaryCollectionLine.id, input.lineId),
        )).for("update").limit(1);
        if (!original) throw new Error("collection_line_not_found");
        if (original.reversesId !== null) throw new Error("collection_reversal_of_reversal_forbidden");
        const [header] = await tx.select({
          id: extraordinaryCollection.id,
          status: extraordinaryCollection.status,
        }).from(extraordinaryCollection).where(and(
          eq(extraordinaryCollection.orgId, input.orgId),
          eq(extraordinaryCollection.id, original.collectionId),
        )).for("update").limit(1);
        if (!header) throw new Error("collection_not_found");
        if (header.status !== "open" && header.status !== "collecting") {
          throw new Error("collection_not_collecting");
        }
        const [priorReversal] = await tx.select({ id: extraordinaryCollectionLine.id })
          .from(extraordinaryCollectionLine).where(and(
            eq(extraordinaryCollectionLine.orgId, input.orgId),
            eq(extraordinaryCollectionLine.reversesId, original.id),
          )).limit(1);
        if (priorReversal) throw new Error("collection_line_already_reversed");
        const [liveRegularization] = await tx.select({ id: transfer.id }).from(transfer).where(and(
          eq(transfer.orgId, input.orgId),
          eq(transfer.purpose, "regularization"),
          eq(transfer.regularizesKind, "extraordinary_collection"),
          eq(transfer.regularizesId, original.id),
          sql`${transfer.amount} > 0 AND ${transfer.amount} <> 'NaN'::numeric`,
          sql`${transfer.reversesId} IS NULL`,
          sql`NOT EXISTS (
            SELECT 1 FROM transfer reversal
            WHERE reversal.org_id = ${transfer.orgId} AND reversal.reverses_id = ${transfer.id}
          )`,
        )).limit(1);
        if (liveRegularization) throw new Error("collection_line_regularization_active");

        const timestamp = now();
        const [saved] = await tx.insert(extraordinaryCollectionLine).values({
          orgId: input.orgId,
          collectionId: original.collectionId,
          memberId: original.memberId,
          amount: original.amount,
          accountId: original.accountId,
          reconciliationStatus: original.reconciliationStatus,
          datedOn: original.datedOn,
          slipPhotoId: original.slipPhotoId,
          reversesId: original.id,
          reverseReason: reason,
          createdAt: timestamp,
          createdBy: input.actorId,
        }).returning();
        if (!saved) throw new Error("collection_reversal_not_saved");

        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "collection.line.reversed",
          subjectKind: "extraordinary_collection_line",
          subjectId: saved.id,
          payloadSnapshot: {
            ...reversePayload,
            collectionId: original.collectionId,
            memberId: original.memberId,
            accountId: original.accountId,
            amount: String(original.amount),
            reconciliationStatus: original.reconciliationStatus,
            datedOn: String(original.datedOn),
          },
          reason,
          at: timestamp,
          createdAt: timestamp,
        });
        return saved;
      });
    },

    async cancel(input) {
      const datedOn = assertDateOnly(input.datedOn);
      const commandSnapshot: CollectionCommandSnapshot = {
        command: "cancel",
        clientRequestId: input.clientRequestId,
        collectionId: input.collectionId,
        actorId: input.actorId,
        datedOn,
        disposition: input.disposition,
        dispositionMotive: input.dispositionMotive?.trim() ?? null,
        returnAccountId: input.returnAccountId,
      };
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        await lockTenantMoneyWrites(tx, input.orgId);
        const [header] = await tx.select().from(extraordinaryCollection).where(and(
          eq(extraordinaryCollection.orgId, input.orgId),
          eq(extraordinaryCollection.id, input.collectionId),
        )).for("update").limit(1);
        if (!header) throw new Error("collection_not_found");
        if (await isEquivalentCompletedCommand(tx, input.orgId, commandSnapshot)) return header;
        if (header.status !== "open" && header.status !== "collecting") {
          throw new Error("collection_not_cancellable");
        }
        const lines = await tx.select().from(extraordinaryCollectionLine).where(and(
          eq(extraordinaryCollectionLine.orgId, input.orgId),
          eq(extraordinaryCollectionLine.collectionId, header.id),
        )).for("update");
        assertTerminalChronology(datedOn, String(header.openedOn), lines.map((line) => ({
          datedOn: String(line.datedOn),
        })));
        let regularizedUnits = BigInt(0);
        let pendingUnits = BigInt(0);
        const liveRegularizedLines: LiveRegularizedLine[] = [];
        const reversedIds = new Set(lines.filter((line) => line.reversesId !== null).map((line) => line.reversesId as string));
        for (const line of lines) {
          const signed = line.reversesId === null ? parseMoney4Units(String(line.amount)) : -parseMoney4Units(String(line.amount));
          if (line.reconciliationStatus === "regularized") regularizedUnits += signed;
          else pendingUnits += signed;
          if (
            line.reconciliationStatus === "regularized"
            && signed > BigInt(0)
            && line.reversesId === null
            && !reversedIds.has(line.id)
          ) {
            liveRegularizedLines.push({ id: line.id, accountId: line.accountId, amount: String(line.amount) });
          }
        }
        if (pendingUnits > BigInt(0)) throw new Error("collection_pending_regularization");
        const surplusAmount = formatMoney4Units(regularizedUnits);
        const disposition = assertDisposition(input, regularizedUnits);
        let surplusTransferId: string | null = null;
        const timestamp = now();
        if (disposition.disposition === "returned") {
          const holdings = await collectionHoldingProjection(tx, input.orgId, liveRegularizedLines);
          if (holdings.sourceAccountIds.size !== 1) throw new Error("collection_return_source_ambiguous");
          const [sourceAccountId] = holdings.sourceAccountIds;
          const sources = await tx.select({ id: account.id }).from(account).where(and(
            eq(account.orgId, input.orgId),
            eq(account.status, "active"),
            eq(account.isGroupFund, true),
            eq(account.id, sourceAccountId as string),
          )).for("update");
          if (sources.length !== 1) throw new Error("collection_return_source_unavailable");
          const [destination] = await tx.select({ id: account.id }).from(account).where(and(
            eq(account.orgId, input.orgId),
            eq(account.id, input.returnAccountId as string),
            eq(account.status, "active"),
            eq(account.isGroupFund, false),
          )).for("update").limit(1);
          if (!destination) throw new Error("collection_return_account_unavailable");
          const [savedTransfer] = await tx.insert(transfer).values({
            orgId: input.orgId, fromAccountId: sources[0]!.id, toAccountId: destination.id,
            amount: surplusAmount, currencyCode: "USD", datedOn,
            purpose: "collection_surplus_return", notes: null,
            regularizesKind: "extraordinary_collection", regularizesId: header.id,
            clientRequestId: input.clientRequestId, slipPhotoId: null, reversesId: null,
            createdAt: timestamp, createdBy: input.actorId,
          }).returning();
          if (!savedTransfer) throw new Error("collection_surplus_transfer_not_saved");
          surplusTransferId = savedTransfer.id;
          await tx.insert(auditLogEntry).values({
            orgId: input.orgId, actorKind: "member", actorId: input.actorId,
            actionKind: "collection.surplus.transferred", subjectKind: "transfer", subjectId: savedTransfer.id,
            payloadSnapshot: { collectionId: header.id, amount: surplusAmount, fromAccountId: sources[0]!.id, toAccountId: destination.id, clientRequestId: input.clientRequestId },
            reason: null, at: timestamp, createdAt: timestamp,
          });
        }
        const [cancelled] = await tx.update(extraordinaryCollection).set({
          status: "cancelled", surplusAmount, disposition: disposition.disposition,
          dispositionMotive: disposition.dispositionMotive, surplusTransferId,
        }).where(and(eq(extraordinaryCollection.orgId, input.orgId), eq(extraordinaryCollection.id, header.id), eq(extraordinaryCollection.status, header.status))).returning();
        if (!cancelled) throw new Error("collection_transition_conflict");
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId, actorKind: "member", actorId: input.actorId,
          actionKind: "collection.status.changed", subjectKind: "extraordinary_collection", subjectId: header.id,
          payloadSnapshot: { from: header.status, to: "cancelled", clientRequestId: input.clientRequestId },
          reason: null, at: timestamp, createdAt: timestamp,
        });
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId, actorKind: "member", actorId: input.actorId,
          actionKind: "collection.surplus.dispositioned", subjectKind: "extraordinary_collection", subjectId: header.id,
          payloadSnapshot: { surplusAmount, disposition: disposition.disposition, dispositionMotive: disposition.dispositionMotive, surplusTransferId, clientRequestId: input.clientRequestId },
          reason: disposition.dispositionMotive, at: timestamp, createdAt: timestamp,
        });
        await insertCompletedCommandAudit(tx, {
          orgId: input.orgId, actorId: input.actorId, at: timestamp, snapshot: commandSnapshot,
        });
        return cancelled;
      });
    },

    async closeRecognition(input) {
      const motive = input.dispositionMotive.trim();
      if (motive.length < 3) throw new Error("collection_disposition_invalid");
      const commandSnapshot: CollectionCommandSnapshot = {
        command: "close_recognition",
        clientRequestId: input.clientRequestId,
        collectionId: input.collectionId,
        actorId: input.actorId,
        dispositionMotive: motive,
      };
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        await lockTenantMoneyWrites(tx, input.orgId);
        const [header] = await tx.select().from(extraordinaryCollection).where(and(
          eq(extraordinaryCollection.orgId, input.orgId), eq(extraordinaryCollection.id, input.collectionId),
        )).for("update").limit(1);
        if (!header) throw new Error("collection_not_found");
        if (await isEquivalentCompletedCommand(tx, input.orgId, commandSnapshot)) return header;
        if (header.kind !== "treasurer_recognition") throw new Error("collection_recognition_kind_required");
        if (header.status !== "collecting") throw new Error("collection_not_collecting");
        const lines = await tx.select().from(extraordinaryCollectionLine).where(and(
          eq(extraordinaryCollectionLine.orgId, input.orgId), eq(extraordinaryCollectionLine.collectionId, header.id),
        )).for("update");
        let regularizedUnits = BigInt(0);
        let pendingUnits = BigInt(0);
        for (const line of lines) {
          const signed = line.reversesId === null ? parseMoney4Units(String(line.amount)) : -parseMoney4Units(String(line.amount));
          if (line.reconciliationStatus === "regularized") regularizedUnits += signed;
          else pendingUnits += signed;
        }
        if (pendingUnits > BigInt(0)) throw new Error("collection_pending_regularization");
        if (regularizedUnits <= BigInt(0)) throw new Error("collection_recognition_amount_positive_required");
        const timestamp = now();
        const [paidOut] = await tx.update(extraordinaryCollection).set({ status: "paid_out", paidOutExpenseId: null })
          .where(and(eq(extraordinaryCollection.orgId, input.orgId), eq(extraordinaryCollection.id, header.id), eq(extraordinaryCollection.status, "collecting"))).returning();
        if (!paidOut) throw new Error("collection_transition_conflict");
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId, actorKind: "member", actorId: input.actorId, actionKind: "collection.status.changed",
          subjectKind: "extraordinary_collection", subjectId: header.id,
          payloadSnapshot: { from: "collecting", to: "paid_out", clientRequestId: input.clientRequestId },
          reason: null, at: timestamp, createdAt: timestamp,
        });
        const surplusAmount = formatMoney4Units(regularizedUnits);
        const [closed] = await tx.update(extraordinaryCollection).set({
          status: "closed", surplusAmount, disposition: "retained", dispositionMotive: motive, surplusTransferId: null,
        }).where(and(eq(extraordinaryCollection.orgId, input.orgId), eq(extraordinaryCollection.id, header.id), eq(extraordinaryCollection.status, "paid_out"))).returning();
        if (!closed) throw new Error("collection_transition_conflict");
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId, actorKind: "member", actorId: input.actorId, actionKind: "collection.status.changed",
          subjectKind: "extraordinary_collection", subjectId: header.id,
          payloadSnapshot: { from: "paid_out", to: "closed", clientRequestId: input.clientRequestId },
          reason: null, at: timestamp, createdAt: timestamp,
        });
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId, actorKind: "member", actorId: input.actorId, actionKind: "collection.surplus.dispositioned",
          subjectKind: "extraordinary_collection", subjectId: header.id,
          payloadSnapshot: { surplusAmount, disposition: "retained", dispositionMotive: motive, surplusTransferId: null, clientRequestId: input.clientRequestId },
          reason: motive, at: timestamp, createdAt: timestamp,
        });
        await insertCompletedCommandAudit(tx, {
          orgId: input.orgId, actorId: input.actorId, at: timestamp, snapshot: commandSnapshot,
        });
        return closed;
      });
    },

    async reversePayout(input) {
      const reason = input.reason.trim();
      if (reason.length < 10) throw new Error("collection_payout_reverse_reason_invalid");
      const datedOn = assertDateOnly(input.datedOn);
      const commandSnapshot: CollectionCommandSnapshot = {
        command: "reverse_payout",
        clientRequestId: input.clientRequestId,
        collectionId: input.collectionId,
        actorId: input.actorId,
        reason,
        datedOn,
      };
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        await lockTenantMoneyWrites(tx, input.orgId);
        const [header] = await tx.select().from(extraordinaryCollection).where(and(
          eq(extraordinaryCollection.orgId, input.orgId),
          eq(extraordinaryCollection.id, input.collectionId),
        )).for("update").limit(1);
        if (!header) throw new Error("collection_not_found");
        if (await isEquivalentCompletedCommand(tx, input.orgId, commandSnapshot)) {
          const [replayed] = await tx.select().from(expense).where(and(
            eq(expense.orgId, input.orgId),
            eq(expense.clientRequestId, input.clientRequestId),
          )).limit(1);
          if (!replayed) throw new Error("collection_idempotency_conflict");
          return replayed;
        }
        if (header.kind !== "solidarity") throw new Error("collection_payout_kind_invalid");
        if (header.status !== "closed") throw new Error("collection_payout_not_reversible");
        if (header.paidOutExpenseId === null) throw new Error("collection_payout_not_found");
        const [original] = await tx.select().from(expense).where(and(
          eq(expense.orgId, input.orgId),
          eq(expense.id, header.paidOutExpenseId),
          eq(expense.category, "solidarity_payout"),
          eq(expense.status, "paid"),
        )).for("update").limit(1);
        if (!original || original.reversesId !== null || original.accountId === null) {
          throw new Error("collection_payout_not_found");
        }
        const [priorReversal] = await tx.select({ id: expense.id }).from(expense).where(and(
          eq(expense.orgId, input.orgId),
          eq(expense.reversesId, original.id),
        )).limit(1);
        if (priorReversal) throw new Error("collection_payout_already_reversed");
        const timestamp = now();
        const [saved] = await tx.insert(expense).values({
          orgId: input.orgId,
          purpose: "reversal: pago solidario",
          notes: null,
          amount: original.amount,
          currencyCode: original.currencyCode,
          beneficiaryMemberId: original.beneficiaryMemberId,
          beneficiaryText: original.beneficiaryText,
          incurredOn: datedOn,
          status: "paid",
          recordedAt: timestamp,
          reversesId: original.id,
          reverseReason: reason,
          adjustmentCycleId: null,
          accountId: original.accountId,
          category: "solidarity_payout",
          clientRequestId: input.clientRequestId,
          slipPhotoId: null,
          createdAt: timestamp,
          createdBy: input.actorId,
          createdByKind: "member",
        }).returning();
        if (!saved) throw new Error("collection_payout_reversal_not_saved");
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "collection.payout.reversed",
          subjectKind: "expense",
          subjectId: saved.id,
          payloadSnapshot: {
            collectionId: header.id,
            originalExpenseId: original.id,
            amount: String(original.amount),
            accountId: original.accountId,
            beneficiaryMemberId: original.beneficiaryMemberId,
            datedOn,
            clientRequestId: input.clientRequestId,
          },
          reason,
          at: timestamp,
          createdAt: timestamp,
        });
        await insertCompletedCommandAudit(tx, {
          orgId: input.orgId, actorId: input.actorId, at: timestamp, snapshot: commandSnapshot,
        });
        return saved;
      });
    },

    async payout(input) {
      const payoutAmount = parsePositiveCollectionMoney(input.payoutAmount);
      const datedOn = assertDateOnly(input.datedOn);
      const commandSnapshot: CollectionCommandSnapshot = {
        command: "payout",
        clientRequestId: input.clientRequestId,
        collectionId: input.collectionId,
        actorId: input.actorId,
        sourceAccountId: input.sourceAccountId,
        payoutAmount,
        disposition: input.disposition,
        dispositionMotive: input.dispositionMotive?.trim() ?? null,
        returnAccountId: input.returnAccountId,
        datedOn,
      };
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        await lockTenantMoneyWrites(tx, input.orgId);
        const [header] = await tx.select().from(extraordinaryCollection).where(and(
          eq(extraordinaryCollection.orgId, input.orgId), eq(extraordinaryCollection.id, input.collectionId),
        )).for("update").limit(1);
        if (!header) throw new Error("collection_not_found");
        if (await isEquivalentCompletedCommand(tx, input.orgId, commandSnapshot)) return header;
        if (header.kind !== "solidarity") throw new Error("collection_payout_kind_invalid");
        if (header.status !== "collecting") throw new Error("collection_not_collecting");
        const [source] = await tx.select({ id: account.id }).from(account).where(and(
          eq(account.orgId, input.orgId), eq(account.id, input.sourceAccountId),
          eq(account.status, "active"), eq(account.isGroupFund, true),
        )).for("update").limit(1);
        if (!source) throw new Error("collection_source_account_unavailable");
        const lines = await tx.select().from(extraordinaryCollectionLine).where(and(
          eq(extraordinaryCollectionLine.orgId, input.orgId), eq(extraordinaryCollectionLine.collectionId, header.id),
        )).for("update");
        assertTerminalChronology(datedOn, String(header.openedOn), lines.map((line) => ({
          datedOn: String(line.datedOn),
        })));
        let regularizedUnits = BigInt(0);
        let pendingUnits = BigInt(0);
        const liveRegularizedLines: LiveRegularizedLine[] = [];
        const reversedIds = new Set(lines.filter((line) => line.reversesId !== null).map((line) => line.reversesId as string));
        for (const line of lines) {
          const signed = line.reversesId === null ? parseMoney4Units(String(line.amount)) : -parseMoney4Units(String(line.amount));
          if (line.reconciliationStatus === "regularized") regularizedUnits += signed;
          else pendingUnits += signed;
          if (
            line.reconciliationStatus === "regularized"
            && signed > BigInt(0)
            && line.reversesId === null
            && !reversedIds.has(line.id)
          ) {
            liveRegularizedLines.push({ id: line.id, accountId: line.accountId, amount: String(line.amount) });
          }
        }
        if (pendingUnits > BigInt(0)) throw new Error("collection_pending_regularization");
        const settlement = collectionSettlement({
          regularized: formatMoney4Units(regularizedUnits), payout: payoutAmount,
        });
        const surplusUnits = parseMoney4Units(settlement.surplus);
        const surplusAmount = settlement.surplus;
        const disposition = assertDisposition(input, surplusUnits);
        const holdings = await collectionHoldingProjection(tx, input.orgId, liveRegularizedLines);
        const sourceHoldingUnits = holdings.holdingUnits.get(source.id);
        if (sourceHoldingUnits === undefined || sourceHoldingUnits === BigInt(0)) {
          throw new Error("collection_source_account_unavailable");
        }
        const payoutUnits = parseMoney4Units(payoutAmount);
        if (sourceHoldingUnits < payoutUnits) throw new Error("collection_source_account_insufficient");
        if (disposition.disposition === "returned" && sourceHoldingUnits < regularizedUnits) {
          throw new Error("collection_return_source_ambiguous");
        }
        let returnAccountId: string | null = null;
        if (disposition.disposition === "returned") {
          const [destination] = await tx.select({ id: account.id }).from(account).where(and(
            eq(account.orgId, input.orgId), eq(account.id, input.returnAccountId as string),
            eq(account.status, "active"), eq(account.isGroupFund, false),
          )).for("update").limit(1);
          if (!destination) throw new Error("collection_return_account_unavailable");
          returnAccountId = destination.id;
        }
        const timestamp = now();
        const [savedExpense] = await tx.insert(expense).values({
          orgId: input.orgId, purpose: "pago solidario", notes: null, amount: payoutAmount,
          currencyCode: "USD", beneficiaryMemberId: header.beneficiaryMemberId, beneficiaryText: null,
          incurredOn: datedOn, status: "paid", recordedAt: timestamp, reversesId: null, reverseReason: null,
          adjustmentCycleId: null, accountId: source.id, category: "solidarity_payout", clientRequestId: input.clientRequestId,
          slipPhotoId: null, createdAt: timestamp, createdBy: input.actorId, createdByKind: "member",
        }).returning();
        if (!savedExpense) throw new Error("collection_payout_expense_not_saved");
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId, actorKind: "member", actorId: input.actorId, actionKind: "collection.payout.recorded",
          subjectKind: "expense", subjectId: savedExpense.id,
          payloadSnapshot: { collectionId: header.id, beneficiaryMemberId: header.beneficiaryMemberId, accountId: source.id, amount: payoutAmount, datedOn, clientRequestId: input.clientRequestId },
          reason: null, at: timestamp, createdAt: timestamp,
        });
        const [paidOut] = await tx.update(extraordinaryCollection).set({ status: "paid_out", paidOutExpenseId: savedExpense.id })
          .where(and(eq(extraordinaryCollection.orgId, input.orgId), eq(extraordinaryCollection.id, header.id), eq(extraordinaryCollection.status, "collecting"))).returning();
        if (!paidOut) throw new Error("collection_transition_conflict");
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId, actorKind: "member", actorId: input.actorId, actionKind: "collection.status.changed",
          subjectKind: "extraordinary_collection", subjectId: header.id,
          payloadSnapshot: { from: "collecting", to: "paid_out", clientRequestId: input.clientRequestId },
          reason: null, at: timestamp, createdAt: timestamp,
        });
        let surplusTransferId: string | null = null;
        if (disposition.disposition === "returned") {
          const [savedTransfer] = await tx.insert(transfer).values({
            orgId: input.orgId, fromAccountId: source.id, toAccountId: returnAccountId as string,
            amount: surplusAmount, currencyCode: "USD", datedOn, purpose: "collection_surplus_return", notes: null,
            regularizesKind: "extraordinary_collection", regularizesId: header.id, clientRequestId: input.clientRequestId,
            slipPhotoId: null, reversesId: null, createdAt: timestamp, createdBy: input.actorId,
          }).returning();
          if (!savedTransfer) throw new Error("collection_surplus_transfer_not_saved");
          surplusTransferId = savedTransfer.id;
          await tx.insert(auditLogEntry).values({
            orgId: input.orgId, actorKind: "member", actorId: input.actorId,
            actionKind: "collection.surplus.transferred", subjectKind: "transfer", subjectId: savedTransfer.id,
            payloadSnapshot: { collectionId: header.id, amount: surplusAmount, fromAccountId: source.id, toAccountId: returnAccountId, clientRequestId: input.clientRequestId },
            reason: null, at: timestamp, createdAt: timestamp,
          });
        }
        const [closed] = await tx.update(extraordinaryCollection).set({
          status: "closed", surplusAmount, disposition: disposition.disposition,
          dispositionMotive: disposition.dispositionMotive, surplusTransferId,
        }).where(and(eq(extraordinaryCollection.orgId, input.orgId), eq(extraordinaryCollection.id, header.id), eq(extraordinaryCollection.status, "paid_out"))).returning();
        if (!closed) throw new Error("collection_transition_conflict");
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId, actorKind: "member", actorId: input.actorId, actionKind: "collection.status.changed",
          subjectKind: "extraordinary_collection", subjectId: header.id,
          payloadSnapshot: { from: "paid_out", to: "closed", clientRequestId: input.clientRequestId },
          reason: null, at: timestamp, createdAt: timestamp,
        });
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId, actorKind: "member", actorId: input.actorId,
          actionKind: "collection.surplus.dispositioned", subjectKind: "extraordinary_collection", subjectId: header.id,
          payloadSnapshot: { surplusAmount, disposition: disposition.disposition, dispositionMotive: disposition.dispositionMotive, surplusTransferId, clientRequestId: input.clientRequestId },
          reason: disposition.dispositionMotive, at: timestamp, createdAt: timestamp,
        });
        await insertCompletedCommandAudit(tx, {
          orgId: input.orgId, actorId: input.actorId, at: timestamp, snapshot: commandSnapshot,
        });
        return closed;
      });
    },
  };
}
