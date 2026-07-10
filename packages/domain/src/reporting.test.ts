import { describe, expect, it } from "vitest";

import {
  buildStatementShareUrl,
  canonicalJson,
  monthlyMemberStatementContributions,
  monthlyMemberStatementPayload,
  monthlyMemberStatementReceivedPayments,
  publicStatementPdfUrl,
  publicVerifyUrl,
  sha256Hex,
  verifierResultText,
} from "./reporting";

const statementCopy = {
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
  loanFee: "Mora/comisión préstamo",
  loanInterest: "Interés préstamo",
  loanPrincipal: "Capital préstamo",
  contributionAllocation: "Aporte {{cycle}}",
  fallbackAllocation: "Aplicación",
  unknownCycle: "sin período",
  unknownMember: "socia",
};

describe("public statement verification", () => {
  it("orders object keys deterministically before hashing", () => {
    const left = canonicalJson({ b: 2, a: { d: 4, c: 3 } });
    const right = canonicalJson({ a: { c: 3, d: 4 }, b: 2 });

    expect(left).toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(right).toBe(left);
    expect(sha256Hex(left)).toBe("c461c47a913352f1a21e3f2ea49e1fd34754c0dc12cb7366e4636d5e186c6c6e");
  });

  it("builds the verifier URL from a canonical hash", () => {
    expect(publicVerifyUrl("https://mi-banquito.vercel.app", "a".repeat(64))).toBe(
      "https://mi-banquito.vercel.app/verify/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  it("builds a public unlisted PDF URL from a canonical hash", () => {
    expect(publicStatementPdfUrl("https://mi-banquito.vercel.app", "A".repeat(64))).toBe(
      "https://mi-banquito.vercel.app/statement-archive/public/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf",
    );
  });

  it("creates deterministic monthly member statement payloads", () => {
    const payload = monthlyMemberStatementPayload({
      orgName: "Mi Banquito",
      periodLabel: "2026-06",
      member: { id: "m1", displayName: "Ana Mora" },
      openingBalance: "100.0000",
      closingBalance: "120.0000",
      contributions: [{ id: "c1", amount: "20.0000", datedOn: "2026-06-10", slipPhotoUri: "https://example.com/c1.jpg" }],
      withdrawals: [],
      treasurerName: "Pancho",
      bankLast4: "1234",
      copy: statementCopy,
    });

    expect(payload.sections[0].rows).toContainEqual({ label: "Saldo inicial", value: "USD 100.00" });
    expect(sha256Hex(canonicalJson(payload))).toHaveLength(64);
  });

  it("keeps grouped BR-26 contribution child rows as statement rows without receipt duplication", () => {
    const forward = [
      { id: "receipt-1", amount: "40.0000", datedOn: "2026-07-09", slipPhotoUri: null, sourceKind: "payment_receipt" },
      { id: "child-current", amount: "20.0000", datedOn: "2026-07-09", slipPhotoUri: null, sourceKind: "contribution" },
      { id: "child-overdue", amount: "20.0000", datedOn: "2026-07-09", slipPhotoUri: null, sourceKind: "contribution" },
    ] as const;
    const contributions = monthlyMemberStatementContributions([...forward]);
    const reversedContributions = monthlyMemberStatementContributions([...forward].reverse());
    const payload = monthlyMemberStatementPayload({
      orgName: "Mi Banquito",
      periodLabel: "2026-07",
      member: { id: "m1", displayName: "Ana Mora" },
      openingBalance: "100.0000",
      closingBalance: "140.0000",
      contributions,
      withdrawals: [],
      treasurerName: "Pancho",
      bankLast4: null,
      copy: statementCopy,
    });
    const reversedPayload = monthlyMemberStatementPayload({
      orgName: "Mi Banquito",
      periodLabel: "2026-07",
      member: { id: "m1", displayName: "Ana Mora" },
      openingBalance: "100.0000",
      closingBalance: "140.0000",
      contributions: reversedContributions,
      withdrawals: [],
      treasurerName: "Pancho",
      bankLast4: null,
      copy: statementCopy,
    });
    const rows = payload.sections[0].rows;

    expect(rows.filter((row) => row.label === "Aporte 2026-07-09")).toHaveLength(2);
    expect(contributions.map((row) => row.id)).toEqual(["child-current", "child-overdue"]);
    expect(rows).not.toContainEqual(expect.objectContaining({ label: expect.stringContaining("payment_receipt") }));
    expect(canonicalJson(reversedPayload)).toBe(canonicalJson(payload));
    expect(sha256Hex(canonicalJson(payload))).toHaveLength(64);
  });

  it("renders grouped BR-26 receipt statements once with allocation split details", () => {
    const rows = [
      {
        receiptId: "receipt-1",
        receiptAmount: "80.0000",
        receiptDatedOn: "2026-07-09",
        memberName: "Toitq",
        allocationKind: "contribution_current",
        allocationAmount: "20.0000",
        cycleLabel: "2026-07",
        sortOrder: 4,
      },
      {
        receiptId: "receipt-1",
        receiptAmount: "80.0000",
        receiptDatedOn: "2026-07-09",
        memberName: "Toitq",
        allocationKind: "loan_interest",
        allocationAmount: "10.0000",
        cycleLabel: null,
        sortOrder: 1,
      },
      {
        receiptId: "receipt-1",
        receiptAmount: "80.0000",
        receiptDatedOn: "2026-07-09",
        memberName: "Toitq",
        allocationKind: "loan_principal",
        allocationAmount: "30.0000",
        cycleLabel: null,
        sortOrder: 2,
      },
      {
        receiptId: "receipt-1",
        receiptAmount: "80.0000",
        receiptDatedOn: "2026-07-09",
        memberName: "Toitq",
        allocationKind: "contribution_overdue",
        allocationAmount: "20.0000",
        cycleLabel: "2026-06",
        sortOrder: 3,
      },
    ];
    const payload = monthlyMemberStatementPayload({
      orgName: "Mi Banquito",
      periodLabel: "2026-07",
      member: { id: "m1", displayName: "Toitq" },
      openingBalance: "100.0000",
      closingBalance: "140.0000",
      contributions: [],
      receivedPayments: monthlyMemberStatementReceivedPayments(rows, statementCopy),
      withdrawals: [],
      treasurerName: "Pancho",
      bankLast4: null,
      copy: statementCopy,
    });
    const reversedPayload = monthlyMemberStatementPayload({
      orgName: "Mi Banquito",
      periodLabel: "2026-07",
      member: { id: "m1", displayName: "Toitq" },
      openingBalance: "100.0000",
      closingBalance: "140.0000",
      contributions: [],
      receivedPayments: monthlyMemberStatementReceivedPayments([...rows].reverse(), statementCopy),
      withdrawals: [],
      treasurerName: "Pancho",
      bankLast4: null,
      copy: statementCopy,
    });

    expect(payload).toMatchObject({
      sections: expect.arrayContaining([
        expect.objectContaining({
          title: "Pagos recibidos",
          rows: [
            expect.objectContaining({
              label: "Pago recibido de Toitq",
              amount: "80.0000",
              details: [
                "Interés préstamo: 10.0000",
                "Capital préstamo: 30.0000",
                "Aporte 2026-06: 20.0000",
                "Aporte 2026-07: 20.0000",
              ],
            }),
          ],
        }),
      ]),
    });
    expect(canonicalJson(reversedPayload)).toBe(canonicalJson(payload));
  });

  it("builds a WhatsApp share URL for archived statements", () => {
    expect(buildStatementShareUrl({
      whatsappNumber: "+593 99 123 4567",
      memberName: "Ana Mora",
      pdfUri: "https://mi-banquito.vercel.app/statement-archive/public/a.pdf",
    })).toBe("https://wa.me/593991234567?text=Hola%20Ana%20Mora%2C%20te%20comparto%20tu%20estado%20de%20cuenta%20de%20Mi%20Banquito%3A%20https%3A%2F%2Fmi-banquito.vercel.app%2Fstatement-archive%2Fpublic%2Fa.pdf");
  });

  it("returns minimal hit and miss copy", () => {
    expect(verifierResultText({
      matched: true,
      groupName: "Mi Banquito",
      generatedAt: "2026-07-04T10:00:00.000Z",
    })).toBe("Este documento coincide con el registro del grupo Mi Banquito al 2026-07-04.");
    expect(verifierResultText({ matched: false })).toBe("No se encontró un documento con este código.");
  });
});
