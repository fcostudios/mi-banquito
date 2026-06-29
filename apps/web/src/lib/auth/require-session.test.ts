import { describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const redirect = vi.fn((path: string): never => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});

vi.mock("@/lib/auth0", () => ({
  auth0: {
    getSession: () => getSession(),
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

vi.mock("@mi-banquito/db", () => ({
  db: {},
}));

vi.mock("@mi-banquito/db/schema", () => ({
  platformOperator: {},
  userAccount: {},
  userOrgMembership: {},
}));

describe("requireRole", () => {
  it("redirects anonymous users to login", async () => {
    const { requireTreasurer } = await import("./require-session");
    getSession.mockResolvedValueOnce(null);

    await expect(requireTreasurer()).rejects.toThrow("NEXT_REDIRECT:/auth/login");
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("does not re-run login for an authenticated user missing app org claims", async () => {
    const { requireTreasurer } = await import("./require-session");
    getSession.mockResolvedValueOnce({ user: { sub: "auth0|missing-org" } });

    await expect(requireTreasurer()).rejects.toThrow("NEXT_REDIRECT:/acceso-denegado");
    expect(redirect).toHaveBeenCalledWith("/acceso-denegado");
  });
});
