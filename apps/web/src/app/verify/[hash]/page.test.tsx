import "@testing-library/jest-dom/vitest";

import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { fireEvent, render, screen } from "@testing-library/react";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { organization, statementArchive } from "@mi-banquito/db/schema";
import { canonicalJson, sha256Hex } from "@mi-banquito/domain";

import VerifyStatementPage from "./page";
import { verifyAnotherStatementAction } from "./actions";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile("../../.env.local");
  } catch {
    // beforeAll reports the required real-PostgreSQL boundary.
  }
}

const ORG_ID = randomUUID();
const ARCHIVE_ID = randomUUID();
const TAMPERED_ARCHIVE_ID = randomUUID();
const GENERATED_AT = new Date("2026-07-31T15:30:00.000Z");
const payload = {
  kind: "monthly_member",
  orgName: "Grupo <script>alert('x')</script>",
  periodLabel: "2026-07",
  member: { id: randomUUID(), displayName: "Nombre privado" },
  verificationMovements: [{
    sourceKind: "expense" as const,
    sourceId: "11111111-1111-4111-8111-111111111111",
    datedOn: "2026-07-10",
    memberId: null,
    collectionId: null,
    category: "bank_fee",
    label: "Comisión <img src=x onerror=alert(1)>",
    signedAmount: "-3.5000",
    reconciliationStatus: null,
    reversesId: null,
    accountName: "Banco del grupo",
  }, {
    sourceKind: "collection_line" as const,
    sourceId: "22222222-2222-4222-8222-222222222222",
    datedOn: "2026-07-11",
    memberId: randomUUID(),
    collectionId: randomUUID(),
    category: "solidarity",
    label: "Corrección de colecta",
    signedAmount: "-10.0000",
    reconciliationStatus: "regularized" as const,
    reversesId: "33333333-3333-4333-8333-333333333333",
    accountName: "Banco del grupo",
  }],
};
const HASH = sha256Hex(canonicalJson(payload));
const TAMPERED_HASH = "e".repeat(64);

let db: typeof import("@mi-banquito/db")["db"];

describe("SCR-public-verify-pdf real archive page", () => {
  beforeAll(async () => {
    expect(process.env.DATABASE_URL, "real PostgreSQL is required").toBeTruthy();
    ({ db } = await import("@mi-banquito/db"));
    await db.insert(organization).values({
      id: ORG_ID,
      displayName: "Grupo verificador",
      countryCode: "EC",
      currencyCode: "USD",
      timezone: "America/Guayaquil",
      defaultLanguage: "es-EC",
      status: "active",
      createdAt: GENERATED_AT,
      createdBy: randomUUID(),
      createdByKind: "system",
    });
    await db.insert(statementArchive).values([{
        id: ARCHIVE_ID,
        orgId: ORG_ID,
        kind: "monthly_member",
        memberId: null,
        periodLabel: "2026-07",
        pdfUri: `/statement-archive/public/${HASH}.pdf`,
        canonicalPayloadHash: HASH,
        canonicalPayload: payload,
        generatedAt: GENERATED_AT,
        byteSize: 100,
        createdAt: GENERATED_AT,
        createdByKind: "system",
      }, {
        id: TAMPERED_ARCHIVE_ID,
        orgId: ORG_ID,
        kind: "monthly_member",
        memberId: null,
        periodLabel: "2026-06",
        pdfUri: `/statement-archive/public/${TAMPERED_HASH}.pdf`,
        canonicalPayloadHash: TAMPERED_HASH,
        canonicalPayload: { ...payload, periodLabel: "2026-06" },
        generatedAt: GENERATED_AT,
        byteSize: 100,
        createdAt: GENERATED_AT,
        createdByKind: "system",
      }]);
  });

  afterAll(async () => {
    if (!db) return;
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(statementArchive).where(eq(statementArchive.orgId, ORG_ID));
      await tx.delete(organization).where(eq(organization.id, ORG_ID));
    });
  });

  it("renders every archived canonical movement publicly without exposing member identity", async () => {
    render(await VerifyStatementPage({ params: Promise.resolve({ hash: HASH.toUpperCase() }) }));

    expect(screen.getByRole("main")).toHaveAttribute("data-screen", "SCR-public-verify-pdf");
    for (const sectionId of [
      "public_header", "verify_input", "result_banner", "qr_scan_hint", "verify_result", "pdf_preview", "movements_transparency",
    ]) expect(screen.getByTestId(sectionId)).toBeInTheDocument();
    expect(screen.getByLabelText("Código de verificación")).toHaveValue(HASH);
    expect(screen.getByTestId("hash")).toBe(screen.getByLabelText("Código de verificación"));
    expect(screen.getByTestId("btn_verify")).toBe(screen.getByRole("button", { name: "Verificar otro código" }));
    fireEvent.change(screen.getByTestId("hash"), { target: { value: "A".repeat(64) } });
    expect(screen.getByTestId("hash")).toHaveValue("A".repeat(64));
    expect(screen.getByRole("link", { name: "Abrir PDF archivado" })).toHaveAttribute(
      "href", `/statement-archive/public/${HASH}.pdf`,
    );
    expect(screen.getByText("Grupo <script>alert('x')</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("Comisión <img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("USD -3.50")).toBeInTheDocument();
    expect(screen.getByText("Reverso · Corrección de colecta")).toBeInTheDocument();
    expect(screen.getByText("USD -10.00")).toBeInTheDocument();
    expect(screen.getByText(/33333333-3333-4333-8333-333333333333/)).toBeInTheDocument();
    expect(screen.queryByText("Nombre privado")).not.toBeInTheDocument();
  });

  it("validates pasted hashes and redirects only through the public route constant", async () => {
    const invalid = new FormData();
    invalid.set("currentHash", HASH);
    invalid.set("hash", "javascript:alert(1)");
    await expect(verifyAnotherStatementAction(invalid)).rejects.toMatchObject({
      digest: expect.stringContaining(`/verify/${HASH}?verifyError=invalid-hash`),
    });

    const valid = new FormData();
    valid.set("currentHash", HASH);
    valid.set("hash", "A".repeat(64));
    await expect(verifyAnotherStatementAction(valid)).rejects.toMatchObject({
      digest: expect.stringContaining(`/verify/${"a".repeat(64)}`),
    });

    render(await VerifyStatementPage({
      params: Promise.resolve({ hash: HASH }),
      searchParams: Promise.resolve({ verifyError: "invalid-hash" }),
    }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe un código hexadecimal de 64 caracteres.");
  });

  it("returns not-found for invalid, unmatched, or tampered archive hashes", async () => {
    await expect(VerifyStatementPage({ params: Promise.resolve({ hash: "not-a-hash" }) }))
      .rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    await expect(VerifyStatementPage({ params: Promise.resolve({ hash: "f".repeat(64) }) }))
      .rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);

    await expect(VerifyStatementPage({ params: Promise.resolve({ hash: TAMPERED_HASH }) }))
      .rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});
