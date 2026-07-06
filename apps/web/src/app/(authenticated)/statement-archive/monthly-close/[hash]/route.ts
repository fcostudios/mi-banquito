import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { withTenantTransaction } from "@mi-banquito/db/tenant";
import { statementArchive } from "@mi-banquito/db/schema";

import { requireTreasurer } from "@/lib/auth/require-session";
import { buildFallbackStatementPdf, readPrivateStatementArtifact } from "@/lib/statement-artifact";

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const session = await requireTreasurer();
  const { hash } = await params;
  const canonicalHash = hash.replace(/\.pdf$/i, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(canonicalHash)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const archive = await withTenantTransaction(session.orgId, async (tx) => {
    const [row] = await tx.select().from(statementArchive)
      .where(and(
        eq(statementArchive.orgId, session.orgId),
        eq(statementArchive.kind, "monthly_close"),
        eq(statementArchive.canonicalPayloadHash, canonicalHash),
      ))
      .limit(1);
    return row;
  });

  if (!archive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pathname = `monthly-close/${archive.orgId}/${archive.canonicalPayloadHash}.pdf`;
  const blob = await readPrivateStatementArtifact(pathname);
  if (blob?.statusCode === 200) {
    return new NextResponse(blob.stream, {
      headers: {
        "content-type": blob.blob.contentType || "application/pdf",
        "content-disposition": `inline; filename="cierre-${archive.periodLabel}.pdf"`,
      },
    });
  }

  const body = buildFallbackStatementPdf([
    "Cierre del mes",
    `Periodo: ${archive.periodLabel}`,
    `Hash: ${archive.canonicalPayloadHash}`,
    `Generado: ${archive.generatedAt instanceof Date ? archive.generatedAt.toISOString() : archive.generatedAt}`,
    `Archivo: ${archive.id}`,
  ]);

  return new NextResponse(body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="cierre-${archive.periodLabel}.pdf"`,
    },
  });
}
