import { describe, expect, it } from "vitest";

import {
  buildChaseMessage,
  buildWhatsAppChaseUrl,
  defaultPromiseDate,
  normalizePromiseSourceRef,
  promiseReminderCandidates,
  sortAgingRows,
} from "./collections";

describe("collections", () => {
  it("sorts aging rows by days late descending by default", () => {
    expect(sortAgingRows([
      { id: "due-2", daysLate: 2 },
      { id: "due-9", daysLate: 9 },
      { id: "due-5", daysLate: 5 },
    ])).toEqual([
      { id: "due-9", daysLate: 9 },
      { id: "due-5", daysLate: 5 },
      { id: "due-2", daysLate: 2 },
    ]);
  });

  it("defaults promise dates to seven days after today", () => {
    expect(defaultPromiseDate("2026-07-04")).toBe("2026-07-11");
  });

  it("normalizes overdue row source refs to exactly one promise source", () => {
    expect(normalizePromiseSourceRef({ sourceKind: "loan", sourceId: "loan-1" })).toEqual({
      loanId: "loan-1",
      cycleId: null,
    });
    expect(normalizePromiseSourceRef({ sourceKind: "cycle", sourceId: "cycle-1" })).toEqual({
      loanId: null,
      cycleId: "cycle-1",
    });
    expect(() => normalizePromiseSourceRef({ sourceKind: "loan", sourceId: "" })).toThrow("promise_source_required");
    expect(() => normalizePromiseSourceRef({ loanId: "loan-1", cycleId: "cycle-1" }))
      .toThrow("promise_source_must_be_exactly_one");
    expect(() => normalizePromiseSourceRef({ loanId: null, cycleId: null }))
      .toThrow("promise_source_must_be_exactly_one");
  });

  it("builds warm Spanish WhatsApp chase copy for aporte rows", () => {
    expect(buildChaseMessage({
      member: "María",
      obligationKind: "aporte",
      period: "julio 2026",
    })).toBe("Hola María, te comparto que tu aporte de julio 2026 aún está pendiente. ¿Cuándo crees poder hacerlo? - Mi Banquito.");
  });

  it("builds wa.me chase URLs only when a number exists", () => {
    const message = buildChaseMessage({
      member: "María",
      obligationKind: "aporte",
      period: "julio 2026",
    });

    expect(buildWhatsAppChaseUrl({ whatsappNumber: "+593 99 123 4567", message }))
      .toBe("https://wa.me/593991234567?text=Hola%20Mar%C3%ADa%2C%20te%20comparto%20que%20tu%20aporte%20de%20julio%202026%20a%C3%BAn%20est%C3%A1%20pendiente.%20%C2%BFCu%C3%A1ndo%20crees%20poder%20hacerlo%3F%20-%20Mi%20Banquito.");
    expect(buildWhatsAppChaseUrl({ whatsappNumber: null, message })).toBeNull();
    expect(buildWhatsAppChaseUrl({ whatsappNumber: "   ", message })).toBeNull();
  });

  it("returns only open due promises for reminder candidates", () => {
    expect(promiseReminderCandidates([
      { id: "due-yesterday", status: "open", promisedOn: "2026-07-03" },
      { id: "due-today", status: "open", promisedOn: "2026-07-04" },
      { id: "future", status: "open", promisedOn: "2026-07-05" },
      { id: "kept", status: "kept", promisedOn: "2026-07-04" },
      { id: "broken", status: "broken", promisedOn: "2026-07-01" },
    ], "2026-07-04")).toEqual([
      { id: "due-yesterday", status: "open", promisedOn: "2026-07-03" },
      { id: "due-today", status: "open", promisedOn: "2026-07-04" },
    ]);
  });
});
