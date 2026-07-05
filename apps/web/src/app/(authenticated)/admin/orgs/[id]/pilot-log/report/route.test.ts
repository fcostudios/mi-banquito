import { describe, expect, it, vi } from "vitest";

import { GET } from "./route";

vi.mock("@/lib/auth/require-session", () => ({
  requirePlatformOperator: () => Promise.resolve({
    actorId: "22222222-2222-4222-8222-222222222222",
    userId: "auth0|operator",
    roles: ["PLATFORM_OPERATOR"],
  }),
}));

vi.mock("@mi-banquito/domain", () => ({
  createPilotService: () => ({
    listEntries: () => Promise.resolve([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId: "11111111-1111-4111-8111-111111111111",
        observedOn: "2026-07-01",
        vocabularyAnswer: "Todo claro",
        paperValue: "$100.00",
        systemValue: "$100.00",
        discrepancy: "$0.00",
        wouldNotReturnToPaper: true,
        cleanMonth: true,
        note: "Primera revision",
        loggedBy: "22222222-2222-4222-8222-222222222222",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ]),
  }),
  evaluatePilotExitChecklist: () => ({
    hasThreeCleanMonths: false,
    hasWouldNotReturnAffirmation: true,
    readyToExit: false,
  }),
}));

describe("pilot exit report route", () => {
  it("returns a downloadable PDF document with the pilot report content", async () => {
    const response = await GET(new Request("http://localhost/report"), {
      params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
    });

    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder().decode(bytes);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="pilot-11111111-1111-4111-8111-111111111111.pdf"',
    );
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("Reporte de salida del piloto");
    expect(text).toContain("Org: 11111111-1111-4111-8111-111111111111");
    expect(text).toContain("2026-07-01: cuaderno=$100.00; sistema=$100.00; diferencia=$0.00");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});
