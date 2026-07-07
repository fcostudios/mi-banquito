import { beforeEach, describe, expect, it, vi } from "vitest";

const orgId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const userAccountId = "33333333-3333-4333-8333-333333333333";
const memberId = "44444444-4444-4444-8444-444444444444";

const requirePlatformOperator = vi.fn();
const inviteTreasurer = vi.fn();
const sendPasswordlessLink = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn((path: string): never => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const repo = {
  getOrganization: vi.fn(),
  findTreasurerAccessByEmail: vi.fn(),
  createPendingTreasurerAccess: vi.fn(),
  findRecentSentAction: vi.fn(),
  findActiveTreasurerByEmail: vi.fn(),
  logAction: vi.fn(),
};

vi.mock("@/lib/auth/require-session", () => ({
  requirePlatformOperator: vi.fn(),
}));

vi.mock("@mi-banquito/db", () => ({
  db: {},
}));

vi.mock("@mi-banquito/db/tenant", () => ({
  withTenantTransaction: vi.fn(),
}));

function inviteForm(email = "tesorera@example.com", displayName = "Tesorera Nueva") {
  const formData = new FormData();
  formData.set("orgId", orgId);
  formData.set("email", email);
  formData.set("displayName", displayName);
  return formData;
}

function resetForm(email = "tesorera@example.com") {
  const formData = new FormData();
  formData.set("orgId", orgId);
  formData.set("email", email);
  return formData;
}

async function buildActions() {
  const { createAdminAuthActions } = await import("./admin-auth-actions");
  return createAdminAuthActions({
    requirePlatformOperator,
    auth0Client: { inviteTreasurer, sendPasswordlessLink },
    repo,
    revalidatePath,
    redirect,
    now: () => new Date("2026-07-07T14:00:00.000Z"),
  });
}

describe("admin Auth0 access actions", () => {
  beforeEach(() => {
    requirePlatformOperator.mockReset();
    inviteTreasurer.mockReset();
    sendPasswordlessLink.mockReset();
    revalidatePath.mockClear();
    redirect.mockClear();
    Object.values(repo).forEach((fn) => fn.mockReset());

    requirePlatformOperator.mockResolvedValue({ actorId, userId: "auth0|operator" });
    repo.getOrganization.mockResolvedValue({
      id: orgId,
      displayName: "Banquito Centro",
      auth0OrgId: "org_auth0",
    });
    repo.findTreasurerAccessByEmail.mockResolvedValue(undefined);
    repo.createPendingTreasurerAccess.mockResolvedValue({ userAccountId, memberId });
    repo.findRecentSentAction.mockResolvedValue(undefined);
    repo.findActiveTreasurerByEmail.mockResolvedValue({ userAccountId, memberId });
    repo.logAction.mockResolvedValue(undefined);
    inviteTreasurer.mockResolvedValue({ providerRequestId: "inv_123" });
    sendPasswordlessLink.mockResolvedValue({ providerRequestId: "pwd_123" });
  });

  it("creates pending treasurer access, sends an Auth0 invitation, and logs the provider request", async () => {
    const { inviteTreasurerAction } = await buildActions();

    await expect(inviteTreasurerAction(inviteForm("TESORERA@EXAMPLE.COM")))
      .rejects.toThrow(`NEXT_REDIRECT:/admin/orgs/${orgId}?authAccess=invite-sent`);

    expect(repo.createPendingTreasurerAccess).toHaveBeenCalledWith({
      orgId,
      email: "tesorera@example.com",
      displayName: "Tesorera Nueva",
      actorId,
      now: new Date("2026-07-07T14:00:00.000Z"),
    });
    expect(inviteTreasurer).toHaveBeenCalledWith({
      auth0OrgId: "org_auth0",
      email: "tesorera@example.com",
      displayName: "Tesorera Nueva",
      appMetadata: {
        org_id: orgId,
        role: "TESORERA",
        member_id: memberId,
        user_account_id: userAccountId,
      },
    });
    expect(repo.logAction).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      actionKind: "treasurer_invite",
      targetEmail: "tesorera@example.com",
      targetUserId: userAccountId,
      actorKind: "platform_operator",
      actorId,
      providerRequestId: "inv_123",
      status: "sent",
    }));
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/orgs/${orgId}`);
  });

  it("rejects an already accepted active treasurer account instead of sending another invitation", async () => {
    const { inviteTreasurerAction } = await buildActions();
    repo.findTreasurerAccessByEmail.mockResolvedValue({
      accepted: true,
      userAccountId,
      memberId,
    });

    await expect(inviteTreasurerAction(inviteForm()))
      .rejects.toThrow(`NEXT_REDIRECT:/admin/orgs/${orgId}?authAccessError=treasurer-already-active`);

    expect(repo.createPendingTreasurerAccess).not.toHaveBeenCalled();
    expect(inviteTreasurer).not.toHaveBeenCalled();
  });

  it("reuses an existing pending invitation row when inviting the same email again", async () => {
    const { inviteTreasurerAction } = await buildActions();
    repo.findTreasurerAccessByEmail.mockResolvedValue({
      accepted: false,
      userAccountId,
      memberId,
    });

    await expect(inviteTreasurerAction(inviteForm()))
      .rejects.toThrow(`NEXT_REDIRECT:/admin/orgs/${orgId}?authAccess=invite-sent`);

    expect(repo.createPendingTreasurerAccess).not.toHaveBeenCalled();
    expect(inviteTreasurer).toHaveBeenCalledOnce();
  });

  it("logs a failed Auth0 invitation after pending rows are created", async () => {
    const { inviteTreasurerAction } = await buildActions();
    inviteTreasurer.mockRejectedValue(new Error("auth0_invitation_failed:500"));

    await expect(inviteTreasurerAction(inviteForm()))
      .rejects.toThrow(`NEXT_REDIRECT:/admin/orgs/${orgId}?authAccessError=invite-failed`);

    expect(repo.logAction).toHaveBeenCalledWith(expect.objectContaining({
      actionKind: "treasurer_invite",
      status: "failed",
      errorMessage: "auth0_invitation_failed:500",
    }));
  });

  it("rate-limits repeated magic-link recovery for five minutes", async () => {
    const { resetTreasurerLoginAction } = await buildActions();
    repo.findRecentSentAction.mockResolvedValue({ id: "act_123" });

    await expect(resetTreasurerLoginAction(resetForm()))
      .rejects.toThrow(`NEXT_REDIRECT:/admin/orgs/${orgId}?authAccessError=reset-rate-limited`);

    expect(sendPasswordlessLink).not.toHaveBeenCalled();
    expect(repo.logAction).not.toHaveBeenCalled();
  });

  it("requires an active treasurer account before sending a magic-link recovery email", async () => {
    const { resetTreasurerLoginAction } = await buildActions();
    repo.findActiveTreasurerByEmail.mockResolvedValue(undefined);

    await expect(resetTreasurerLoginAction(resetForm()))
      .rejects.toThrow(`NEXT_REDIRECT:/admin/orgs/${orgId}?authAccessError=active-treasurer-required`);

    expect(sendPasswordlessLink).not.toHaveBeenCalled();
  });

  it("sends a passwordless link, logs the action, and redirects with WhatsApp copy", async () => {
    const { resetTreasurerLoginAction } = await buildActions();

    await expect(resetTreasurerLoginAction(resetForm()))
      .rejects.toThrow(`NEXT_REDIRECT:/admin/orgs/${orgId}?authAccess=reset-sent&whatsappCopy=`);

    expect(sendPasswordlessLink).toHaveBeenCalledWith({
      auth0OrgId: "org_auth0",
      email: "tesorera@example.com",
    });
    expect(repo.logAction).toHaveBeenCalledWith(expect.objectContaining({
      actionKind: "treasurer_login_reset",
      targetEmail: "tesorera@example.com",
      targetUserId: userAccountId,
      providerRequestId: "pwd_123",
      status: "sent",
    }));
  });
});
