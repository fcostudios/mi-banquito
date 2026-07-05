import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ScrAdminPilotLogPage from "./page";

vi.mock("@/lib/auth/require-session", () => ({
  requirePlatformOperator: () => Promise.resolve({
    actorId: "22222222-2222-4222-8222-222222222222",
    userId: "auth0|operator",
    roles: ["PLATFORM_OPERATOR"],
  }),
}));

vi.mock("./actions", () => ({
  addPilotLogEntryAction: vi.fn(),
}));

vi.mock("@mi-banquito/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mi-banquito/domain")>();
  return {
    ...actual,
    createPilotService: () => ({
      listEntries: () => Promise.resolve([]),
    }),
  };
});

describe("ScrAdminPilotLogPage", () => {
  it("offers the pilot exit report download for the selected org", async () => {
    render(await ScrAdminPilotLogPage({
      params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
    }));

    expect(screen.getByRole("link", { name: "Generar reporte de salida del piloto" })).toHaveAttribute(
      "href",
      "/admin/orgs/11111111-1111-4111-8111-111111111111/pilot-log/report",
    );
  });
});
