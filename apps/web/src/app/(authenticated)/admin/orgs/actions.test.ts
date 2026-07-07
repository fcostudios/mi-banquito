import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string): never => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const createOrganization = vi.fn();
const requirePlatformOperator = vi.fn();
const createOrganizationWithAuth0 = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/require-session", () => ({
  requirePlatformOperator: () => requirePlatformOperator(),
}));

vi.mock("@/lib/auth0/admin-client", () => ({
  createAuth0AdminClientFromEnv: () => ({
    createOrganization: createOrganizationWithAuth0,
  }),
}));

vi.mock("@mi-banquito/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mi-banquito/domain")>();
  return {
    ...actual,
    createPlatformService: () => ({
      createOrganization,
      updateOrganizationLifecycle: vi.fn(),
    }),
  };
});

function organizationForm() {
  const formData = new FormData();
  formData.set("displayName", "Banquito Centro");
  formData.set("brandingLogoUri", "");
  return formData;
}

describe("admin org actions", () => {
  beforeEach(() => {
    redirect.mockClear();
    createOrganization.mockReset();
    requirePlatformOperator.mockReset();
    createOrganizationWithAuth0.mockReset();

    requirePlatformOperator.mockResolvedValue({
      actorId: "22222222-2222-4222-8222-222222222222",
      userId: "auth0|operator",
    });
    createOrganization.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    createOrganizationWithAuth0.mockResolvedValue({ auth0OrgId: "org_created" });
  });

  it("creates organizations with the real Auth0 admin provisioner", async () => {
    const { createOrganizationAction } = await import("./actions");

    await expect(createOrganizationAction(organizationForm()))
      .rejects.toThrow("NEXT_REDIRECT:/admin/orgs/11111111-1111-4111-8111-111111111111");

    expect(createOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Banquito Centro" }),
      "22222222-2222-4222-8222-222222222222",
      expect.objectContaining({ createOrganization: expect.any(Function) }),
    );

    const provisioner = createOrganization.mock.calls[0]?.[2];
    await expect(provisioner.createOrganization({
      displayName: "Banquito Centro",
      orgId: "11111111-1111-4111-8111-111111111111",
    })).resolves.toEqual({ auth0OrgId: "org_created" });
    expect(createOrganizationWithAuth0).toHaveBeenCalledWith({
      displayName: "Banquito Centro",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
  });
});
