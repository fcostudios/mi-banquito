"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { compareMoney4, createExtraordinaryCollectionService, createMovementService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import {
  ROUTE_SCR_CASH_FLOW_PROJECTION,
  ROUTE_SCR_HISTORY,
  ROUTE_SCR_RECORD_MOVEMENT,
  ROUTE_SCR_SOLIDARITY_COLLECTION,
  ROUTE_SCR_STATEMENTS_ARCHIVE,
} from "@/lib/routes";

const uuid = z.string().uuid();
const dateOnly = z.string().date();
const optionalMotive = z.union([z.literal(""), z.string().trim().max(500)]).transform((value) => value || null);

const openCollectionSchema = z.object({
  purpose: z.string().trim().min(3).max(500),
  beneficiaryMemberId: uuid,
  kind: z.enum(["solidarity", "treasurer_recognition"]),
  targetAmount: z.union([z.literal(""), z.string().max(32)]).transform((value) => value || null),
  recognitionFiscalYear: z.union([z.literal(""), z.coerce.number().int().min(2000).max(2200)]).transform((value) => value === "" ? null : value),
  openedOn: dateOnly,
  clientRequestId: uuid,
}).strict().superRefine((value, ctx) => {
  if (value.kind === "treasurer_recognition" && value.recognitionFiscalYear === null) {
    ctx.addIssue({ code: "custom", path: ["recognitionFiscalYear"], message: "recognition_fiscal_year_required" });
  }
  if (value.kind === "solidarity" && value.recognitionFiscalYear !== null) {
    ctx.addIssue({ code: "custom", path: ["recognitionFiscalYear"], message: "recognition_fiscal_year_forbidden" });
  }
});

const addLineSchema = z.object({
  collectionId: uuid, memberId: uuid, accountId: uuid, amount: z.string().min(1).max(32),
  datedOn: dateOnly, clientRequestId: uuid,
}).strict();
const reverseLineSchema = z.object({
  collectionId: uuid, lineId: uuid, reason: z.string().trim().min(10).max(500), clientRequestId: uuid,
}).strict();
const regularizationSchema = z.object({
  collectionId: uuid,
  lineId: uuid,
  sourceAccountId: uuid,
  toAccountId: uuid,
  amount: z.string().min(1).max(32),
  datedOn: dateOnly,
  confirmed: z.literal("yes"),
  clientRequestId: uuid,
}).strict();
const dispositionShape = {
  disposition: z.union([z.literal(""), z.enum(["returned", "retained"])]).transform((value) => value || null),
  dispositionMotive: optionalMotive,
  returnAccountId: z.union([z.literal(""), uuid]).transform((value) => value || null),
};
function refineDisposition(value: { disposition: "returned" | "retained" | null; dispositionMotive: string | null; returnAccountId: string | null }, ctx: z.RefinementCtx) {
  if (value.disposition === "returned" && value.returnAccountId === null) {
    ctx.addIssue({ code: "custom", path: ["returnAccountId"], message: "collection_return_account_required" });
  }
  if (value.disposition === "retained" && (value.dispositionMotive?.trim().length ?? 0) < 3) {
    ctx.addIssue({ code: "custom", path: ["dispositionMotive"], message: "collection_retention_motive_required" });
  }
  if ((value.disposition !== "returned" && value.returnAccountId !== null) || (value.disposition !== "retained" && value.dispositionMotive !== null)) {
    ctx.addIssue({ code: "custom", path: ["disposition"], message: "collection_disposition_invalid" });
  }
}

const payoutSchema = z.object({
  collectionId: uuid, sourceAccountId: uuid, payoutAmount: z.string().min(1).max(32), datedOn: dateOnly,
  clientRequestId: uuid, ...dispositionShape,
}).strict().superRefine(refineDisposition);
const cancelSchema = z.object({
  collectionId: uuid, datedOn: dateOnly, clientRequestId: uuid, ...dispositionShape,
}).strict().superRefine(refineDisposition);
const closeRecognitionSchema = z.object({
  collectionId: uuid, dispositionMotive: z.string().trim().min(3).max(500), clientRequestId: uuid,
}).strict();

function scalarFields(formData: FormData, keys: readonly string[]): Record<string, string> {
  const allowed = new Set(keys);
  const result: Record<string, string> = {};
  for (const key of formData.keys()) {
    if (!allowed.has(key) && !key.startsWith("$ACTION_")) throw new z.ZodError([]);
  }
  for (const key of keys) {
    const values = formData.getAll(key);
    if (values.length > 1 || (values[0] !== undefined && typeof values[0] !== "string")) throw new z.ZodError([]);
    result[key] = typeof values[0] === "string" ? values[0] : "";
  }
  return result;
}

function collectionErrorCode(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issue = error.issues.find((item) => item.message.startsWith("collection_"));
    if (issue?.message === "collection_return_account_required") return "collection-return-account-required";
    if (issue?.message === "collection_retention_motive_required") return "collection-retention-motive-required";
    if (issue?.message === "collection_disposition_invalid") return "collection-disposition-required";
    return "invalid-form";
  }
  if (!(error instanceof Error)) return "action-failed";
  const code = error.message;
  if (["collection_not_found", "collection_beneficiary_unavailable", "collection_member_unavailable", "collection_account_unavailable", "collection_line_not_found"].includes(code)) return "collection-not-found";
  if (["regularization_source_unavailable", "regularization_target_unavailable"].includes(code)) return "collection-not-found";
  if (code === "collection_pending_regularization") return "collection-pending-regularization";
  if (code === "collection_payout_exceeds_ceiling" || code === "collection_source_account_insufficient") return "collection-payout-above-ceiling";
  if (code === "collection_disposition_invalid") return "collection-disposition-required";
  if (code === "collection_return_account_unavailable" || code === "collection_return_source_unavailable" || code === "collection_return_source_ambiguous") return "collection-return-account-required";
  if (["collection_not_collecting", "collection_not_cancellable", "collection_transition_conflict", "collection_terminal_date_before_opened", "collection_terminal_date_before_line", "collection_recognition_kind_required", "collection_recognition_amount_positive_required", "collection_payout_kind_invalid", "regularization_source_already_regularized", "regularization_amount_exceeds_remaining", "regularization_amount_stale"].includes(code)) return "collection-transition-invalid";
  if (["collection_line_already_reversed", "collection_reversal_of_reversal_forbidden", "collection_reverse_reason_invalid", "collection_line_regularization_active"].includes(code)) return "collection-reversal-invalid";
  if (code === "collection_idempotency_conflict") return "collection-idempotency-conflict";
  return "action-failed";
}

function failedPath(error: unknown, orgId: string, collectionId?: string): string {
  const errorCode = collectionErrorCode(error);
  if (errorCode === "action-failed") {
    console.error("collection.action_failed", {
      orgId,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
  const params = new URLSearchParams({ error: errorCode });
  if (collectionId && uuid.safeParse(collectionId).success) params.set("collectionId", collectionId);
  return `${ROUTE_SCR_SOLIDARITY_COLLECTION}?${params.toString()}`;
}

function collectionPath(params: Record<string, string>): string {
  return `${ROUTE_SCR_SOLIDARITY_COLLECTION}?${new URLSearchParams(params).toString()}`;
}

function revalidateCollectionSurfaces() {
  for (const path of [ROUTE_SCR_SOLIDARITY_COLLECTION, ROUTE_SCR_RECORD_MOVEMENT, ROUTE_SCR_HISTORY, ROUTE_SCR_CASH_FLOW_PROJECTION, ROUTE_SCR_STATEMENTS_ARCHIVE]) revalidatePath(path);
}

export async function openCollectionAction(formData: FormData) {
  const session = await requireTreasurer();
  let collectionId: string;
  try {
    const parsed = openCollectionSchema.parse(scalarFields(formData, ["purpose", "beneficiaryMemberId", "kind", "targetAmount", "recognitionFiscalYear", "openedOn", "clientRequestId"]));
    const result = await createExtraordinaryCollectionService().open({ ...parsed, orgId: session.orgId, actorId: session.actorId });
    collectionId = result.id;
  } catch (error) { redirect(failedPath(error, session.orgId)); }
  revalidateCollectionSurfaces();
  redirect(collectionPath({ collectionId, saved: "1" }));
}

export async function addCollectionLineAction(formData: FormData) {
  const session = await requireTreasurer();
  let collectionId: string | undefined;
  try {
    const parsed = addLineSchema.parse(scalarFields(formData, ["collectionId", "memberId", "accountId", "amount", "datedOn", "clientRequestId"]));
    collectionId = parsed.collectionId;
    await createExtraordinaryCollectionService().addLine({ ...parsed, orgId: session.orgId, actorId: session.actorId });
  } catch (error) { redirect(failedPath(error, session.orgId, collectionId)); }
  revalidateCollectionSurfaces(); redirect(collectionPath({ collectionId: collectionId!, saved: "1" }));
}

export async function reverseCollectionLineAction(formData: FormData) {
  const session = await requireTreasurer(); let collectionId: string | undefined;
  try {
    const parsed = reverseLineSchema.parse(scalarFields(formData, ["collectionId", "lineId", "reason", "clientRequestId"])); collectionId = parsed.collectionId;
    await createExtraordinaryCollectionService().reverseLine({ orgId: session.orgId, actorId: session.actorId, lineId: parsed.lineId, reason: parsed.reason, clientRequestId: parsed.clientRequestId });
  } catch (error) { redirect(failedPath(error, session.orgId, collectionId)); }
  revalidateCollectionSurfaces(); redirect(collectionPath({ collectionId: collectionId!, saved: "1" }));
}

export async function regularizeCollectionLineAction(formData: FormData) {
  const session = await requireTreasurer(); let collectionId: string | undefined;
  try {
    const parsed = regularizationSchema.parse(scalarFields(formData, ["collectionId", "lineId", "sourceAccountId", "toAccountId", "amount", "datedOn", "confirmed", "clientRequestId"]));
    collectionId = parsed.collectionId;
    const collection = await createExtraordinaryCollectionService().get({ orgId: session.orgId, collectionId });
    const line = collection?.lines.find((candidate) => candidate.id === parsed.lineId && candidate.reversesId === null);
    if (!line || line.accountId !== parsed.sourceAccountId) throw new Error("collection_line_not_found");
    const movements = createMovementService();
    if (line.reconciliationStatus === "pending") {
      if (collection?.status !== "open" && collection?.status !== "collecting") throw new Error("collection_transition_conflict");
      const authoritative = await movements.getPendingDeposit(session.orgId, {
        sourceKind: "extraordinary_collection",
        id: line.id,
      });
      if (!authoritative || compareMoney4(parsed.amount, authoritative.remaining) !== 0) {
        throw new Error("regularization_amount_stale");
      }
    }
    await movements.regularizePendingDeposit({
      orgId: session.orgId,
      actorId: session.actorId,
      regularizesKind: "extraordinary_collection",
      regularizesId: parsed.lineId,
      toAccountId: parsed.toAccountId,
      amount: parsed.amount,
      datedOn: parsed.datedOn,
      clientRequestId: parsed.clientRequestId,
    });
  } catch (error) { redirect(failedPath(error, session.orgId, collectionId)); }
  revalidateCollectionSurfaces(); redirect(collectionPath({ collectionId: collectionId!, saved: "1" }));
}

export async function payoutCollectionAction(formData: FormData) {
  const session = await requireTreasurer(); let collectionId: string | undefined;
  try { const parsed = payoutSchema.parse(scalarFields(formData, ["collectionId", "sourceAccountId", "payoutAmount", "datedOn", "clientRequestId", "disposition", "dispositionMotive", "returnAccountId"])); collectionId = parsed.collectionId; await createExtraordinaryCollectionService().payout({ ...parsed, orgId: session.orgId, actorId: session.actorId }); }
  catch (error) { redirect(failedPath(error, session.orgId, collectionId)); }
  revalidateCollectionSurfaces(); redirect(collectionPath({ collectionId: collectionId!, saved: "1" }));
}

export async function cancelCollectionAction(formData: FormData) {
  const session = await requireTreasurer(); let collectionId: string | undefined;
  try { const parsed = cancelSchema.parse(scalarFields(formData, ["collectionId", "datedOn", "clientRequestId", "disposition", "dispositionMotive", "returnAccountId"])); collectionId = parsed.collectionId; await createExtraordinaryCollectionService().cancel({ ...parsed, orgId: session.orgId, actorId: session.actorId }); }
  catch (error) { redirect(failedPath(error, session.orgId, collectionId)); }
  revalidateCollectionSurfaces(); redirect(collectionPath({ collectionId: collectionId!, saved: "1" }));
}

export async function closeRecognitionCollectionAction(formData: FormData) {
  const session = await requireTreasurer(); let collectionId: string | undefined;
  try { const parsed = closeRecognitionSchema.parse(scalarFields(formData, ["collectionId", "dispositionMotive", "clientRequestId"])); collectionId = parsed.collectionId; await createExtraordinaryCollectionService().closeRecognition({ ...parsed, orgId: session.orgId, actorId: session.actorId }); }
  catch (error) { redirect(failedPath(error, session.orgId, collectionId)); }
  revalidateCollectionSurfaces(); redirect(collectionPath({ collectionId: collectionId!, saved: "1" }));
}
