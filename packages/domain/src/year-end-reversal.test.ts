import { describe, expect, it } from "vitest";

import {
  assertShareOutReversalAllowed,
  buildShareOutReversalPlan,
  isShareOutReversalEligibleForView,
} from "./year-end-reversal";

describe("year-end share-out reversal helpers", () => {
  it("allows distributed or approved share-outs inside the 24-hour window", () => {
    const now = new Date("2026-07-02T11:59:59.000Z");
    const approvedAt = new Date("2026-07-01T12:00:00.000Z");

    expect(() => assertShareOutReversalAllowed({
      status: "distributed",
      approvedAt,
      now,
      graceHours: 24,
    })).not.toThrow();
    expect(() => assertShareOutReversalAllowed({
      status: "approved",
      approvedAt,
      now,
      graceHours: 24,
    })).not.toThrow();
  });

  it("blocks non-reversible statuses and share-outs outside the 24-hour window", () => {
    expect(() => assertShareOutReversalAllowed({
      status: "draft",
      approvedAt: new Date("2026-07-01T12:00:00.000Z"),
      now: new Date("2026-07-02T12:00:00.000Z"),
      graceHours: 24,
    })).toThrow("share_out_not_reversible");

    expect(() => assertShareOutReversalAllowed({
      status: "distributed",
      approvedAt: new Date("2026-07-01T12:00:00.000Z"),
      now: new Date("2026-07-02T12:00:01.000Z"),
      graceHours: 24,
    })).toThrow("share_out_reversal_window_closed");
  });

  it("builds negative offset withdrawals only for paid nonzero lines", () => {
    const plan = buildShareOutReversalPlan({
      shareOutId: "shareout-1",
      reason: "Acta corrigió reparto anual",
      lines: [
        {
          id: "line-1",
          memberId: "member-1",
          finalShareAmount: "26.5000",
          withdrawalId: "withdrawal-1",
        },
        {
          id: "line-2",
          memberId: "member-2",
          finalShareAmount: "0.0000",
          withdrawalId: "withdrawal-2",
        },
        {
          id: "line-3",
          memberId: "member-3",
          finalShareAmount: "73.1234",
          withdrawalId: null,
        },
      ],
    });

    expect(plan).toEqual({
      shareOutId: "shareout-1",
      reason: "Acta corrigió reparto anual",
      withdrawalOffsets: [{
        lineId: "line-1",
        memberId: "member-1",
        amount: "-26.5000",
        reversesId: "withdrawal-1",
      }],
    });
  });

  it("validates reversal reason length", () => {
    expect(() => buildShareOutReversalPlan({
      shareOutId: "shareout-1",
      reason: "corta",
      lines: [{
        id: "line-1",
        memberId: "member-1",
        finalShareAmount: "10.0000",
        withdrawalId: "withdrawal-1",
      }],
    })).toThrow("share_out_reversal_reason_min_length");
  });

  it("only marks share-outs view-eligible when status/date and paid linked lines match", () => {
    const base = {
      status: "distributed",
      approvedAt: new Date("2026-07-01T12:00:00.000Z"),
      now: new Date("2026-07-02T11:00:00.000Z"),
      graceHours: 24,
    };

    expect(isShareOutReversalEligibleForView({
      ...base,
      lines: [{ finalShareAmount: "26.5000", withdrawalId: "withdrawal-1" }],
    })).toBe(true);
    expect(isShareOutReversalEligibleForView({
      ...base,
      lines: [{ finalShareAmount: "0.0000", withdrawalId: "withdrawal-1" }],
    })).toBe(false);
    expect(isShareOutReversalEligibleForView({
      ...base,
      lines: [{ finalShareAmount: "26.5000", withdrawalId: null }],
    })).toBe(false);
    expect(isShareOutReversalEligibleForView({
      ...base,
      status: "reversed",
      lines: [{ finalShareAmount: "26.5000", withdrawalId: "withdrawal-1" }],
    })).toBe(false);
  });
});
