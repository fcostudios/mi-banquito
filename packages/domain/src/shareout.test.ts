import { describe, expect, it } from "vitest";

import {
  applyShareOutOverride,
  assertShareOutReconciled,
  computeTwoPoolDraft,
  fiscalYearForDate,
} from "./shareout";

describe("year-end share-out", () => {
  it("bins fiscal years by configured start month", () => {
    expect(fiscalYearForDate("2026-01-01", { startMonth: 1, startDay: 1 })).toBe(2026);
    expect(fiscalYearForDate("2026-01-01", { startMonth: 7, startDay: 1 })).toBe(2025);
  });

  it("computes two-pool shares and reconciles pool totals", () => {
    const draft = computeTwoPoolDraft({
      repartoTotal: "100.0000",
      loanPoolPct: "0.3000",
      savingsPoolPct: "0.7000",
      members: [
        { memberId: "a", accumulatedSavings: "100.0000", saldoPonderadoUsdDias: "1000.0000", loanActivityBasis: "300.0000" },
        { memberId: "b", accumulatedSavings: "200.0000", saldoPonderadoUsdDias: "3000.0000", loanActivityBasis: "700.0000" },
      ],
    });
    expect(draft.lines).toEqual([
      expect.objectContaining({ memberId: "a", loanBonusC: "9.0000", savingsInterest: "17.5000", draftShareAmount: "26.5000" }),
      expect.objectContaining({ memberId: "b", loanBonusC: "21.0000", savingsInterest: "52.5000", draftShareAmount: "73.5000" }),
    ]);
    expect(draft.totalDraft).toBe("100.0000");
  });

  it("requires a reason for non-zero overrides and records the parent adjustment amount", () => {
    expect(() => applyShareOutOverride({
      repartoTotal: "100.0000",
      lineId: "line-a",
      overrideAmount: "30.0000",
      reason: "",
      lines: [
        { id: "line-a", memberId: "a", draftShareAmount: "26.5000", finalShareAmount: "26.5000" },
        { id: "line-b", memberId: "b", draftShareAmount: "73.5000", finalShareAmount: "73.5000" },
      ],
    })).toThrow("override_reason_required");

    const result = applyShareOutOverride({
      repartoTotal: "100.0000",
      lineId: "line-a",
      overrideAmount: "30.0000",
      reason: "Aprobado por acta",
      lines: [
        { id: "line-a", memberId: "a", draftShareAmount: "26.5000", finalShareAmount: "26.5000" },
        { id: "line-b", memberId: "b", draftShareAmount: "73.5000", finalShareAmount: "73.5000" },
      ],
    });
    expect(result.ajusteAmount).toBe("-3.5000");
    expect(result.lines[0]).toMatchObject({ finalShareAmount: "30.0000", overrideReason: "Aprobado por acta" });
  });

  it("rejects approval when final shares do not reconcile to reparto total", () => {
    expect(() => assertShareOutReconciled({
      repartoTotal: "100.0000",
      ajusteAmount: "0.0000",
      lines: [
        { finalShareAmount: "30.0000" },
        { finalShareAmount: "60.0000" },
      ],
    })).toThrow("share_out_not_reconciled");
  });

  it("accepts approval when final shares plus adjustment equal reparto total", () => {
    expect(() => assertShareOutReconciled({
      repartoTotal: "100.0000",
      ajusteAmount: "10.0000",
      lines: [
        { finalShareAmount: "30.0000" },
        { finalShareAmount: "60.0000" },
      ],
    })).not.toThrow();
  });
});
