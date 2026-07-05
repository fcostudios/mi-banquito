import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { withTenantTransaction } from "@mi-banquito/db/tenant";
import { statementArchive } from "@mi-banquito/db/schema";

import { requireTreasurer } from "@/lib/auth/require-session";

function pdfText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function wrapLine(line: string, maxLength = 88) {
  const words = line.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }
  return lines;
}

function buildMonthlyClosePdf(lines: string[]) {
  const encoder = new TextEncoder();
  const contentLines = lines.flatMap((line) => wrapLine(line));
  const stream = [
    "BT",
    "/F1 11 Tf",
    "72 760 Td",
    ...contentLines.flatMap((line, index) => [
      index === 0 ? "" : "0 -16 Td",
      `(${pdfText(line)}) Tj`,
    ]).filter(Boolean),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(encoder.encode(body).length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = encoder.encode(body).length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return encoder.encode(body);
}

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
  const blob = await get(pathname, { access: "private" });
  if (blob?.statusCode === 200) {
    return new NextResponse(blob.stream, {
      headers: {
        "content-type": blob.blob.contentType || "application/pdf",
        "content-disposition": `inline; filename="cierre-${archive.periodLabel}.pdf"`,
      },
    });
  }

  const body = buildMonthlyClosePdf([
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
