import { beforeEach, describe, expect, it, vi } from "vitest";
import type React from "react";

import { put } from "@vercel/blob";

import { uploadMonthlyCloseArtifact } from "./monthly-close-artifact";

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
