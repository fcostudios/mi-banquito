import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const redirect = vi.fn((path: string): never => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const selectResponses: unknown[][] = [];
const updateSet = vi.fn();
const updateWhere = vi.fn();
const db = {
  select: vi.fn(() => ({
    from: () => ({
      innerJoin: () => ({
        where: () => Promise.resolve(selectResponses.shift() ?? []),
      }),
    }),
  })),
  update: vi.fn(() => ({
    set: updateSet.mockReturnValue({
      where: updateWhere.mockResolvedValue(undefined),
    }),
  })),
};

vi.mock("@/lib/auth0", () => ({
  auth0: {
    getSession: () => getSession(),
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
}));

vi.mock("@mi-banquito/db", () => ({
  db,
}));

vi.mock("@mi-banquito/db/schema", () => ({
  platformOperator: {},
  userAccount: {
    id: "user_account.id",
    authSubject: "user_account.auth_subject",
    email: "user_account.email",
    status: "user_account.status",
    updatedAt: "user_account.updated_at",
  },
  userOrgMembership: {
    memberId: "user_org_membership.member_id",
    userId: "user_org_membership.user_id",
    orgId: "user_org_membership.org_id",
    status: "user_org_membership.status",
  },
}));

describe("requireRole", () => {
  beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
    db.select.mockClear();
    db.update.mockClear();
    updateSet.mockReset();
    updateWhere.mockReset();
    selectResponses.length = 0;
  });

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

  it("links an active pending email membership to the Auth0 subject on first login", async () => {
    const { requireTreasurer } = await import("./require-session");
    getSession.mockResolvedValueOnce({
      user: {
        sub: "auth0|real-user",
        email: "Pancho@FcoStudios.io",
        email_verified: true,
        "https://mi-banquito.app/org_id": "11111111-1111-4111-8111-111111111111",
        "https://mi-banquito.app/roles": ["TESORERA"],
      },
    });
    selectResponses.push(
      [],
      [{ memberId: "33333333-3333-4333-8333-333333333333", userAccountId: "44444444-4444-4444-8444-444444444444" }],
    );

    await expect(requireTreasurer()).resolves.toMatchObject({
      userId: "auth0|real-user",
      actorId: "33333333-3333-4333-8333-333333333333",
      orgId: "11111111-1111-4111-8111-111111111111",
      roles: ["TESORERA"],
    });
    expect(db.update).toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith({
      authSubject: "auth0|real-user",
      updatedAt: expect.any(Date),
    });
  });
});
