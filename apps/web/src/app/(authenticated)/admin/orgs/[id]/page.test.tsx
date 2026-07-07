import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ScrAdminOrgDetailPage from "./page";

const getOrganization = vi.fn();
const getOrganizationCloseOverdueSnapshot = vi.fn();

vi.mock("@/lib/auth/require-session", () => ({
  requirePlatformOperator: () => Promise.resolve({
    actorId: "22222222-2222-4222-8222-222222222222",
    userId: "auth0|operator",
  }),
}));

vi.mock("./invite-treasurer/actions", () => ({
  inviteTreasurerAction: vi.fn(),
}));

vi.mock("./reset-treasurer-login/actions", () => ({
  resetTreasurerLoginAction: vi.fn(),
}));

vi.mock("../actions", () => ({
  updateOrganizationLifecycleAction: vi.fn(),
}));

vi.mock("@mi-banquito/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mi-banquito/domain")>();
  return {
    ...actual,
    createPlatformService: () => ({
      getOrganization,
      getOrganizationCloseOverdueSnapshot,
    }),
  };
});

describe("ScrAdminOrgDetailPage", () => {
  it("shows Auth0 org ID, reset cooldown, and WhatsApp share link", async () => {
    getOrganization.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      displayName: "Banquito Centro",
      auth0OrgId: "org_auth0",
      status: "active",
      countryCode: "EC",
      currencyCode: "USD",
      timezone: "America/Guayaquil",
      defaultLanguage: "es-EC",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    getOrganizationCloseOverdueSnapshot.mockResolvedValueOnce(undefined);

    render(await ScrAdminOrgDetailPage({
      params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
      searchParams: Promise.resolve({
        authAccessError: "reset-rate-limited",
        resetCooldownSeconds: "125",
        whatsappCopy: "Hola tesorera",
      }),
    }));

    expect(screen.getByText("Auth0 Org ID")).toBeInTheDocument();
    expect(screen.getByText("org_auth0")).toBeInTheDocument();
    expect(screen.getByText("Ya se envió un enlace hace menos de cinco minutos. Espera 2m 5s antes de reenviar.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Compartir por WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/?text=Hola%20tesorera",
    );
  });
});
