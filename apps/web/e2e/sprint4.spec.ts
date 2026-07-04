import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/atrasos",
  "/liquidez",
  "/admin/orgs/11111111-1111-4111-8111-111111111111/pilot-log",
] as const;

test.describe("Sprint 4 protected surfaces", () => {
  test.describe.configure({ timeout: 180_000 });

  for (const route of protectedRoutes) {
    test(`${route} requires an Auth0 session`, async ({ request }) => {
      const response = await request.get(route, {
        headers: { accept: "text/html" },
        maxRedirects: 0,
      });

      expect(response.status()).toBe(307);
      expect(response.headers()["location"]).toBe("/auth/login");
    });
  }

  test("public verifier route does not require Auth0", async ({ request }) => {
    const response = await request.get(`/verify/${"a".repeat(64)}`, {
      headers: { accept: "text/html" },
      maxRedirects: 0,
    });

    expect([200, 404]).toContain(response.status());
    expect(response.headers()["location"]).toBeUndefined();
  });
});
