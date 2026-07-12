import { NextResponse } from "next/server";
import { verifyHashSchema } from "@mi-banquito/contracts";
import { createReportingService, verifierResultText, type VerifyResult } from "@mi-banquito/domain";

import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

function wantsHtml(request: Request): boolean {
  return request.headers.get("accept")?.includes("text/html") ?? false;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function renderVerifierHtml(result: VerifyResult): string {
  const text = verifierResultText(result);
  const movements = result.matched && result.movements.length > 0
    ? `<section aria-label="Movimientos transparentes"><h2>Movimientos transparentes</h2><ul>${result.movements.map((row) => `<li>${escapeHtml(row.datedOn)} · ${escapeHtml(row.label)} · USD ${escapeHtml(row.amount)} · ${escapeHtml(row.status)}</li>`).join("")}</ul></section>`
    : "";
  return `<!doctype html>
<html lang="es-EC">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(messages.verifier.title)}</title>
  </head>
  <body>
    <main data-screen="SCR-public-verify-pdf">
      <p>${escapeHtml(messages.app_name)}</p>
      <h1>${escapeHtml(messages.verifier.title)}</h1>
      <p>${escapeHtml(text)}</p>
      ${movements}
    </main>
  </body>
</html>`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const parsed = verifyHashSchema.safeParse(hash);
  if (!parsed.success) {
    const result = { matched: false } as const;
    if (wantsHtml(_request)) {
      return new NextResponse(renderVerifierHtml(result), {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return NextResponse.json(result, { status: 400 });
  }

  const result = await createReportingService().verifyStatementHash(parsed.data.toLowerCase());
  if (wantsHtml(_request)) {
    return new NextResponse(renderVerifierHtml(result), {
      status: result.matched ? 200 : 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.json(result, { status: result.matched ? 200 : 404 });
}
