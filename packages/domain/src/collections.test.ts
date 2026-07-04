import { describe, expect, it } from "vitest";

import {
  buildChaseMessage,
  buildWhatsAppChaseUrl,
  createCollectionsService,
  defaultPromiseDate,
  normalizePromiseSourceRef,
  promiseReminderCandidates,
  sortAgingRows,
} from "./collections";

describe("collections", () => {
  if (false) {
    // @ts-expect-error Public date helper inputs are date-only strings, not Date objects.
    defaultPromiseDate(new Date());
    // @ts-expect-error Reminder promised dates are date-only strings, not Date objects.
    promiseReminderCandidates([{ status: "open", promisedOn: new Date() }], "2026-07-04");
  }

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

  it("sorts aging row ties deterministically by member, due date, and id", () => {
    expect(sortAgingRows([
      { id: "b-loan", memberName: "Zoila", dueDate: "2026-07-01", daysLate: 9 },
      { id: "c-loan", memberName: "Ana", dueDate: "2026-07-02", daysLate: 9 },
      { id: "a-loan", memberName: "Ana", dueDate: "2026-07-01", daysLate: 9 },
      { id: "late", memberName: "Belen", dueDate: "2026-06-01", daysLate: 12 },
      { id: "d-loan", memberName: "Ana", dueDate: "2026-07-01", daysLate: 9 },
    ])).toEqual([
      { id: "late", memberName: "Belen", dueDate: "2026-06-01", daysLate: 12 },
      { id: "a-loan", memberName: "Ana", dueDate: "2026-07-01", daysLate: 9 },
      { id: "d-loan", memberName: "Ana", dueDate: "2026-07-01", daysLate: 9 },
      { id: "c-loan", memberName: "Ana", dueDate: "2026-07-02", daysLate: 9 },
      { id: "b-loan", memberName: "Zoila", dueDate: "2026-07-01", daysLate: 9 },
    ]);
  });

  it("preserves input order for minimal aging row ties", () => {
    const first = { daysLate: 3 };
    const second = { daysLate: 3 };

    expect(sortAgingRows([first, second])).toEqual([first, second]);
  });

  it("defaults promise dates to seven days after today", () => {
    expect(defaultPromiseDate("2026-07-04")).toBe("2026-07-11");
  });

  it("defaults promise dates across month and year rollover", () => {
    expect(defaultPromiseDate("2026-01-29")).toBe("2026-02-05");
    expect(defaultPromiseDate("2026-12-28")).toBe("2027-01-04");
  });

  it("rejects impossible date-only values instead of rolling them forward", () => {
    expect(() => defaultPromiseDate("2026-02-30")).toThrow("date_must_be_valid");
    expect(() => promiseReminderCandidates([
      { id: "bad", status: "open", promisedOn: "2026-02-30" },
    ], "2026-07-04")).toThrow("date_must_be_valid");
    expect(() => promiseReminderCandidates([], "2026-13-01")).toThrow("date_must_be_valid");
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

  it("trims source IDs before normalizing promise source refs", () => {
    expect(normalizePromiseSourceRef({ sourceKind: "loan", sourceId: " loan-1 " })).toEqual({
      loanId: "loan-1",
      cycleId: null,
    });
    expect(normalizePromiseSourceRef({ loanId: " loan-2 ", cycleId: null })).toEqual({
      loanId: "loan-2",
      cycleId: null,
    });
  });

  it("builds warm Spanish WhatsApp chase copy for aporte rows", () => {
    expect(buildChaseMessage({
      memberName: "María",
      reasonKind: "aporte",
      periodLabel: "julio 2026",
    })).toBe("Hola María, te comparto que tu aporte de julio 2026 aún está pendiente. ¿Cuándo crees poder hacerlo? - Mi Banquito.");
  });

  it("keeps backwards compatibility for previous chase copy input names", () => {
    expect(buildChaseMessage({
      member: "María",
      obligationKind: "cuota",
      period: "julio 2026",
    })).toBe("Hola María, te comparto que tu cuota de julio 2026 aún está pendiente. ¿Cuándo crees poder hacerlo? - Mi Banquito.");
  });

  it("builds wa.me chase URLs only when a number exists", () => {
    const message = buildChaseMessage({
      memberName: "María",
      reasonKind: "aporte",
      periodLabel: "julio 2026",
    });

    expect(buildWhatsAppChaseUrl({ whatsappNumber: "+593 99 123 4567", message }))
      .toBe("https://wa.me/593991234567?text=Hola%20Mar%C3%ADa%2C%20te%20comparto%20que%20tu%20aporte%20de%20julio%202026%20a%C3%BAn%20est%C3%A1%20pendiente.%20%C2%BFCu%C3%A1ndo%20crees%20poder%20hacerlo%3F%20-%20Mi%20Banquito.");
    expect(buildWhatsAppChaseUrl({ whatsappNumber: null, message })).toBeNull();
    expect(buildWhatsAppChaseUrl({ whatsappNumber: "   ", message })).toBeNull();
  });

  it("does not build wa.me URLs for invalid blank WhatsApp numbers", () => {
    expect(buildWhatsAppChaseUrl({ whatsappNumber: " + - () ", message: "Hola" })).toBeNull();
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

  it("exposes the collections service boundary without opening a DB connection", () => {
    const service = createCollectionsService();

    expect(service.context).toBe("collections");
    expect(service.listAgingRows).toEqual(expect.any(Function));
    expect(service.markPromise).toEqual(expect.any(Function));
    expect(service.recordChaseAttempt).toEqual(expect.any(Function));
    expect(service.emitPromiseReminders).toEqual(expect.any(Function));
  });
});
