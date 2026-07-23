"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  CompensationCeilingExceededError,
  createMovementService,
  createTreasurerCompensationService,
} from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { deleteExpenseSlip, uploadExpenseSlip } from "@/lib/expense-slip-storage";
import {
  ROUTE_HOME,
  ROUTE_SCR_CASH_FLOW_PROJECTION,
  ROUTE_SCR_HISTORY,
  ROUTE_SCR_RECORD_MOVEMENT,
} from "@/lib/routes";

const categories = [
  "bank_fee",
  "supplies",
  "shared_expense",
  "operating",
  "solidarity_payout",
  "treasurer_comp_payout",
] as const;

const expenseSchema = z.object({
  accountId: z.string().uuid(),
  category: z.enum(categories),
  amount: z.string().min(1),
  datedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2_000).optional().default(""),
  clientRequestId: z.string().uuid(),
}).strict();

const transferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: z.string().min(1),
  datedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2_000).optional().default(""),
  clientRequestId: z.string().uuid(),
}).strict();

const regularizationSchema = z.object({
  regularizesKind: z.enum(["contribution", "repayment", "extraordinary_collection"]),
  regularizesId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: z.string().min(1),
  datedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2_000).optional().default(""),
  clientRequestId: z.string().uuid(),
  confirmed: z.literal("yes"),
}).strict();

const fiscalYearSchema = z.coerce.number().int().min(2000).max(2200);
const treasurerCompensationSchema = z.object({
  fiscalYear: fiscalYearSchema,
  accountId: z.string().uuid(),
  amount: z.string().min(1).max(32),
  datedOn: z.string().date(),
  notes: z.string().trim().max(2_000).optional(),
  clientRequestId: z.string().uuid(),
}).strict();

function parseScalarFields(formData: FormData, keys: readonly string[], options: { allowSlip?: boolean } = {}) {
  const allowed = new Set(options.allowSlip ? [...keys, "slipPhoto"] : keys);
  const result: Record<string, string> = {};

  for (const key of formData.keys()) {
    if (!allowed.has(key) && !key.startsWith("$ACTION_")) throw new z.ZodError([]);
  }
  for (const key of keys) {
    const values = formData.getAll(key);
    if (values.length > 1 || (values[0] !== undefined && typeof values[0] !== "string")) {
      throw new z.ZodError([]);
    }
    if (typeof values[0] === "string") result[key] = values[0];
  }
  if (options.allowSlip) {
    const slipValues = formData.getAll("slipPhoto");
    if (slipValues.length > 1 || typeof slipValues[0] === "string") throw new z.ZodError([]);
  }
  return result;
}

function expenseSlipFile(formData: FormData): File | undefined {
  const values = formData.getAll("slipPhoto");
  if (values.length === 0) return undefined;
  if (values.length > 1 || typeof values[0] === "string") throw new z.ZodError([]);
  return values[0].size > 0 ? values[0] : undefined;
}

function validatedFiscalYear(formData: FormData): number | undefined {
  const values = formData.getAll("fiscalYear");
  if (values.length !== 1 || typeof values[0] !== "string") return undefined;
  const parsed = fiscalYearSchema.safeParse(values[0]);
  return parsed.success ? parsed.data : undefined;
}

function movementErrorCode(error: unknown): string {
  if (error instanceof z.ZodError) return "invalid-form";
  if (!(error instanceof Error)) return "action-failed";
  if (error.message === "movement_governed_payout_required") return "governed-payout-required";
  if (error.message === "movement_slip_invalid" || error.message === "movement_slip_conflict") {
    return "invalid-slip";
  }
  if (error.message === "movement_slip_unavailable") {
    return "slip-upload-unavailable";
  }
  if (
    error.message === "movement_group_account_required"
    || error.message === "movement_account_unavailable"
    || error.message === "transfer_account_unavailable"
    || error.message === "transfer_accounts_must_differ"
    || error.message === "transfer_group_accounts_required"
    || error.message === "regularization_source_unavailable"
    || error.message === "regularization_target_unavailable"
    || error.message === "regularization_source_already_regularized"
  ) {
    return "account-unavailable";
  }
  if (
    error.message === "movement_amount_invalid"
    || error.message === "movement_date_invalid"
    || error.message === "movement_category_required"
    || error.message === "movement_category_invalid"
  ) {
    return "invalid-form";
  }
  return "action-failed";
}

function recordMovementPath(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return `${ROUTE_SCR_RECORD_MOVEMENT}?${params.toString()}`;
}

function compensationErrorPath(error: unknown, fiscalYear?: number): string {
  if (error instanceof CompensationCeilingExceededError) {
    return recordMovementPath({
      error: "compensation-ceiling-exceeded",
      fiscalYear,
      cumulativeEntitlement: error.figures.cumulativeEntitlement,
      cumulativePaid: error.figures.cumulativePaid,
      payableNow: error.figures.payableNow,
    });
  }
  if (error instanceof z.ZodError) return recordMovementPath({ error: "invalid-form", fiscalYear });
  if (!(error instanceof Error)) return recordMovementPath({ error: "action-failed", fiscalYear });
  if (error.message === "compensation_idempotency_conflict") {
    return recordMovementPath({ error: "compensation-request-conflict", fiscalYear });
  }
  if (error.message === "compensation_account_unavailable") {
    return recordMovementPath({ error: "account-unavailable", fiscalYear });
  }
  if (error.message === "compensation_actor_not_active_treasurer") {
    return recordMovementPath({ error: "compensation-actor-invalid", fiscalYear });
  }
  if (
    error.message === "compensation_amount_invalid"
    || error.message === "compensation_date_invalid"
    || error.message === "compensation_fiscal_year_invalid"
    || error.message === "compensation_payout_fiscal_year_mismatch"
  ) {
    return recordMovementPath({ error: "invalid-form", fiscalYear });
  }
  return recordMovementPath({ error: "action-failed", fiscalYear });
}

function revalidateMovementSurfaces() {
  revalidatePath(ROUTE_SCR_HISTORY);
  revalidatePath(ROUTE_HOME);
  revalidatePath(ROUTE_SCR_CASH_FLOW_PROJECTION);
  revalidatePath(ROUTE_SCR_RECORD_MOVEMENT);
}

function successPath(input: { saved: "expense" | "transfer"; category: string; amount: string }) {
  return recordMovementPath({
    saved: input.saved,
    category: input.category,
    currency: "USD",
    amount: input.amount,
  });
}

async function cleanupUploadedSlip(input: {
  service: ReturnType<typeof createMovementService>;
  orgId: string;
  actorId: string;
  uploaded: Awaited<ReturnType<typeof uploadExpenseSlip>>;
}) {
  let referenced: boolean;
  try {
    referenced = await input.service.isExpenseSlipUriReferenced(input.orgId, input.uploaded.uri);
  } catch {
    await input.service.recordBlobCleanupRequired({
      orgId: input.orgId,
      actorId: input.actorId,
      uri: input.uploaded.uri,
      contentHash: input.uploaded.contentHash,
      reason: "reference_check_failed",
    });
    return;
  }
  if (referenced) return;
  try {
    await deleteExpenseSlip(input.uploaded.uri);
  } catch {
    await input.service.recordBlobCleanupRequired({
      orgId: input.orgId,
      actorId: input.actorId,
      uri: input.uploaded.uri,
      contentHash: input.uploaded.contentHash,
      reason: "delete_failed",
    });
  }
}

export async function recordExpenseAction(formData: FormData) {
  const session = await requireTreasurer();
  const service = createMovementService();
  let result: Awaited<ReturnType<ReturnType<typeof createMovementService>["recordExpense"]>>;
  let uploadedSlip: Awaited<ReturnType<typeof uploadExpenseSlip>> | undefined;
  try {
    const parsed = expenseSchema.parse(parseScalarFields(formData, [
      "accountId",
      "category",
      "amount",
      "datedOn",
      "notes",
      "clientRequestId",
    ], { allowSlip: true }));
    const slipFile = expenseSlipFile(formData);
    uploadedSlip = slipFile ? await uploadExpenseSlip({
      orgId: session.orgId,
      clientRequestId: parsed.clientRequestId,
      file: slipFile,
    }) : undefined;
    result = await service.recordExpense({
      ...parsed,
      orgId: session.orgId,
      actorId: session.actorId,
      slipPhoto: uploadedSlip,
    });
  } catch (error) {
    if (uploadedSlip) {
      await cleanupUploadedSlip({
        service,
        orgId: session.orgId,
        actorId: session.actorId,
        uploaded: uploadedSlip,
      });
    }
    redirect(`${ROUTE_SCR_RECORD_MOVEMENT}?error=${movementErrorCode(error)}`);
  }

  if (uploadedSlip) {
    await cleanupUploadedSlip({
      service,
      orgId: session.orgId,
      actorId: session.actorId,
      uploaded: uploadedSlip,
    });
  }

  revalidateMovementSurfaces();
  redirect(successPath({ saved: "expense", category: result.category, amount: String(result.amount) }));
}

export async function recordTransferAction(formData: FormData) {
  const session = await requireTreasurer();
  let result: Awaited<ReturnType<ReturnType<typeof createMovementService>["recordTransfer"]>>;
  try {
    const parsed = transferSchema.parse(parseScalarFields(formData, [
      "fromAccountId",
      "toAccountId",
      "amount",
      "datedOn",
      "notes",
      "clientRequestId",
    ]));
    result = await createMovementService().recordTransfer({
      ...parsed,
      orgId: session.orgId,
      actorId: session.actorId,
    });
  } catch (error) {
    redirect(`${ROUTE_SCR_RECORD_MOVEMENT}?error=${movementErrorCode(error)}`);
  }

  revalidateMovementSurfaces();
  redirect(successPath({ saved: "transfer", category: "transfer", amount: String(result.amount) }));
}

export async function recordTreasurerCompensationAction(formData: FormData) {
  const session = await requireTreasurer();
  const redirectFiscalYear = validatedFiscalYear(formData);
  let saved: {
    result: Awaited<ReturnType<ReturnType<typeof createTreasurerCompensationService>["recordPayout"]>>;
    fiscalYear: number;
  };
  try {
    const parsed = treasurerCompensationSchema.parse(parseScalarFields(formData, [
      "fiscalYear",
      "accountId",
      "amount",
      "datedOn",
      "notes",
      "clientRequestId",
    ]));
    const result = await createTreasurerCompensationService().recordPayout({
      ...parsed,
      orgId: session.orgId,
      actorId: session.actorId,
    });
    saved = { result, fiscalYear: parsed.fiscalYear };
  } catch (error) {
    redirect(compensationErrorPath(error, redirectFiscalYear));
  }

  revalidateMovementSurfaces();
  redirect(recordMovementPath({
    saved: "expense",
    category: "treasurer_comp_payout",
    currency: "USD",
    amount: String(saved.result.amount),
    fiscalYear: saved.fiscalYear,
  }));
}

export async function regularizePendingDepositAction(formData: FormData) {
  const session = await requireTreasurer();
  let result: Awaited<ReturnType<ReturnType<typeof createMovementService>["regularizePendingDeposit"]>>;
  try {
    const parsed = regularizationSchema.parse(parseScalarFields(formData, [
      "regularizesKind",
      "regularizesId",
      "toAccountId",
      "amount",
      "datedOn",
      "notes",
      "clientRequestId",
      "confirmed",
    ]));
    result = await createMovementService().regularizePendingDeposit({
      ...parsed,
      orgId: session.orgId,
      actorId: session.actorId,
    });
  } catch (error) {
    redirect(`${ROUTE_SCR_RECORD_MOVEMENT}?error=${movementErrorCode(error)}`);
  }

  revalidateMovementSurfaces();
  revalidatePath("/cierre");
  revalidatePath("/socias");
  revalidatePath("/estados");
  redirect(successPath({ saved: "transfer", category: "regularization", amount: String(result.transfer.amount) }));
}
