"use server";

// addMember (server_action) — TEMPLATE worked example (IMP-268): the
// MUTATION leg of the central seam. Validate untrusted input with the
// @mi-banquito/contracts insert schema (orgId is injected from the session, so it is
// omitted from the client shape), then hand the typed value to the @mi-banquito/domain
// Ledger service. Copy this shape for the screens that declare a server_action; the
// dev team owns the real form wiring. One shape of many.
import { auth0 } from "@/lib/auth0";
import { insertMemberSchema } from "@mi-banquito/contracts";
import { createLedgerService } from "@mi-banquito/domain";

const newMemberSchema = insertMemberSchema.omit({ orgId: true });

export async function addMember(input: unknown) {
  const session = await auth0.getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  const orgId = session.user.org_id as string; // tenant from the session claim
  const parsed = newMemberSchema.parse(input);
  return createLedgerService().createMember(orgId, parsed);
}
