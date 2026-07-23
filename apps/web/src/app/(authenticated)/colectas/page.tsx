import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { account, member } from "@mi-banquito/db/schema";
import { withTenantTransaction } from "@mi-banquito/db/tenant";
import { createExtraordinaryCollectionService, createMovementService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import {
  addCollectionLineAction,
  cancelCollectionAction,
  closeRecognitionCollectionAction,
  openCollectionAction,
  payoutCollectionAction,
  regularizeCollectionLineAction,
  reverseCollectionLineAction,
} from "./actions";
import { CollectionForms, type CollectionScreenModel } from "./collection-forms";
import { ecuadorTodayISO } from "../movimientos/registrar/movement-forms";

export const dynamic = "force-dynamic";
type SearchValue = string | string[] | undefined;

function collectionStatus(value: string): CollectionScreenModel["collections"][number]["status"] {
  if (value === "open" || value === "collecting" || value === "paid_out" || value === "closed" || value === "cancelled") return value;
  throw new Error("collection_status_invalid");
}

function collectionKind(value: string): NonNullable<CollectionScreenModel["selected"]>["kind"] {
  if (value === "solidarity" || value === "treasurer_recognition") return value;
  throw new Error("collection_kind_invalid");
}

export default async function ScrSolidarityCollectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const session = await requireTreasurer();
  const search = await searchParams;
  const service = createExtraordinaryCollectionService();
  const [collections, options] = await Promise.all([
    service.list({ orgId: session.orgId, limit: 50 }),
    withTenantTransaction(session.orgId, async (tx) => {
      const [members, accounts] = await Promise.all([
        tx.select({ id: member.id, name: member.displayName }).from(member).where(and(eq(member.orgId, session.orgId), eq(member.status, "activo"))).orderBy(asc(member.displayName), asc(member.id)),
        tx.select({ id: account.id, name: account.name, isGroupFund: account.isGroupFund }).from(account).where(and(eq(account.orgId, session.orgId), eq(account.status, "active"))).orderBy(asc(account.name), asc(account.id)),
      ]);
      return { members, accounts };
    }),
  ]);
  const requestedId = typeof search.collectionId === "string" && z.string().uuid().safeParse(search.collectionId).success
    ? search.collectionId
    : undefined;
  const selected = collections.find((collection) => collection.id === requestedId) ?? collections[0] ?? null;
  const movementService = createMovementService();
  const selectedLines = selected ? await Promise.all(selected.lines.map(async (line) => {
    const pending = line.reconciliationStatus === "pending" && line.reversesId === null
      ? await movementService.getPendingDeposit(session.orgId, { sourceKind: "extraordinary_collection", id: line.id })
      : null;
    return {
      id: line.id, memberName: line.memberName, amount: line.amount, accountName: line.accountName,
      accountId: line.accountId, remaining: pending?.remaining ?? "0.0000",
      reconciliationStatus: line.reconciliationStatus, reversesId: line.reversesId,
    };
  })) : [];
  const model: CollectionScreenModel = {
    today: ecuadorTodayISO(),
    recognitionFiscalYear: new Date().getUTCFullYear(),
    search,
    requestIds: {
      open: randomUUID(), addLine: randomUUID(),
      payout: randomUUID(), cancel: randomUUID(), closeRecognition: randomUUID(),
    },
    lineRequestIds: Object.fromEntries(selectedLines.map((line) => [line.id, {
      reverse: randomUUID(),
      regularize: randomUUID(),
    }])),
    members: options.members,
    accounts: options.accounts,
    collections: collections.map(({ id, purpose, status }) => ({ id, purpose, status: collectionStatus(status) })),
    selected: selected ? {
      id: selected.id,
      kind: collectionKind(selected.kind),
      purpose: selected.purpose,
      beneficiaryName: selected.beneficiaryName,
      targetAmount: selected.targetAmount,
      status: collectionStatus(selected.status),
      progress: selected.progress,
      surplusAmount: selected.surplusAmount,
      disposition: selected.disposition,
      dispositionMotive: selected.dispositionMotive,
      lines: selectedLines,
    } : null,
  };
  return <CollectionForms model={model} actions={{
    open: openCollectionAction,
    addLine: addCollectionLineAction,
    reverseLine: reverseCollectionLineAction,
    regularize: regularizeCollectionLineAction,
    payout: payoutCollectionAction,
    cancel: cancelCollectionAction,
    closeRecognition: closeRecognitionCollectionAction,
  }} />;
}
