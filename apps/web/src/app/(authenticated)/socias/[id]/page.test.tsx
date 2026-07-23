import "@testing-library/jest-dom/vitest";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { fireEvent, render, screen } from "@testing-library/react";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { canonicalJson, monthlyMemberStatementPayload, sha256Hex } from "@mi-banquito/domain";
import MemberDetailError from "./error";
import MemberDetailLoading from "./loading";
import { MemberDetailView } from "./member-detail-view";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile("../../.env.local");
  } catch {
    // The integration suite reports missing PostgreSQL configuration explicitly.
  }
}

const previewCopy = {
  monthlySectionTitle: "Estado mensual", openingBalance: "Saldo inicial", contribution: "Aporte {{date}}",
  withdrawal: "Retiro {{date}}", closingBalance: "Saldo final", treasurer: "Tesorera", groupAccount: "Cuenta",
  noGroupAccount: "Sin cuenta", receivedPaymentsTitle: "Pagos", receivedPayment: "Pago {{member}}", loanFee: "Mora",
  loanInterest: "Interes", loanPrincipal: "Capital", contributionAllocation: "Aporte {{cycle}}", fallbackAllocation: "Aplicacion",
  unknownCycle: "sin periodo", unknownMember: "socia", reconciliationTitle: "Regularizacion", pendingContribution: "Pendiente",
  pendingRepayment: "Pago pendiente", regularizedContribution: "Regularizado", regularizedRepayment: "Pago regularizado",
  regularizationTransfer: "Transferencia", legacyAccount: "Cuenta historica", fundMovementsTitle: "Movimientos del fondo",
};

const preview = {
  canonicalPayloadHash: "a".repeat(64),
  payload: monthlyMemberStatementPayload({
    orgName: "Banquito El Valle",
    periodLabel: "2026-06",
    member: { id: "22222222-2222-4222-8222-222222222222", displayName: "Ana Mora" },
    openingBalance: "100.0000",
    closingBalance: "120.5000",
    contributions: [{ id: "c1", amount: "25.5000", datedOn: "2026-06-10", slipPhotoUri: null }],
    withdrawals: [{ id: "w1", amount: "5.0000", datedOn: "2026-06-20" }],
    treasurerName: "Maria",
    bankLast4: "4821",
    copy: previewCopy,
  }),
};

describe("ScrMemberDetailPage view", () => {
  it("shows a pre-generation preview and individual generation action", () => {
    render(<MemberDetailView generateAction={vi.fn()} transitionAction={vi.fn()} view={{
      member: { id: preview.payload.member.id, displayName: "Ana Mora", status: "activo", role: "aportante", initialSavingsBalance: "40.0000" },
      currentBalance: "120.5000",
      balanceShareUrl: "https://wa.me/593991234567?text=saldo",
      deposits: [],
      periodCloseId: "11111111-1111-4111-8111-111111111111",
      preview,
      archiveUri: null,
      generated: false,
    }} />);

    expect(screen.getByRole("heading", { level: 1, name: "Ana Mora" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar estado de cuenta" })).toBeInTheDocument();
    expect(screen.getByTestId("member_statement_preview")).toHaveTextContent("USD 120.50");
    expect(screen.queryByRole("link", { name: "Abrir PDF" })).not.toBeInTheDocument();
  });

  it("keeps the preview and adds the PDF link after generation", () => {
    render(<MemberDetailView generateAction={vi.fn()} transitionAction={vi.fn()} view={{
      member: { id: preview.payload.member.id, displayName: "Ana Mora", status: "activo", role: "aportante", initialSavingsBalance: "40.0000" },
      currentBalance: "120.5000",
      balanceShareUrl: null,
      deposits: [],
      periodCloseId: "11111111-1111-4111-8111-111111111111",
      preview,
      archiveUri: "/statement-archive/public/hash.pdf",
      archiveGeneratedAt: "2026-07-01T12:00:00.000Z",
      generated: true,
    }} />);

    expect(screen.getByText("Estado de cuenta listo.")).toBeInTheDocument();
    expect(screen.getByTestId("member_statement_preview")).toHaveTextContent("Aporte 2026-06-10");
    expect(screen.getByTestId("member_statement_preview")).toHaveTextContent(`Hash archivado: ${preview.canonicalPayloadHash}`);
    expect(screen.getByTestId("member_statement_preview")).toHaveTextContent("Generado: 01/07/2026");
    expect(screen.getByRole("link", { name: "Abrir PDF" })).toHaveAttribute("href", "/statement-archive/public/hash.pdf");
  });

  it("does not show a generated success banner without a matching archive", () => {
    render(<MemberDetailView generateAction={vi.fn()} transitionAction={vi.fn()} view={{
      member: { id: preview.payload.member.id, displayName: "Ana Mora", status: "activo", role: "aportante", initialSavingsBalance: "40.0000" },
      currentBalance: "120.5000", balanceShareUrl: null, deposits: [],
      periodCloseId: "11111111-1111-4111-8111-111111111111", preview, archiveUri: null, generated: true,
    }} />);

    expect(screen.queryByText("Estado de cuenta listo.")).not.toBeInTheDocument();
  });

  it("shows immutable archive metadata when a historical archive has no displayable payload", () => {
    const archivedHash = "b".repeat(64);
    render(<MemberDetailView generateAction={vi.fn()} transitionAction={vi.fn()} view={{
      member: { id: preview.payload.member.id, displayName: "Ana Mora", status: "activo", role: "aportante", initialSavingsBalance: "40.0000" },
      currentBalance: "999.0000", balanceShareUrl: null, deposits: [],
      periodCloseId: "11111111-1111-4111-8111-111111111111",
      preview: null,
      archiveUri: `/statement-archive/public/${archivedHash}.pdf`,
      archiveHash: archivedHash,
      archiveGeneratedAt: "2026-07-01T12:00:00.000Z",
      generated: false,
    }} />);

    const fallback = screen.getByTestId("member_statement_archive_fallback");
    expect(fallback).toHaveTextContent(archivedHash);
    expect(fallback).toHaveTextContent("Generado: 01/07/2026");
    expect(screen.getByRole("link", { name: "Abrir PDF" })).toHaveAttribute(
      "href", `/statement-archive/public/${archivedHash}.pdf`,
    );
    expect(screen.queryByTestId("member_statement_preview")).not.toBeInTheDocument();
    expect(fallback).not.toHaveTextContent("999.0000");
  });

  it("renders route loading and retryable error states", () => {
    const retry = vi.fn();
    const loading = render(<MemberDetailLoading />);
    expect(screen.getByTestId("member_detail_loading")).toBeInTheDocument();
    loading.unmount();

    render(<MemberDetailError error={new Error("boom")} reset={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("ScrMemberDetailPage historical archives with PostgreSQL", () => {
  const actorId = "33333333-3333-4333-8333-333333333333";
  const originalBypass = process.env.E2E_AUTH_BYPASS;
  const originalOrgId = process.env.AUTH0_ORGANIZATION_DB_ORG_ID;
  const originalAuthEnv = {
    APP_BASE_URL: process.env.APP_BASE_URL,
    AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
    AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET,
    AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
    AUTH0_SECRET: process.env.AUTH0_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    IMPERSONATION_COOKIE_SECRET: process.env.IMPERSONATION_COOKIE_SECRET,
  };
  let db: typeof import("@mi-banquito/db")["db"];
  let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
  let activeOrgId: string | null = null;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for member page integration tests");
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    process.env.E2E_AUTH_BYPASS = "1";
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.AUTH0_CLIENT_ID = "member-page-test";
    process.env.AUTH0_CLIENT_SECRET = "member-page-test-secret";
    process.env.AUTH0_DOMAIN = "auth.example.test";
    process.env.AUTH0_SECRET = "member-page-test-secret-0000000000";
    process.env.CRON_SECRET = "member-page-test-cron";
    process.env.IMPERSONATION_COOKIE_SECRET = "member-page-cookie-secret-00000000";
  });

  afterEach(async () => {
    if (!activeOrgId) return;
    const schema = await import("@mi-banquito/db/schema");
    const orgId = activeOrgId;
    await withTenantTransaction(orgId, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(schema.statementArchive).where(eq(schema.statementArchive.orgId, orgId));
      await tx.delete(schema.periodClose).where(eq(schema.periodClose.orgId, orgId));
      await tx.delete(schema.reconciliationCycle).where(eq(schema.reconciliationCycle.orgId, orgId));
      await tx.delete(schema.contributionCycle).where(eq(schema.contributionCycle.orgId, orgId));
      await tx.delete(schema.member).where(eq(schema.member.orgId, orgId));
    });
    await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    activeOrgId = null;
  });

  afterAll(() => {
    if (originalBypass === undefined) delete process.env.E2E_AUTH_BYPASS;
    else process.env.E2E_AUTH_BYPASS = originalBypass;
    if (originalOrgId === undefined) delete process.env.AUTH0_ORGANIZATION_DB_ORG_ID;
    else process.env.AUTH0_ORGANIZATION_DB_ORG_ID = originalOrgId;
    for (const [key, value] of Object.entries(originalAuthEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function seedHistoricalMemberArchive(kind: "legacy" | "null") {
    const schema = await import("@mi-banquito/db/schema");
    const orgId = randomUUID();
    const memberId = randomUUID();
    const cycleId = randomUUID();
    const reconciliationId = randomUUID();
    const closeId = randomUUID();
    const generatedAt = new Date("2026-07-01T12:00:00.000Z");
    activeOrgId = orgId;
    process.env.AUTH0_ORGANIZATION_DB_ORG_ID = orgId;
    await db.insert(schema.organization).values({
      id: orgId, displayName: "Grupo archivo histórico", countryCode: "EC", currencyCode: "USD",
      timezone: "America/Guayaquil", defaultLanguage: "es-EC", status: "active",
      createdAt: generatedAt, createdBy: actorId, createdByKind: "system",
    });
    await db.insert(schema.member).values({
      id: memberId, orgId, displayName: "Socia archivo histórico", joinedOn: "2025-01-01",
      role: "aportante", status: "activo", initialSavingsBalance: "7777.0000",
      createdAt: generatedAt, createdBy: actorId, createdByKind: "member",
    });
    await db.insert(schema.contributionCycle).values({
      id: cycleId, orgId, cycleLabel: "2026-06", kind: "monthly", opensOn: "2026-06-01", closesOn: "2026-06-30",
      expectedAmountPerMember: "25.0000", currencyCode: "USD", status: "closed",
      createdAt: generatedAt, createdBy: actorId, createdByKind: "member",
    });
    await db.insert(schema.reconciliationCycle).values({
      id: reconciliationId, orgId, cycleId, declaredBankBalance: "0.0000", computedPoolBalance: "0.0000",
      discrepancyAmount: "0.0000", toleranceAmount: "0.0000", resolutionKind: "annotated_acceptance",
      closedAt: generatedAt, createdAt: generatedAt, createdBy: actorId, createdByKind: "member",
    });
    await db.insert(schema.periodClose).values({
      id: closeId, orgId, cycleId, reconciliationCycleId: reconciliationId, closedAt: generatedAt,
      closedBy: actorId, closedByKind: "member", isYearEnd: false, createdAt: generatedAt,
    });
    await db.insert(schema.statementArchive).values({
      orgId, kind: "monthly_close", memberId: null, periodLabel: "2026-06",
      pdfUri: `/statement-archive/public/${"d".repeat(64)}.pdf`, canonicalPayloadHash: "d".repeat(64),
      canonicalPayload: null, legacyVerificationPayload: { legacy: true }, generatedAt, periodCloseId: closeId,
      byteSize: 1, createdAt: generatedAt, createdByKind: "member",
    });
    const canonicalPayload = kind === "legacy" ? {
      ...monthlyMemberStatementPayload({
        orgName: "Grupo archivado original", periodLabel: "2026-06",
        member: { id: memberId, displayName: "Socia archivada original" }, openingBalance: "10.0000", closingBalance: "35.0000",
        contributions: [], withdrawals: [], treasurerName: "Tesorera original", bankLast4: "1234", copy: previewCopy,
      }),
      verificationMovements: [{
        id: "legacy-page-movement", kind: "contribution", status: "regularized", amount: "25.0000",
        datedOn: "2026-06-15", accountName: "Cuenta archivada", label: "Aporte legado inmutable",
      }],
    } : null;
    const hash = canonicalPayload ? sha256Hex(canonicalJson(canonicalPayload)) : "e".repeat(64);
    const pdfUri = `/statement-archive/public/${hash}.pdf`;
    await db.insert(schema.statementArchive).values({
      orgId, kind: "monthly_member", memberId, periodLabel: "2026-06", pdfUri,
      canonicalPayloadHash: hash, canonicalPayload, legacyVerificationPayload: canonicalPayload ? null : { legacy: true },
      generatedAt, periodCloseId: closeId, byteSize: 1, createdAt: generatedAt, createdByKind: "member",
    });
    return { memberId, hash, pdfUri };
  }

  it("normalizes a hash-verified legacy archive only for display", async () => {
    const archive = await seedHistoricalMemberArchive("legacy");
    const Page = (await import("./page")).default;
    render(await Page({ params: Promise.resolve({ id: archive.memberId }), searchParams: Promise.resolve({}) }));

    const archived = screen.getByTestId("member_statement_preview");
    expect(archived).toHaveTextContent("Aporte legado inmutable");
    expect(archived).toHaveTextContent(archive.hash);
    expect(screen.getByRole("link", { name: "Abrir PDF" })).toHaveAttribute("href", archive.pdfUri);
  });

  it("renders exact metadata for a null-payload archive without replacing it from the live ledger", async () => {
    const archive = await seedHistoricalMemberArchive("null");
    const Page = (await import("./page")).default;
    render(await Page({ params: Promise.resolve({ id: archive.memberId }), searchParams: Promise.resolve({}) }));

    const fallback = screen.getByTestId("member_statement_archive_fallback");
    expect(fallback).toHaveTextContent(archive.hash);
    expect(fallback).toHaveTextContent("Generado: 01/07/2026");
    expect(screen.getByRole("link", { name: "Abrir PDF" })).toHaveAttribute("href", archive.pdfUri);
    expect(screen.queryByTestId("member_statement_preview")).not.toBeInTheDocument();
  });
});
