import { describe, expect, it } from "vitest";

import {
  mergePendingRows,
  parsePendingCursor,
  parsePendingSelection,
  pendingMovementHref,
} from "./pending-pagination";

const selected = {
  id: "66666666-6666-4666-8666-666666666666",
  orgId: "11111111-1111-4111-8111-111111111111",
  sourceKind: "contribution" as const,
  amount: "12.0000",
  remaining: "12.0000",
  currencyCode: "USD",
  datedOn: "2026-07-01",
  accountId: "77777777-7777-4777-8777-777777777777",
  accountName: "Personal",
  memberId: "22222222-2222-4222-8222-222222222222",
  memberName: "Ana",
  notes: null,
};

describe("pending deposit pagination query state", () => {
  it("accepts only a complete, valid keyset cursor and selection", () => {
    expect(parsePendingCursor({
      pendingDate: "2026-07-21",
      pendingKind: "repayment",
      pendingId: "88888888-8888-4888-8888-888888888888",
    })).toEqual({
      datedOn: "2026-07-21",
      sourceKind: "repayment",
      id: "88888888-8888-4888-8888-888888888888",
    });
    expect(parsePendingCursor({ pendingDate: "2026-02-30", pendingKind: "repayment", pendingId: selected.id })).toBeNull();
    expect(parsePendingCursor({ pendingDate: "2026-07-21", pendingKind: "invalid", pendingId: selected.id })).toBeNull();
    expect(parsePendingCursor({ pendingDate: "2026-07-21", pendingKind: "repayment" })).toBeNull();
    expect(parsePendingSelection({ regularizesKind: "contribution", regularizesId: selected.id })).toEqual({
      sourceKind: "contribution",
      id: selected.id,
    });
    expect(parsePendingSelection({ regularizesKind: "contribution", regularizesId: "not-a-uuid" })).toBeNull();
  });

  it("accepts UUID versions six through eight and rejects invalid version or variant bits", () => {
    for (const id of [
      "66666666-6666-6666-8666-666666666666",
      "77777777-7777-7777-9777-777777777777",
      "88888888-8888-8888-a888-888888888888",
    ]) {
      expect(parsePendingCursor({
        pendingDate: "2026-07-21",
        pendingKind: "extraordinary_collection",
        pendingId: id,
      })).toEqual({ datedOn: "2026-07-21", sourceKind: "extraordinary_collection", id });
      expect(parsePendingSelection({ regularizesKind: "repayment", regularizesId: id }))
        .toEqual({ sourceKind: "repayment", id });
    }

    for (const id of [
      "00000000-0000-0000-8000-000000000000",
      "99999999-9999-9999-b999-999999999999",
      "77777777-7777-7777-7777-777777777777",
    ]) {
      expect(parsePendingCursor({
        pendingDate: "2026-07-21",
        pendingKind: "contribution",
        pendingId: id,
      })).toBeNull();
      expect(parsePendingSelection({ regularizesKind: "contribution", regularizesId: id })).toBeNull();
    }
  });

  it("safely encodes allowlisted values and ignores untrusted query keys", () => {
    expect(pendingMovementHref(
      { error: "bad value & more", arbitrary: "<script>alert(1)</script>" },
      { regularizesKind: "contribution", regularizesId: selected.id },
    )).toBe(
      `/movimientos/registrar?error=bad+value+%26+more&regularizesKind=contribution&regularizesId=${selected.id}`,
    );
  });

  it("keeps an exact deep-linked row visible outside the current page without duplicates", () => {
    const other = { ...selected, id: "99999999-9999-4999-8999-999999999999" };
    expect(mergePendingRows([other], selected)).toEqual([selected, other]);
    expect(mergePendingRows([selected, other], selected)).toEqual([selected, other]);
  });
});
