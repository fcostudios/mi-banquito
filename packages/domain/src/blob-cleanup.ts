import { and, eq, notExists, sql } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import { alert, alertAction, auditLogEntry, expense, organization, slipPhoto } from "@mi-banquito/db/schema";
import { withWritableTenantTransaction } from "@mi-banquito/db/tenant";

const SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000000";
const MINIMUM_CANDIDATE_AGE_MS = 24 * 60 * 60 * 1_000;
const LIST_LIMIT = 1_000;
export const EXPENSE_SLIP_CANDIDATE_PREFIX = "expense-slip-candidates/";

type CleanupPayload = {
  uri?: unknown;
  [key: string]: unknown;
};

export type BlobCleanupCandidate = {
  url: string;
  downloadUrl: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
  etag: string;
};

export type BlobCleanupPage = {
  blobs: BlobCleanupCandidate[];
  cursor?: string;
  hasMore: boolean;
};

export type BlobCleanupSummary = {
  orgsScanned: number;
  scanned: number;
  deleted: number;
  preservedReferenced: number;
  failed: number;
};

function payloadObject(value: unknown): CleanupPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as CleanupPayload : {};
}

function uriFromPayload(value: unknown): string | null {
  const uri = payloadObject(value).uri;
  return typeof uri === "string" && uri.trim() ? uri : null;
}

function candidateIdentity(pathname: string): { orgId: string; contentHash: string } | null {
  const escapedPrefix = EXPENSE_SLIP_CANDIDATE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `^${escapedPrefix}([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/`
    + "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/"
    + "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-"
    + "([a-f0-9]{64})\\.(?:jpg|png|webp)$",
  ).exec(pathname);
  return match?.[1] && match[2] ? { orgId: match[1], contentHash: match[2] } : null;
}

export function createBlobCleanupService(input: {
  deleteBlob: (uri: string) => Promise<void>;
  listBlobs: (input: { prefix: string; cursor?: string; limit: number }) => Promise<BlobCleanupPage>;
  now?: () => Date;
  orgId?: string;
}) {
  const now = input.now ?? (() => new Date());

  function unresolvedAlert(orgId: string) {
    return notExists(
      db.select({ id: alertAction.id }).from(alertAction).where(and(
        eq(alertAction.orgId, orgId),
        eq(alertAction.alertId, alert.id),
        eq(alertAction.actionKind, "dismiss"),
      )),
    );
  }

  async function processCandidate(
    candidate: BlobCleanupCandidate,
    identity: { orgId: string; contentHash: string },
  ): Promise<"deleted" | "referenced" | "failed"> {
    return withWritableTenantTransaction(identity.orgId, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`blob-cleanup:${candidate.pathname}`}, 0))`);
      const [tenant] = await tx.select({ id: organization.id }).from(organization).where(and(
        eq(organization.id, identity.orgId),
        eq(organization.status, "active"),
      )).limit(1);
      if (!tenant) return "failed";

      const pendingAlerts = (await tx.select().from(alert).where(and(
        eq(alert.orgId, identity.orgId),
        eq(alert.alertKind, "blob_cleanup_required"),
        unresolvedAlert(identity.orgId),
      ))).filter((row) => uriFromPayload(row.payload) === candidate.url);
      const timestamp = now();
      const recordFailure = async (error: "blob_cleanup_delete_failed" | "blob_cleanup_reference_ambiguous") => {
        for (const pending of pendingAlerts) {
          const [failureCount] = await tx.select({ value: sql<number>`count(*)::int` })
            .from(auditLogEntry).where(and(
              eq(auditLogEntry.orgId, identity.orgId),
              eq(auditLogEntry.subjectId, pending.id),
              eq(auditLogEntry.actionKind, "blob.cleanup.failed"),
            ));
          await tx.insert(auditLogEntry).values({
            orgId: identity.orgId,
            actorKind: "system",
            actorId: SYSTEM_ACTOR_ID,
            actionKind: "blob.cleanup.failed",
            subjectKind: "alert",
            subjectId: pending.id,
            payloadSnapshot: {
              uri: candidate.url,
              attemptCount: Number(failureCount?.value ?? 0) + 1,
              error,
            },
            reason: null,
            at: timestamp,
            createdAt: timestamp,
          });
        }
      };
      const resolveAlerts = async (resolution: "deleted" | "referenced") => {
        for (const pending of pendingAlerts) {
          await tx.insert(alertAction).values({
            orgId: identity.orgId,
            alertId: pending.id,
            actionKind: "dismiss",
            snoozedUntil: null,
            actorId: SYSTEM_ACTOR_ID,
            actorKind: "system",
            reason: `blob_cleanup_${resolution}`,
            createdAt: timestamp,
          });
          await tx.insert(auditLogEntry).values({
            orgId: identity.orgId,
            actorKind: "system",
            actorId: SYSTEM_ACTOR_ID,
            actionKind: "blob.cleanup.succeeded",
            subjectKind: "alert",
            subjectId: pending.id,
            payloadSnapshot: { uri: candidate.url, resolution },
            reason: null,
            at: timestamp,
            createdAt: timestamp,
          });
        }
      };

      const [storedSlip] = await tx.select().from(slipPhoto).where(and(
        eq(slipPhoto.orgId, identity.orgId),
        eq(slipPhoto.uri, candidate.url),
      )).limit(1);
      if (storedSlip) {
        const [referencedExpense] = await tx.select({
          id: expense.id,
          createdBy: expense.createdBy,
        }).from(expense).where(and(
          eq(expense.orgId, identity.orgId),
          eq(expense.id, storedSlip.attachedToId),
          eq(expense.slipPhotoId, storedSlip.id),
        )).limit(1);
        const exactReference = storedSlip.attachedToKind === "expense"
          && storedSlip.contentHash === identity.contentHash
          && storedSlip.byteSize === candidate.size
          && referencedExpense?.id === storedSlip.attachedToId
          && referencedExpense.createdBy === storedSlip.uploadedBy;
        if (exactReference) {
          await resolveAlerts("referenced");
          return "referenced";
        }
        await recordFailure("blob_cleanup_reference_ambiguous");
        return "failed";
      }

      try {
        await input.deleteBlob(candidate.url);
      } catch {
        await recordFailure("blob_cleanup_delete_failed");
        return "failed";
      }
      await resolveAlerts("deleted");
      return "deleted";
    });
  }

  return {
    context: "blob-cleanup" as const,
    async run(): Promise<BlobCleanupSummary> {
      const summary: BlobCleanupSummary = {
        orgsScanned: 0,
        scanned: 0,
        deleted: 0,
        preservedReferenced: 0,
        failed: 0,
      };
      const seenPathnames = new Set<string>();
      const scannedOrgs = new Set<string>();
      const seenCursors = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await input.listBlobs({
          prefix: EXPENSE_SLIP_CANDIDATE_PREFIX,
          cursor,
          limit: LIST_LIMIT,
        });
        for (const candidate of page.blobs) {
          if (seenPathnames.has(candidate.pathname)) continue;
          seenPathnames.add(candidate.pathname);
          const identity = candidateIdentity(candidate.pathname);
          if (!identity || (input.orgId && identity.orgId !== input.orgId)) continue;
          if (now().getTime() - candidate.uploadedAt.getTime() < MINIMUM_CANDIDATE_AGE_MS) continue;
          scannedOrgs.add(identity.orgId);
          summary.scanned += 1;
          try {
            const result = await processCandidate(candidate, identity);
            if (result === "deleted") summary.deleted += 1;
            if (result === "referenced") summary.preservedReferenced += 1;
            if (result === "failed") summary.failed += 1;
          } catch {
            summary.failed += 1;
          }
        }
        if (!page.hasMore) break;
        if (!page.cursor || seenCursors.has(page.cursor)) {
          throw new Error("blob_cleanup_pagination_invalid");
        }
        seenCursors.add(page.cursor);
        cursor = page.cursor;
      } while (true);
      summary.orgsScanned = scannedOrgs.size;
      return summary;
    },
  };
}
