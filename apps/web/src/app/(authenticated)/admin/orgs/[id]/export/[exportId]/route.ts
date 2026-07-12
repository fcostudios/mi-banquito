import { after, NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformOperator } from "@/lib/auth/require-session";
import {
  loadTenantExportDownload,
  prepareTenantExport,
  verifyTenantExportRequest,
} from "@/lib/admin-export-service";

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
      const prepared = await prepareTenantExport({
        orgId: id,
        exportId,
        actorId: session.actorId,
        operatorUserId: session.userId,
      });
      after(() => prepared.completion.then(() => undefined, () => undefined));
      return new NextResponse(prepared.stream, {
        headers: {
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="tenant-export-${id}.zip"`,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("tenant_export_request_")) {
        return NextResponse.json({ error: "export_request_invalid" }, { status: 403 });
      }
      const code = error instanceof Error && error.message.startsWith("statement_artifact_")
        ? "statement_artifact"
        : "generation_failed";
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
    throw error;
  }
}
