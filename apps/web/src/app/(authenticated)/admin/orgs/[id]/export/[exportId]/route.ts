import { NextResponse } from "next/server";

import { requirePlatformOperator } from "@/lib/auth/require-session";
import { loadTenantExportDownload } from "@/lib/admin-export-service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; exportId: string }> }) {
  await requirePlatformOperator();
  const { id, exportId } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(exportId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
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
