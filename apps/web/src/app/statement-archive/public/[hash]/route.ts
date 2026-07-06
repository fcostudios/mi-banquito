import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import { statementArchive } from "@mi-banquito/db/schema";

import { readPrivateStatementArtifact } from "@/lib/statement-artifact";

const HASH_RE = /^[a-f0-9]{64}\.pdf$/;

function folderForKind(kind: string): "monthly-close" | "monthly-member" | "year-end" {
  if (kind === "monthly_close") return "monthly-close";
  if (kind === "monthly_member") return "monthly-member";
  return "year-end";
}

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const normalized = hash.toLowerCase();
  if (!HASH_RE.test(normalized)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const canonicalHash = normalized.replace(/\.pdf$/, "");
  const [archive] = await db.select().from(statementArchive)
    .where(eq(statementArchive.canonicalPayloadHash, canonicalHash))
    .limit(1);
  if (!archive) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const folder = folderForKind(archive.kind);
  const blob = await readPrivateStatementArtifact(`${folder}/${archive.orgId}/${archive.canonicalPayloadHash}.pdf`);
  if (blob?.statusCode === 200) {
    return new NextResponse(blob.stream, {
      status: 200,
      headers: {
        "content-type": blob.blob.contentType || "application/pdf",
        "content-disposition": `inline; filename="${archive.kind}-${archive.periodLabel}.pdf"`,
        "cache-control": "private, max-age=300",
      },
    });
  }

  return NextResponse.json({ error: "artifact_not_found" }, { status: 404 });
}
