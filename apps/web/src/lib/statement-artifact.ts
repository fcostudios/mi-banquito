import { Buffer } from "node:buffer";
import { get, put } from "@vercel/blob";

export type StatementArtifactInput = {
  orgId: string;
  canonicalPayloadHash: string;
  pdfBytes: Uint8Array | Blob;
  folder: "monthly-close" | "monthly-member" | "year-end";
};

export async function writePrivateStatementArtifact(input: StatementArtifactInput) {
  const pathname = `${input.folder}/${input.orgId}/${input.canonicalPayloadHash}.pdf`;
  const byteSize = input.pdfBytes instanceof Blob ? input.pdfBytes.size : input.pdfBytes.byteLength;
  const body = input.pdfBytes instanceof Blob
    ? input.pdfBytes
    : Buffer.from(input.pdfBytes);
  const blob = await put(pathname, body, {
    access: "private",
    contentType: "application/pdf",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return {
    blobUrl: blob.url,
    pathname,
    pdfUri: `/statement-archive/public/${input.canonicalPayloadHash}.pdf`,
    byteSize,
  };
}

export async function readPrivateStatementArtifact(pathname: string) {
  return get(pathname, { access: "private" });
}

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

export function buildFallbackStatementPdf(lines: string[]) {
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
