import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/historial",
  "/admin/orgs/11111111-1111-4111-8111-111111111111/business-rules",
  "/admin/orgs/11111111-1111-4111-8111-111111111111/period-close/22222222-2222-4222-8222-222222222222/adjust",
] as const;

test.describe("Sprint 3 protected surfaces", () => {
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
});
