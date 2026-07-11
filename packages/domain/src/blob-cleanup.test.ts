import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { account, alert, alertAction, auditLogEntry, expense, organization, slipPhoto } from "@mi-banquito/db/schema";

if (!process.env.DATABASE_URL) {
  try { loadEnvFile("../../apps/web/.env.local"); } catch { /* reported in beforeAll */ }
}

const ORG_ID = randomUUID();
const ORG_B = randomUUID();
const ACTOR_ID = randomUUID();
const NOW = new Date("2026-07-11T18:00:00.000Z");
let db: typeof import("@mi-banquito/db")["db"];
let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
let createBlobCleanupService: typeof import("./blob-cleanup")["createBlobCleanupService"];

function blobCandidate(input: {
  orgId?: string;
  uploadedAt?: Date;
  contentHash?: string;
} = {}) {
  const orgId = input.orgId ?? ORG_ID;
  const contentHash = input.contentHash ?? "d".repeat(64);
  const pathname = `expense-slip-candidates/${orgId}/${randomUUID()}/${randomUUID()}-${contentHash}.png`;
  return {
    url: `https://private.blob.invalid/${pathname}`,
    downloadUrl: `https://private.blob.invalid/${pathname}?download=1`,
    pathname,
    size: 68,
    uploadedAt: input.uploadedAt ?? new Date("2026-07-10T17:59:59.000Z"),
    etag: randomUUID(),
  };
}

function onePage(blobs: ReturnType<typeof blobCandidate>[]) {
  return vi.fn(async () => ({ blobs, hasMore: false }));
}

async function seedCleanupAlert(uri: string) {
  const [row] = await withTenantTransaction(ORG_ID, (tx) => tx.insert(alert).values({
    orgId: ORG_ID,
    alertKind: "blob_cleanup_required",
    severity: "high",
    audience: "treasurer",
    subjectKind: "expense_slip",
    subjectId: randomUUID(),
    payload: { uri, contentHash: "a".repeat(64), reason: "delete_failed", actorId: ACTOR_ID },
    dedupWindowEnd: new Date("2026-07-12T18:00:00.000Z"),
    createdAt: NOW,
  }).returning());
  if (!row) throw new Error("test_alert_not_created");
  return row;
}

describe("blob cleanup recovery", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for blob cleanup integration tests");
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    ({ createBlobCleanupService } = await import("./blob-cleanup"));
    await db.insert(organization).values({
      id: ORG_ID, displayName: "Blob cleanup test", countryCode: "EC", currencyCode: "USD",
      timezone: "America/Guayaquil", defaultLanguage: "es-EC", status: "active",
      createdAt: NOW, createdBy: ACTOR_ID, createdByKind: "system",
    });
    await db.insert(organization).values({
      id: ORG_B, displayName: "Blob cleanup test B", countryCode: "EC", currencyCode: "USD",
      timezone: "America/Guayaquil", defaultLanguage: "es-EC", status: "active",
      createdAt: NOW, createdBy: ACTOR_ID, createdByKind: "system",
    });
  });

  afterAll(async () => {
    if (!db) return;
    await withTenantTransaction(ORG_ID, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(alertAction).where(eq(alertAction.orgId, ORG_ID));
      await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_ID));
      await tx.delete(expense).where(eq(expense.orgId, ORG_ID));
      await tx.delete(slipPhoto).where(eq(slipPhoto.orgId, ORG_ID));
      await tx.delete(account).where(eq(account.orgId, ORG_ID));
      await tx.delete(alert).where(eq(alert.orgId, ORG_ID));
    });
    await withTenantTransaction(ORG_B, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(alertAction).where(eq(alertAction.orgId, ORG_B));
      await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_B));
      await tx.delete(expense).where(eq(expense.orgId, ORG_B));
      await tx.delete(slipPhoto).where(eq(slipPhoto.orgId, ORG_B));
      await tx.delete(account).where(eq(account.orgId, ORG_B));
      await tx.delete(alert).where(eq(alert.orgId, ORG_B));
    });
    await db.delete(organization).where(eq(organization.id, ORG_ID));
    await db.delete(organization).where(eq(organization.id, ORG_B));
  });

  it("preserves referenced evidence and resolves its cleanup alert without deletion", async () => {
    const candidate = blobCandidate({ contentHash: "b".repeat(64) });
    const uri = candidate.url;
    const [source] = await withTenantTransaction(ORG_ID, (tx) => tx.insert(account).values({
      orgId: ORG_ID, name: "Cleanup source", type: "group_bank", isGroupFund: true,
      status: "active", createdAt: NOW, createdBy: ACTOR_ID,
    }).returning());
    const expenseId = randomUUID();
    const [evidence] = await withTenantTransaction(ORG_ID, (tx) => tx.insert(slipPhoto).values({
      orgId: ORG_ID, uri, mimeType: "image/png", byteSize: 68, contentHash: "b".repeat(64),
      attachedToKind: "expense", attachedToId: expenseId, uploadedAt: NOW,
      uploadedBy: ACTOR_ID, uploadedByKind: "member",
    }).returning());
    await withTenantTransaction(ORG_ID, async (tx) => {
      await tx.insert(expense).values({
        id: expenseId, orgId: ORG_ID, purpose: "supplies", notes: null, amount: "1.0000",
        currencyCode: "USD", incurredOn: "2026-07-11", status: "paid", recordedAt: NOW,
        accountId: source?.id, category: "supplies", slipPhotoId: evidence?.id,
        createdAt: NOW, createdBy: ACTOR_ID, createdByKind: "member",
      });
    });
    const cleanupAlert = await seedCleanupAlert(uri);
    const deleteBlob = vi.fn();

    const options = { deleteBlob, listBlobs: onePage([candidate]), now: () => NOW, orgId: ORG_ID };
    const summary = await createBlobCleanupService(options).run();

    expect(deleteBlob).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ preservedReferenced: 1, deleted: 0, failed: 0 });
    const actions = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(alertAction)
      .where(and(eq(alertAction.orgId, ORG_ID), eq(alertAction.alertId, cleanupAlert.id))));
    expect(actions).toEqual([expect.objectContaining({
      actionKind: "dismiss",
      actorKind: "system",
      reason: "blob_cleanup_referenced",
    })]);
  });

  it("persists retry metadata and audit, retries deletion, then becomes idempotent", async () => {
    const candidate = blobCandidate();
    const uri = candidate.url;
    const cleanupAlert = await seedCleanupAlert(uri);
    const deleteBlob = vi.fn()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValue(undefined);
    let blobs = [candidate];
    const listBlobs = vi.fn(async () => ({ blobs, hasMore: false }));
    const wrappedDelete = vi.fn(async (url: string) => {
      await deleteBlob(url);
      blobs = blobs.filter((blob) => blob.url !== url);
    });
    const options = { deleteBlob: wrappedDelete, listBlobs, now: () => NOW, orgId: ORG_ID };
    const service = createBlobCleanupService(options);

    await expect(service.run()).resolves.toMatchObject({ failed: 1, deleted: 0 });
    const failedAudits = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, ORG_ID), eq(auditLogEntry.actionKind, "blob.cleanup.failed"),
    )));
    expect(failedAudits).toEqual([expect.objectContaining({
      subjectId: cleanupAlert.id,
      payloadSnapshot: expect.objectContaining({
        attemptCount: 1,
        error: "blob_cleanup_delete_failed",
      }),
    })]);

    await expect(service.run()).resolves.toMatchObject({ failed: 0, deleted: 1 });
    await expect(service.run()).resolves.toMatchObject({ scanned: 0, deleted: 0 });
    expect(deleteBlob).toHaveBeenCalledTimes(2);
    const actions = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(alertAction).where(and(
      eq(alertAction.orgId, ORG_ID), eq(alertAction.alertId, cleanupAlert.id),
    )));
    expect(actions).toHaveLength(1);
    const successAudits = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, ORG_ID),
      eq(auditLogEntry.actionKind, "blob.cleanup.succeeded"),
      eq(auditLogEntry.subjectId, cleanupAlert.id),
    )));
    expect(successAudits).toHaveLength(1);
  });

  it("discovers and deletes an aged outage orphan even when no cleanup alert was persisted", async () => {
    const recoveringOrgId = randomUUID();
    const candidate = blobCandidate({ orgId: recoveringOrgId });
    let blobs = [candidate];
    const listBlobs = vi.fn(async () => ({ blobs, hasMore: false }));
    const deleteBlob = vi.fn(async (url: string) => {
      blobs = blobs.filter((blob) => blob.url !== url);
    });
    const options = { listBlobs, deleteBlob, now: () => NOW, orgId: recoveringOrgId };
    const service = createBlobCleanupService(options);

    await expect(service.run()).resolves.toMatchObject({ scanned: 1, deleted: 0, failed: 1 });
    expect(deleteBlob).not.toHaveBeenCalled();

    await db.insert(organization).values({
      id: recoveringOrgId,
      displayName: "Recovered Blob cleanup tenant",
      countryCode: "EC",
      currencyCode: "USD",
      timezone: "America/Guayaquil",
      defaultLanguage: "es-EC",
      status: "active",
      createdAt: NOW,
      createdBy: ACTOR_ID,
      createdByKind: "system",
    });
    try {
      await expect(service.run()).resolves.toMatchObject({ scanned: 1, deleted: 1, failed: 0 });
      await expect(service.run()).resolves.toMatchObject({ scanned: 0, deleted: 0, failed: 0 });
    } finally {
      await db.delete(organization).where(eq(organization.id, recoveringOrgId));
    }

    expect(deleteBlob).toHaveBeenCalledTimes(1);
    expect(deleteBlob).toHaveBeenCalledWith(candidate.url);
  });

  it("walks every candidate page and protects objects younger than the minimum age", async () => {
    const first = blobCandidate();
    const second = blobCandidate();
    const young = blobCandidate({ uploadedAt: new Date("2026-07-11T17:30:00.000Z") });
    const listBlobs = vi.fn(async ({ cursor }: { cursor?: string }) => cursor
      ? { blobs: [second, young], hasMore: false }
      : { blobs: [first], cursor: "page-two", hasMore: true });
    const deleteBlob = vi.fn(async () => undefined);
    const options = { listBlobs, deleteBlob, now: () => NOW, orgId: ORG_ID };

    await expect(createBlobCleanupService(options).run())
      .resolves.toMatchObject({ scanned: 2, deleted: 2, failed: 0 });

    expect(listBlobs).toHaveBeenNthCalledWith(1, expect.objectContaining({
      prefix: "expense-slip-candidates/",
      cursor: undefined,
    }));
    expect(listBlobs).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "page-two" }));
    expect(deleteBlob).toHaveBeenCalledWith(first.url);
    expect(deleteBlob).toHaveBeenCalledWith(second.url);
    expect(deleteBlob).not.toHaveBeenCalledWith(young.url);
  });

  it("keeps parallel tenant-scoped cleanup runs isolated", async () => {
    const candidateA = blobCandidate({ orgId: ORG_ID });
    const candidateB = blobCandidate({ orgId: ORG_B });
    const listBlobs = onePage([candidateA, candidateB]);
    const deletedByA: string[] = [];
    const deletedByB: string[] = [];
    const optionsA = {
      listBlobs,
      deleteBlob: async (url: string) => { deletedByA.push(url); },
      now: () => NOW,
      orgId: ORG_ID,
    };
    const optionsB = {
      listBlobs,
      deleteBlob: async (url: string) => { deletedByB.push(url); },
      now: () => NOW,
      orgId: ORG_B,
    };

    const [summaryA, summaryB] = await Promise.all([
      createBlobCleanupService(optionsA).run(),
      createBlobCleanupService(optionsB).run(),
    ]);

    expect(summaryA).toMatchObject({ orgsScanned: 1, scanned: 1, deleted: 1, failed: 0 });
    expect(summaryB).toMatchObject({ orgsScanned: 1, scanned: 1, deleted: 1, failed: 0 });
    expect(deletedByA).toEqual([candidateA.url]);
    expect(deletedByB).toEqual([candidateB.url]);
  });
});
