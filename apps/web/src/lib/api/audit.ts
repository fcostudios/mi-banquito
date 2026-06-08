/**
 * API client for the audit bounded context.
 * Uses the shared authenticated client — never use raw fetch().
 *
 * DATA GAP (IMP-246 / R4): endpoint:0 / service:0 in nous.db — real
 * endpoint signatures could not be scaffolded. This is a NAME-only
 * CRUD stub (correct context name + prefix). TODO: replace these
 * generic CRUD signatures with the real endpoint signatures once the
 * deep-RE endpoint/service analyzers populate them.
 */
import { apiGet, apiPost, apiPatch, apiDelete } from "./client";

const PREFIX = "/api/v1/audit";

export async function listAudit() {
  return apiGet(`${PREFIX}`);
}

export async function getAudit(id: string) {
  return apiGet(`${PREFIX}/${id}`);
}

export async function createAudit(data: unknown) {
  return apiPost(`${PREFIX}`, data);
}

export async function updateAudit(id: string, data: unknown) {
  return apiPatch(`${PREFIX}/${id}`, data);
}

export async function deleteAudit(id: string) {
  return apiDelete(`${PREFIX}/${id}`);
}
