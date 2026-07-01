import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/prestamos",
  "/prestamos/nuevo",
  "/prestamos/11111111-1111-4111-8111-111111111111",
  "/prestamos/11111111-1111-4111-8111-111111111111/pago",
  "/cierre",
  "/admin/cron-runs",
] as const;

test.describe("Sprint 2 protected surfaces", () => {
  for (const route of protectedRoutes) {
    test(`${route} requires an Auth0 session`, async ({ request }) => {
      const response = await request.get(route, { maxRedirects: 0 });

      expect(response.status()).toBe(307);
      expect(response.headers()["location"]).toBe("/auth/login");
    });
  }
});

test.describe("Sprint 2 cron contract", () => {
  test("accrue-interest cron rejects unauthenticated requests", async ({ request }) => {
    const response = await request.get("/api/cron/accrue-interest?from_date=2026-07-01&to_date=2026-07-01");

    expect(response.status()).toBe(401);
    expect(response.ok()).toBe(false);
  });
});
