"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAccountsService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";

const saveFormSchema = z.object({
  id: z.union([z.literal(""), z.string().uuid()]).transform((value) => value || undefined),
  clientRequestId: z.string().uuid(),
  name: z.string(),
  type: z.enum(["group_bank", "cash_box", "treasurer_personal", "external"]),
  isGroupFund: z.enum(["", "true", "false"]).transform((value) => value === "" ? undefined : value === "true"),
  last4: z.union([z.literal(""), z.string().regex(/^\d{4}$/)]),
}).strict();

const archiveFormSchema = z.object({ id: z.string().uuid() }).strict();

function errorCode(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "account_name_required") return "name-required";
    if (error.message === "account_last4_invalid") return "last4-invalid";
    if (error.message === "account_not_found") return "account-not-found";
    if (error.message === "account_idempotency_conflict") return "idempotency-conflict";
  }
  return error instanceof z.ZodError ? "invalid-form" : "action-failed";
}

function scalarFields(formData: FormData, keys: readonly string[]): Record<string, string> {
  const allowed = new Set(keys);
  for (const key of formData.keys()) {
    if (!allowed.has(key)) throw new z.ZodError([]);
  }
  return Object.fromEntries(keys.map((key) => {
    const values = formData.getAll(key);
    if (values.length > 1 || (values[0] !== undefined && typeof values[0] !== "string")) {
      throw new z.ZodError([]);
    }
    return [key, values[0] ?? ""];
  }));
}

export async function saveAccountAction(formData: FormData) {
  const session = await requireTreasurer();
  let id: string | undefined;

  try {
    const parsed = saveFormSchema.parse(scalarFields(formData, [
      "id",
      "clientRequestId",
      "name",
      "type",
      "isGroupFund",
      "last4",
    ]));
    id = parsed.id;
    await createAccountsService().saveAccount({
      ...parsed,
      orgId: session.orgId,
      actorId: session.actorId,
    });
  } catch (error) {
    redirect(`/cuentas?error=${errorCode(error)}`);
  }

  revalidatePath("/cuentas");
  redirect(`/cuentas?saved=${id ? "updated" : "created"}`);
}

export async function deactivateAccountAction(formData: FormData) {
  const session = await requireTreasurer();

  try {
    const { id } = archiveFormSchema.parse(scalarFields(formData, ["id"]));
    await createAccountsService().deactivateAccount({
      id,
      orgId: session.orgId,
      actorId: session.actorId,
    });
  } catch (error) {
    redirect(`/cuentas?error=${errorCode(error)}`);
  }

  revalidatePath("/cuentas");
  redirect("/cuentas?archived=1");
}
