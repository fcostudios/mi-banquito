import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

describe("createAuth0AdminClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("fetches a management token and sends an organization invitation", async () => {
    const { createAuth0AdminClient } = await import("./admin-client");
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "mgmt-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "inv_123" }),
      });

    const client = createAuth0AdminClient({
      domain: "example.us.auth0.com",
      clientId: "client-id",
      clientSecret: "client-secret",
    });

    await expect(client.inviteTreasurer({
      auth0OrgId: "org_abc",
      email: "tesorera@example.com",
      displayName: "Tesorera Nueva",
      appMetadata: { org_id: "11111111-1111-4111-8111-111111111111" },
    })).resolves.toEqual({ providerRequestId: "inv_123" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://example.us.auth0.com/oauth/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: "client-id",
          client_secret: "client-secret",
          audience: "https://example.us.auth0.com/api/v2/",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://example.us.auth0.com/api/v2/organizations/org_abc/invitations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer mgmt-token",
        }),
        body: JSON.stringify({
          inviter: { name: "Mi Banquito" },
          invitee: { email: "tesorera@example.com" },
          client_id: "client-id",
          app_metadata: { org_id: "11111111-1111-4111-8111-111111111111" },
          user_metadata: { display_name: "Tesorera Nueva" },
          send_invitation_email: true,
        }),
      }),
    );
  });

  it("starts an Auth0 passwordless email magic-link flow", async () => {
    const { createAuth0AdminClient } = await import("./admin-client");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ _id: "passwordless_123" }),
    });

    const client = createAuth0AdminClient({
      domain: "example.us.auth0.com",
      clientId: "client-id",
      clientSecret: "client-secret",
    });

    await expect(client.sendPasswordlessLink({
      email: "tesorera@example.com",
      auth0OrgId: "org_abc",
    })).resolves.toEqual({ providerRequestId: "passwordless_123" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.us.auth0.com/passwordless/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          client_id: "client-id",
          client_secret: "client-secret",
          connection: "email",
          email: "tesorera@example.com",
          send: "link",
          authParams: {
            scope: "openid profile email",
            organization: "org_abc",
          },
        }),
      }),
    );
  });

  it("creates an Auth0 organization through the Management API", async () => {
    const { createAuth0AdminClient } = await import("./admin-client");
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "mgmt-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "org_created" }),
      });

    const client = createAuth0AdminClient({
      domain: "example.us.auth0.com",
      clientId: "client-id",
      clientSecret: "client-secret",
    });

    await expect(client.createOrganization({
      displayName: "Banquito Centro",
      orgId: "11111111-1111-4111-8111-111111111111",
    })).resolves.toEqual({ auth0OrgId: "org_created" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://example.us.auth0.com/api/v2/organizations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer mgmt-token",
        }),
        body: JSON.stringify({
          name: "banquito-centro-11111111",
          display_name: "Banquito Centro",
          metadata: {
            db_org_id: "11111111-1111-4111-8111-111111111111",
          },
        }),
      }),
    );
  });


  it("raises a redacted error when Auth0 rejects a request", async () => {
    const { createAuth0AdminClient } = await import("./admin-client");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve("secret-bearing auth0 body"),
    });

    const client = createAuth0AdminClient({
      domain: "example.us.auth0.com",
      clientId: "client-id",
      clientSecret: "client-secret",
    });

    await expect(client.inviteTreasurer({
      auth0OrgId: "org_abc",
      email: "tesorera@example.com",
      displayName: "Tesorera Nueva",
    })).rejects.toThrow("auth0_token_failed:403");
  });
});
