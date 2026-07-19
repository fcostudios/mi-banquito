import { NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import { requirePlatformOperator } from "@/lib/auth/require-session";
import {
  loadTenantExportDownload,
  loadTenantExportHistory,
  prepareTenantExport,
  verifyTenantExportRequest,
} from "@/lib/admin-export-service";
import {
  redirectToGeneratedExportDownload,
  redirectToTenantExportDownload,
} from "@/lib/admin-export-response";

const UUID = z.string().uuid();

export async function GET(request: Request, { params }: { params: Promise<{ id: string; exportId: string }> }) {
  const session = await requirePlatformOperator();
  const { id, exportId } = await params;
  if (!UUID.safeParse(id).success || !UUID.safeParse(exportId).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const signedRequest = new URL(request.url).searchParams.get("request");
  if (signedRequest) {
    try {
      const verified = verifyTenantExportRequest(signedRequest);
      if (
        verified.orgId !== id ||
        verified.exportId !== exportId ||
        verified.actorId !== session.actorId ||
        verified.operatorUserId !== session.userId
      ) {
        return NextResponse.json({ error: "export_request_invalid" }, { status: 403 });
      }
      console.info("tenant_export.generation_started", { orgId: id, exportId });
      const existingExport = (await loadTenantExportHistory(id)).find((row) => row.id === exportId);
      if (existingExport) {
        console.info("tenant_export.generation_replayed", { orgId: id, exportId });
        return redirectToTenantExportDownload({ requestUrl: request.url, orgId: id, exportId });
      }
      const prepared = await prepareTenantExport({
        orgId: id,
        exportId,
        actorId: session.actorId,
        operatorUserId: session.userId,
      });
      const response = await redirectToGeneratedExportDownload({
        requestUrl: request.url,
        orgId: id,
        exportId,
        stream: prepared.stream,
        completion: prepared.completion,
      });
      console.info("tenant_export.generation_completed", { orgId: id, exportId });
      return response;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("tenant_export_request_")) {
        return NextResponse.json({ error: "export_request_invalid" }, { status: 403 });
      }
      const code = error instanceof Error && error.message.startsWith("statement_artifact_")
        ? "statement_artifact"
        : "generation_failed";
      Sentry.captureException(error, {
        tags: { feature: "tenant_export", phase: "generation" },
        extra: { orgId: id, exportId, code },
      });
      console.error("tenant_export.generation_failed", {
        orgId: id,
        exportId,
        code,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ error: code }, { status: 500 });
    }
  }
  try {
    const result = await loadTenantExportDownload({ orgId: id, exportId });
    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return new NextResponse(result.blob.stream, {
      headers: {
        "content-type": result.blob.blob.contentType || "application/zip",
        "content-disposition": `attachment; filename="tenant-export-${id}.zip"`,
        "content-length": String(result.history.payload.sizeBytes),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "tenant_export_blob_missing") {
      return NextResponse.json({ error: "archive_missing" }, { status: 410 });
    }
    Sentry.captureException(error, {
      tags: { feature: "tenant_export", phase: "download" },
      extra: { orgId: id, exportId },
    });
    console.error("tenant_export.download_failed", {
      orgId: id,
      exportId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
