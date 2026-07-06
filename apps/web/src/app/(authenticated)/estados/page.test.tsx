import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ScrStatementsArchivePage from "./page";

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => Promise.resolve({
    orgId: "11111111-1111-4111-8111-111111111111",
    actorId: "33333333-3333-4333-8333-333333333333",
  }),
}));

vi.mock("./actions", () => ({
  generateMemberStatementsAction: vi.fn(),
  shareStatementAction: vi.fn(),
}));

const listStatementArchive = vi.fn();

vi.mock("@mi-banquito/domain", () => ({
  createReportingService: () => ({
    listStatementArchive,
  }),
}));

describe("ScrStatementsArchivePage", () => {
  it("shows batch generation CTA and member statement share actions", async () => {
    listStatementArchive.mockResolvedValueOnce([
      {
        id: "close-1",
        kind: "monthly_close",
        periodLabel: "2026-06",
        generatedAt: new Date("2026-07-05T20:00:00.000Z"),
        canonicalPayloadHash: "a".repeat(64),
        pdfUri: `/statement-archive/monthly-close/${"a".repeat(64)}.pdf`,
        periodCloseId: "period-close-1",
      },
      {
        id: "member-1",
        kind: "monthly_member",
        periodLabel: "2026-06",
        generatedAt: new Date("2026-07-05T20:05:00.000Z"),
        canonicalPayloadHash: "b".repeat(64),
        pdfUri: `/statement-archive/public/${"b".repeat(64)}.pdf`,
        periodCloseId: "period-close-1",
      },
    ]);

    render(await ScrStatementsArchivePage());

    expect(screen.getByRole("button", { name: "Generar estados de cuenta de 2026-06" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compartir por WhatsApp" })).toBeInTheDocument();
    expect(screen.getByText("1 estados por socia listos para compartir.")).toBeInTheDocument();
  });
});
