import { beforeEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import fc from "fast-check";

import { put } from "@vercel/blob";

import { monthlyCloseMovementRows, uploadMonthlyCloseArtifact } from "./monthly-close-artifact";

vi.mock("@react-pdf/renderer", () => ({
  Document: ({ children }: { children: React.ReactNode }) => children,
  Page: ({ children }: { children: React.ReactNode }) => children,
  StyleSheet: { create: (styles: unknown) => styles },
  Text: ({ children }: { children: React.ReactNode }) => children,
  View: ({ children }: { children: React.ReactNode }) => children,
  pdf: () => ({
    toBlob: () => Promise.resolve(new Blob(["pdf"], { type: "application/pdf" })),
  }),
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(() => Promise.resolve({ url: "https://private.blob.invalid/file.pdf" })),
}));

describe("uploadMonthlyCloseArtifact", () => {
  beforeEach(() => {
    vi.mocked(put).mockClear();
  });

  it("itemizes close categories, transfers, net balance, and zero pending evidence", () => {
    expect(monthlyCloseMovementRows({
      bankFees: "3.5000",
      supplies: "18.0000",
      sharedExpenses: "27.0000",
      operatingExpenses: "0.0000",
      transfers: "50.0000",
      netFundBalance: "3371.5000",
      pendingRegularizations: 0,
      pendingAssertion: "cero movimientos pendientes de regularizar",
    })).toEqual([
      { label: "Comisiones", value: "USD 3.50" },
      { label: "Insumos", value: "USD 18.00" },
      { label: "Gastos compartidos", value: "USD 27.00" },
      { label: "Gastos operativos", value: "USD 0.00" },
      { label: "Transferencias", value: "USD 50.00" },
      { label: "Saldo neto del fondo", value: "USD 3,371.50" },
      { label: "Regularización", value: "cero movimientos pendientes de regularizar" },
    ]);
  });

  it("formats every numeric(18,4) boundary without floating-point conversion", () => {
    fc.assert(fc.property(
      fc.bigInt({ min: -BigInt("999999999999999999"), max: BigInt("999999999999999999") }),
      (units) => {
        const negative = units < BigInt(0);
        const absolute = negative ? -units : units;
        const source = `${negative ? "-" : ""}${absolute / BigInt(10_000)}.${String(absolute % BigInt(10_000)).padStart(4, "0")}`;
        const [row] = monthlyCloseMovementRows({
          bankFees: source,
          supplies: "0.0000",
          sharedExpenses: "0.0000",
          operatingExpenses: "0.0000",
          transfers: "0.0000",
          netFundBalance: "0.0000",
          pendingRegularizations: 0,
          pendingAssertion: "cero movimientos pendientes de regularizar",
        });
        const roundedCents = (absolute + BigInt(50)) / BigInt(100);
        const expectedWhole = (roundedCents / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        const cents = String(roundedCents % BigInt(100)).padStart(2, "0");
        expect(row?.value).toBe(`USD ${negative ? "-" : ""}${expectedWhole}.${cents}`);
      },
    ), { seed: 95, numRuns: 500 });
  });

  it("uploads monthly close PDFs as private blobs and returns the public unlisted archive route", async () => {
    const result = await uploadMonthlyCloseArtifact({
      orgId: "11111111-1111-4111-8111-111111111111",
      periodLabel: "2026-06",
      canonicalPayloadHash: "a".repeat(64),
      payload: {
        kind: "monthly_close",
        orgId: "11111111-1111-4111-8111-111111111111",
        branding: {
          orgName: "Mi Banquito",
          logoUri: null,
          currencyCode: "USD",
        },
        cycleId: "33333333-3333-4333-8333-333333333333",
        cycleLabel: "2026-06",
        periodCloseId: "22222222-2222-4222-8222-222222222222",
        declaredBankBalance: "0.0000",
        computedPoolBalance: "0.0000",
        discrepancyAmount: "0.0000",
        toleranceAmount: "0.0100",
        resolutionKind: "auto_within_tolerance",
        resolutionNote: null,
        closedAt: "2026-07-05T21:00:00.000Z",
        ledgerEntries: [],
        memberBalances: [],
        openLoans: [],
        activeAlerts: [],
        interestAccruals: [],
        movementSummary: {
          bankFees: "3.5000",
          supplies: "18.0000",
          sharedExpenses: "27.0000",
          operatingExpenses: "0.0000",
          transfers: "50.0000",
          netFundBalance: "3371.5000",
          pendingRegularizations: 0,
          pendingAssertion: "cero movimientos pendientes de regularizar",
        },
      },
    });

    expect(put).toHaveBeenCalledWith(
      `monthly-close/11111111-1111-4111-8111-111111111111/${"a".repeat(64)}.pdf`,
      expect.any(Blob),
      expect.objectContaining({
        access: "private",
        allowOverwrite: true,
        contentType: "application/pdf",
      }),
    );
    expect(result).toEqual({
      pdfUri: `/statement-archive/public/${"a".repeat(64)}.pdf`,
      byteSize: 3,
    });
  });
});
