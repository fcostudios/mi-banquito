import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const redirect = vi.fn((path: string): never => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
const selectResponses: unknown[][] = [];
const updateSet = vi.fn();
const updateWhere = vi.fn();
const insertValues = vi.fn();
function consumeSelectResponse() {
  return Promise.resolve(selectResponses.shift() ?? []);
}
function createSelectBuilder(): unknown {
  const builder = {
    from: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => consumeSelectResponse()),
    then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
      consumeSelectResponse().then(resolve, reject),
  };
  return builder;
}
const db = {
  select: vi.fn(() => createSelectBuilder()),
  update: vi.fn(() => ({
    set: updateSet.mockReturnValue({
      where: updateWhere.mockResolvedValue(undefined),
    }),
  })),
  insert: vi.fn(() => ({
    values: insertValues.mockResolvedValue(undefined),
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

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  desc: (...args: unknown[]) => ({ desc: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
}));

vi.mock("@mi-banquito/db", () => ({
  db,
}));

vi.mock("@mi-banquito/db/tenant", () => ({
  withTenantTransaction: (_orgId: string, run: (tx: typeof db) => Promise<unknown>) => run(db),
}));

vi.mock("@mi-banquito/db/schema", () => ({
  organization: {
    id: "organization.id",
    displayName: "organization.display_name",
    status: "organization.status",
    platformOperatorId: "organization.platform_operator_id",
  },
  authAdminAction: {
    id: "auth_admin_action.id",
    orgId: "auth_admin_action.org_id",
    actionKind: "auth_admin_action.action_kind",
    targetEmail: "auth_admin_action.target_email",
    actorId: "auth_admin_action.actor_id",
    providerRequestId: "auth_admin_action.provider_request_id",
    status: "auth_admin_action.status",
    createdAt: "auth_admin_action.created_at",
  },
  auditLogEntry: {
    id: "audit_log_entry.id",
    orgId: "audit_log_entry.org_id",
    actorKind: "audit_log_entry.actor_kind",
    actorId: "audit_log_entry.actor_id",
    actionKind: "audit_log_entry.action_kind",
    subjectKind: "audit_log_entry.subject_kind",
    subjectId: "audit_log_entry.subject_id",
    at: "audit_log_entry.at",
  },
  member: {
    id: "member.id",
    authSubject: "member.auth_subject",
    updatedAt: "member.updated_at",
  },
  platformOperator: {
    id: "platform_operator.id",
    authSubject: "platform_operator.auth_subject",
    status: "platform_operator.status",
  },
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
    role: "user_org_membership.role",
    status: "user_org_membership.status",
  },
}));

describe("requireRole", () => {
  beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
    db.select.mockClear();
    db.update.mockClear();
    db.insert.mockClear();
    updateSet.mockReset();
    updateWhere.mockReset();
    insertValues.mockReset();
    warn.mockClear();
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
    expect(warn).toHaveBeenCalledWith("auth_gate_denied", expect.objectContaining({
      reason: "missing_org_claim",
      hasUserId: true,
      roles: [],
    }));
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
      [{ status: "active", platformOperatorId: "22222222-2222-4222-8222-222222222222" }],
      [],
      [{ memberId: "33333333-3333-4333-8333-333333333333", userAccountId: "44444444-4444-4444-8444-444444444444" }],
      [{
        id: "55555555-5555-4555-8555-555555555555",
        actorId: "22222222-2222-4222-8222-222222222222",
        providerRequestId: "invitation|123",
      }],
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
    expect(updateSet).toHaveBeenCalledWith({
      authSubject: "auth0|real-user",
      updatedAt: expect.any(Date),
    });
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      orgId: "11111111-1111-4111-8111-111111111111",
      actorKind: "platform_operator",
      actorId: "22222222-2222-4222-8222-222222222222",
      actionKind: "auth.invite.accepted",
      subjectKind: "member",
      subjectId: "33333333-3333-4333-8333-333333333333",
      payloadSnapshot: expect.objectContaining({
        email: "pancho@fcostudios.io",
        authSubject: "auth0|real-user",
        userAccountId: "44444444-4444-4444-8444-444444444444",
        inviteActionId: "55555555-5555-4555-8555-555555555555",
        providerRequestId: "invitation|123",
      }),
    }));
  });

  it("uses the original invite audit actor when the admin action row is unavailable", async () => {
    const { requireTreasurer } = await import("./require-session");
    getSession.mockResolvedValueOnce({
      user: {
        sub: "auth0|real-user",
        email: "AuditOnly@FcoStudios.io",
        email_verified: true,
        "https://mi-banquito.app/org_id": "11111111-1111-4111-8111-111111111111",
        "https://mi-banquito.app/roles": ["TESORERA"],
      },
    });
    selectResponses.push(
      [{ status: "active", platformOperatorId: null }],
      [],
      [{ memberId: "33333333-3333-4333-8333-333333333333", userAccountId: "44444444-4444-4444-8444-444444444444" }],
      [],
      [{
        id: "66666666-6666-4666-8666-666666666666",
        actorId: "22222222-2222-4222-8222-222222222222",
      }],
    );

    await expect(requireTreasurer()).resolves.toMatchObject({
      userId: "auth0|real-user",
      actorId: "33333333-3333-4333-8333-333333333333",
    });
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      actorKind: "platform_operator",
      actorId: "22222222-2222-4222-8222-222222222222",
      actionKind: "auth.invite.accepted",
      payloadSnapshot: expect.objectContaining({
        email: "auditonly@fcostudios.io",
        inviteAuditId: "66666666-6666-4666-8666-666666666666",
      }),
    }));
  });

  it("uses configured Auth0 organization and active DB membership role when custom claims are absent", async () => {
    vi.stubEnv("AUTH0_ORGANIZATION", "org_Chul6oWgE2ZzCNvE");
    vi.stubEnv("AUTH0_ORGANIZATION_DB_ORG_ID", "11111111-1111-4111-8111-111111111111");
    const { requireTreasurer } = await import("./require-session");
    getSession.mockResolvedValueOnce({
      user: {
        sub: "auth0|real-user",
        email: "pancho@fcostudios.io",
        email_verified: true,
        org_id: "org_Chul6oWgE2ZzCNvE",
      },
    });
    selectResponses.push(
      [{ status: "active" }],
      [
        {
          memberId: "33333333-3333-4333-8333-333333333333",
          userAccountId: "44444444-4444-4444-8444-444444444444",
          role: "TESORERA",
        },
      ],
    );

    await expect(requireTreasurer()).resolves.toMatchObject({
      userId: "auth0|real-user",
      actorId: "33333333-3333-4333-8333-333333333333",
      orgId: "11111111-1111-4111-8111-111111111111",
      roles: ["TESORERA"],
    });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("requirePlatformOperator", () => {
  beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
    db.select.mockClear();
    warn.mockClear();
    selectResponses.length = 0;
  });

  it("allows an active DB platform operator even when Auth0 role claims are absent", async () => {
    const { requirePlatformOperator } = await import("./require-session");
    getSession.mockResolvedValueOnce({
      user: {
        sub: "auth0|operator",
        email: "pancho@fcostudios.io",
        "https://mi-banquito.app/org_id": "11111111-1111-4111-8111-111111111111",
      },
    });
    selectResponses.push([{ id: "22222222-2222-4222-8222-222222222222" }]);

    await expect(requirePlatformOperator()).resolves.toMatchObject({
      userId: "auth0|operator",
      actorId: "22222222-2222-4222-8222-222222222222",
      orgId: "11111111-1111-4111-8111-111111111111",
      roles: ["PLATFORM_OPERATOR"],
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("denies a signed-in user without a DB platform operator row", async () => {
    const { requirePlatformOperator } = await import("./require-session");
    getSession.mockResolvedValueOnce({
      user: {
        sub: "auth0|member",
        roles: ["TESORERA"],
      },
    });
    selectResponses.push([]);

    await expect(requirePlatformOperator()).rejects.toThrow("NEXT_REDIRECT:/acceso-denegado");
    expect(redirect).toHaveBeenCalledWith("/acceso-denegado");
  });
});

describe("getShellSession", () => {
  beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
    warn.mockClear();
    db.select.mockClear();
    selectResponses.length = 0;
  });

  it("redirects anonymous authenticated-shell requests before rendering children", async () => {
    const { getShellSession } = await import("./require-session");
    getSession.mockResolvedValueOnce(null);

    await expect(getShellSession()).rejects.toThrow("NEXT_REDIRECT:/auth/login");
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("adds platform operator role from the DB for shell navigation", async () => {
    const { getShellSession } = await import("./require-session");
    getSession.mockResolvedValueOnce({
      user: {
        sub: "auth0|operator",
        email: "pancho@fcostudios.io",
        "https://mi-banquito.app/org_id": "11111111-1111-4111-8111-111111111111",
      },
    });
    selectResponses.push(
      [{ id: "22222222-2222-4222-8222-222222222222" }],
      [{ displayName: "Mi Banquito FcoStudios" }],
      [{ role: "TESORERA" }],
    );

    await expect(getShellSession()).resolves.toMatchObject({
      roles: ["TESORERA", "PLATFORM_OPERATOR"],
      orgName: "Mi Banquito FcoStudios",
    });
  });
});
