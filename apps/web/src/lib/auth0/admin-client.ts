import { parseServerEnvForAuthClient } from "@/lib/env";

type Auth0AdminClientConfig = {
  domain: string;
  clientId: string;
  clientSecret: string;
};

type InviteTreasurerInput = {
  auth0OrgId: string;
  email: string;
  displayName: string;
  appMetadata?: Record<string, unknown>;
};

type PasswordlessLinkInput = {
  email: string;
  auth0OrgId: string;
};

type CreateOrganizationInput = {
  displayName: string;
  orgId: string;
};

type ProviderResult = {
  providerRequestId?: string;
};

export type Auth0AdminClient = {
  createOrganization(input: CreateOrganizationInput): Promise<{ auth0OrgId?: string }>;
  inviteTreasurer(input: InviteTreasurerInput): Promise<ProviderResult>;
  sendPasswordlessLink(input: PasswordlessLinkInput): Promise<ProviderResult>;
};

function baseUrl(domain: string): string {
  return `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({}));
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

async function fetchJson(
  url: string,
  init: RequestInit,
  errorKind: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${errorKind}:${response.status}`);
  }
  return readJson(response);
}

function providerRequestIdFrom(body: Record<string, unknown>): string | undefined {
  const id = body.id ?? body._id;
  return typeof id === "string" ? id : undefined;
}

function organizationName(input: CreateOrganizationInput): string {
  const normalized = input.displayName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${normalized || "org"}-${input.orgId.slice(0, 8)}`;
}

export function createAuth0AdminClient(config: Auth0AdminClientConfig): Auth0AdminClient {
  const origin = baseUrl(config.domain);

  async function managementToken(): Promise<string> {
    const body = await fetchJson(
      `${origin}/oauth/token`,
      {
        method: "POST",
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: config.clientId,
          client_secret: config.clientSecret,
          audience: `${origin}/api/v2/`,
        }),
      },
      "auth0_token_failed",
    );
    if (typeof body.access_token !== "string") {
      throw new Error("auth0_token_missing");
    }
    return body.access_token;
  }

  return {
    async createOrganization(input) {
      const token = await managementToken();
      const body = await fetchJson(
        `${origin}/api/v2/organizations`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: organizationName(input),
            display_name: input.displayName,
            metadata: {
              db_org_id: input.orgId,
            },
          }),
        },
        "auth0_organization_failed",
      );
      return { auth0OrgId: providerRequestIdFrom(body) };
    },

    async inviteTreasurer(input) {
      const token = await managementToken();
      const body = await fetchJson(
        `${origin}/api/v2/organizations/${encodeURIComponent(input.auth0OrgId)}/invitations`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            inviter: { name: "Mi Banquito" },
            invitee: { email: input.email },
            client_id: config.clientId,
            app_metadata: input.appMetadata,
            user_metadata: { display_name: input.displayName },
            send_invitation_email: true,
          }),
        },
        "auth0_invitation_failed",
      );
      return { providerRequestId: providerRequestIdFrom(body) };
    },

    async sendPasswordlessLink(input) {
      const body = await fetchJson(
        `${origin}/passwordless/start`,
        {
          method: "POST",
          body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            connection: "email",
            email: input.email,
            send: "link",
            authParams: {
              scope: "openid profile email",
              organization: input.auth0OrgId,
            },
          }),
        },
        "auth0_passwordless_failed",
      );
      return { providerRequestId: providerRequestIdFrom(body) };
    },
  };
}

export function createAuth0AdminClientFromEnv(): Auth0AdminClient {
  const env = parseServerEnvForAuthClient();
  return createAuth0AdminClient({
    domain: env.AUTH0_DOMAIN,
    clientId: env.AUTH0_CLIENT_ID,
    clientSecret: env.AUTH0_CLIENT_SECRET,
  });
}
