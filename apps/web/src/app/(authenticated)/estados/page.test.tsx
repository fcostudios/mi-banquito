import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToBuffer } from "@react-pdf/renderer";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { monthlyMemberStatementPayload, type MemberStatementPreview } from "@mi-banquito/domain";
import { MonthlyMemberDocument, monthlyMemberPdfRows } from "@/lib/monthly-member-artifact";
import StatementsError from "./error";
import StatementsLoading from "./loading";
import { StatementArchiveView } from "./statement-archive-view";
import { buildStatementArchivePageView } from "./statement-archive-view-model";
import { StatementPreview } from "./statement-preview";

const copy = {
  monthlySectionTitle: "Estado mensual",
  openingBalance: "Saldo inicial",
  contribution: "Aporte {{date}}",
  withdrawal: "Retiro {{date}}",
  closingBalance: "Saldo final",
  treasurer: "Tesorera",
  groupAccount: "Cuenta del grupo",
  noGroupAccount: "Sin cuenta registrada",
  receivedPaymentsTitle: "Pagos recibidos",
  receivedPayment: "Pago recibido de {{member}}",
  loanFee: "Mora/comision prestamo",
  loanInterest: "Interes prestamo",
  loanPrincipal: "Capital prestamo",
  contributionAllocation: "Aporte {{cycle}}",
  fallbackAllocation: "Aplicacion",
  unknownCycle: "sin periodo",
  unknownMember: "socia",
  reconciliationTitle: "Regularizacion de depositos",
  pendingContribution: "Aporte pendiente",
  pendingRepayment: "Pago pendiente",
  regularizedContribution: "Aporte regularizado",
  regularizedRepayment: "Pago regularizado",
  regularizationTransfer: "Transferencia para regularizar",
  legacyAccount: "Cuenta historica sin referencia",
  fundMovementsTitle: "Movimientos del fondo y colectas",
} as const;

const payload = monthlyMemberStatementPayload({
  orgName: "Banquito El Valle",
  periodLabel: "2026-06",
  member: { id: "22222222-2222-4222-8222-222222222222", displayName: "Ana Mora" },
  openingBalance: "100.0000",
  closingBalance: "120.5000",
  contributions: [{ id: "c1", amount: "25.5000", datedOn: "2026-06-10", slipPhotoUri: null }],
  withdrawals: [{ id: "w1", amount: "5.0000", datedOn: "2026-06-20" }],
  verificationMovements: [{
    sourceKind: "expense",
    sourceId: "expense-original",
    datedOn: "2026-06-21",
    memberId: null,
    collectionId: null,
    category: "bank_fee",
    label: "Comisión bancaria",
    signedAmount: "-3.5000",
    reconciliationStatus: null,
    reversesId: null,
    accountName: "Banco del grupo",
  }, {
    sourceKind: "collection_line",
    sourceId: "collection-reversal",
    datedOn: "2026-06-22",
    memberId: "22222222-2222-4222-8222-222222222222",
    collectionId: "33333333-3333-4333-8333-333333333333",
    category: "solidarity",
    label: "Colecta solidaria",
    signedAmount: "-10.0000",
    reconciliationStatus: "regularized",
    reversesId: "collection-original",
    accountName: "Banco del grupo",
  }],
  treasurerName: "Maria",
  bankLast4: "4821",
  copy,
});

const previewFixture: MemberStatementPreview = {
  payload,
  canonicalPayloadHash: "a".repeat(64),
};

function renderedText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join("");
  if (!isValidElement(node)) return "";
  return renderedText((node.props as { children?: ReactNode }).children);
}

describe("US-048 statement views", () => {
  it("renders the same preview before and after archive generation", () => {
    const view = render(<StatementPreview preview={previewFixture} archiveUri={null} />);
    expect(screen.getByTestId("member_statement_preview")).toHaveTextContent("Ana Mora");
    expect(screen.getByTestId("member_statement_preview")).toHaveTextContent("USD 120.50");
    expect(screen.queryByRole("link", { name: "Abrir PDF" })).not.toBeInTheDocument();

    view.rerender(<StatementPreview preview={previewFixture} archiveUri="/statement-archive/public/hash.pdf" />);

    expect(screen.getByRole("link", { name: "Abrir PDF" })).toHaveAttribute("href", "/statement-archive/public/hash.pdf");
  });

  it("renders the closed-period batch action, active-member count, and member-detail links", () => {
    render(<StatementArchiveView generateAction={vi.fn()} shareAction={vi.fn()} view={{
      latestReadyPeriodClose: { id: "11111111-1111-4111-8111-111111111111", periodLabel: "2026-06" },
      activeMemberCount: 2,
      latestActiveArchiveCount: 1,
      memberArchives: [{
        id: "archive-1",
        memberId: "22222222-2222-4222-8222-222222222222",
        memberName: "Ana Mora",
        periodLabel: "2026-06",
        pdfUri: "/statement-archive/public/hash.pdf",
      }, {
        id: "archive-old",
        memberId: "33333333-3333-4333-8333-333333333333",
        memberName: "Socia histórica",
        periodLabel: "2026-05",
        pdfUri: "/statement-archive/public/old.pdf",
      }],
    }} />);

    expect(screen.getByRole("button", { name: "Generar estados de cuenta de 2026-06" })).toBeInTheDocument();
    expect(screen.getByText("1 de 2 estados por socia listos.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ana Mora" })).toHaveAttribute(
      "href",
      "/socias/22222222-2222-4222-8222-222222222222",
    );
    expect(screen.getByRole("link", { name: "Socia histórica" })).toHaveAttribute(
      "href",
      "/socias/33333333-3333-4333-8333-333333333333",
    );
  });

  it("renders all five latest-close metrics from the canonical transparency summary", () => {
    render(<StatementArchiveView generateAction={vi.fn()} shareAction={vi.fn()} view={{
      latestReadyPeriodClose: null,
      activeMemberCount: 0,
      latestActiveArchiveCount: 0,
      memberArchives: [],
      summary: {
        periodLabel: "2026-07",
        members: 2,
        in: "50.0000",
        out: "40.0000",
        movements: "-3.5000",
        saldo: "106.5000",
      },
    }} />);

    expect(screen.getByTestId("period_summary")).toHaveTextContent("Resumen del último cierre (2026-07)");
    expect(screen.getByTestId("members")).toHaveTextContent("2");
    expect(screen.getByTestId("in")).toHaveTextContent("USD 50.00");
    expect(screen.getByTestId("out")).toHaveTextContent("USD 40.00");
    expect(screen.getByTestId("movements")).toHaveTextContent("USD -3.50");
    expect(screen.getByTestId("saldo")).toHaveTextContent("USD 106.50");
  });

  it("retains older and inactive-member archives while counting only latest active statements", () => {
    const view = buildStatementArchivePageView({
      rows: [
        { id: "close", kind: "monthly_close", memberId: null, periodLabel: "2026-06", periodCloseId: "close-id", pdfUri: "/close.pdf", generatedAt: new Date("2026-07-01"), canonicalPayloadHash: "a".repeat(64), artifactStatus: "ready" },
        { id: "latest", kind: "monthly_member", memberId: "active", periodLabel: "2026-06", periodCloseId: "close-id", pdfUri: "/latest.pdf", generatedAt: new Date("2026-07-01"), canonicalPayloadHash: "b".repeat(64), artifactStatus: "ready" },
        { id: "inactive-old", kind: "monthly_member", memberId: "inactive", periodLabel: "2026-05", periodCloseId: "old-close", pdfUri: "/inactive-old.pdf", generatedAt: new Date("2026-06-01"), canonicalPayloadHash: "c".repeat(64), artifactStatus: "ready" },
        { id: "missing-old", kind: "monthly_member", memberId: "missing", periodLabel: "2026-04", periodCloseId: "older-close", pdfUri: "/missing-old.pdf", generatedAt: new Date("2026-05-01"), canonicalPayloadHash: "d".repeat(64), artifactStatus: "ready" },
      ],
      members: [
        { id: "active", displayName: "Ana Activa", status: "activo" },
        { id: "inactive", displayName: "Bea Histórica", status: "baja" },
      ],
      historicalMemberLabel: "Socia archivada",
    });

    expect(view.latestActiveArchiveCount).toBe(1);
    expect(view.activeMemberCount).toBe(1);
    expect(view.memberArchives).toEqual([
      expect.objectContaining({ id: "latest", memberName: "Ana Activa" }),
      expect.objectContaining({ id: "inactive-old", memberName: "Bea Histórica" }),
      expect.objectContaining({ id: "missing-old", memberName: "Socia archivada" }),
    ]);
  });

  it("maps every payload row exactly and produces a real PDF", async () => {
    const input = {
      orgId: "11111111-1111-4111-8111-111111111111",
      canonicalPayloadHash: "a".repeat(64),
      periodLabel: payload.periodLabel,
      memberName: payload.member.displayName,
      payload,
    };

    const rows = monthlyMemberPdfRows(input);
    expect(rows.filter((row) => row.sourceId).map((row) => row.sourceId)).toEqual([
      "expense-original",
      "collection-reversal",
    ]);
    expect(rows.filter((row) => !row.sourceId)).toEqual(payload.sections.filter((section) => section.id !== "fund-movements").flatMap((section) =>
      section.rows.map((row) => ({
        sectionId: section.id,
        sectionTitle: section.title,
        label: row.label,
        value: "value" in row ? row.value : row.amount,
        details: "details" in row ? row.details : [],
      }))));
    expect(rows.find((row) => row.sourceId === "collection-reversal")).toMatchObject({
      label: "Reverso · Colecta solidaria",
      value: "USD -10.00",
      details: expect.arrayContaining([
        "Fecha: 2026-06-22",
        "Fuente: collection_line · collection-reversal",
        "Reversa de: collection-original",
      ]),
    });

    const documentText = renderedText(MonthlyMemberDocument({ input }));
    expect(documentText).toContain("Fecha: 2026-06-21");
    expect(documentText).toContain("Fuente: expense · expense-original");
    expect(documentText).toContain("Fecha: 2026-06-22");
    expect(documentText).toContain("Fuente: collection_line · collection-reversal");

    const pdfBytes = await renderToBuffer(<MonthlyMemberDocument input={input} />);
    expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdfBytes.byteLength).toBeGreaterThan(100);
  });

  it("renders route loading and retryable error states", () => {
    const retry = vi.fn();
    const loading = render(<StatementsLoading />);
    expect(screen.getByTestId("statements_loading")).toBeInTheDocument();
    loading.unmount();

    render(<StatementsError error={new Error("boom")} reset={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
