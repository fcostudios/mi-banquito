"use server";

import { redirect } from "next/navigation";
import { verifyHashSchema } from "@mi-banquito/contracts";

import { ROUTE_SCR_PUBLIC_VERIFY_PDF } from "@/lib/routes";

function verifierRoute(hash: string): string {
  return ROUTE_SCR_PUBLIC_VERIFY_PDF.replace("[hash]", hash.toLowerCase());
}

export async function verifyAnotherStatementAction(formData: FormData): Promise<never> {
  const current = verifyHashSchema.safeParse(String(formData.get("currentHash") ?? "").trim());
  if (!current.success) {
    throw new Error("verify_current_hash_invalid");
  }
  const pasted = verifyHashSchema.safeParse(String(formData.get("hash") ?? "").trim());
  if (!pasted.success) {
    redirect(`${verifierRoute(current.data)}?verifyError=invalid-hash`);
  }
  redirect(verifierRoute(pasted.data));
}
