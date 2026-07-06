import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MemberListPage from "./page";

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => Promise.resolve({
    orgId: "11111111-1111-4111-8111-111111111111",
    actorId: "33333333-3333-4333-8333-333333333333",
  }),
}));

const listMembersWithCompliance = vi.fn();

vi.mock("@mi-banquito/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mi-banquito/domain")>();
  return {
    ...actual,
    createLedgerService: () => ({
      listMembersWithCompliance,
    }),
  };
});

describe("MemberListPage", () => {
  it("renders a mobile-friendly search field and filters socias by partial name", async () => {
    listMembersWithCompliance.mockResolvedValueOnce([
      {
        id: "11111111-1111-4111-8111-111111111111",
        displayName: "Ana Mora",
        whatsappNumber: "+593991234567",
        role: "aportante",
        status: "activo",
        complianceState: "al_dia",
        complianceTone: "success",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        displayName: "Francisco Lomas",
        whatsappNumber: "+593991111111",
        role: "tesorera",
        status: "activo",
        complianceState: "al_dia",
        complianceTone: "success",
      },
    ]);

    render(await MemberListPage({ searchParams: Promise.resolve({ q: "ana" }) }));

    expect(screen.getByLabelText("Buscar socias")).toHaveValue("ana");
    expect(screen.getByRole("button", { name: "Buscar" })).toBeInTheDocument();
    const results = screen.getByRole("list", { name: "Socias" });
    expect(within(results).getByText("Ana Mora")).toBeInTheDocument();
    expect(within(results).queryByText("Francisco Lomas")).not.toBeInTheDocument();
  });
});
