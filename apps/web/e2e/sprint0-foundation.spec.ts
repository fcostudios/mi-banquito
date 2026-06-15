import { expect, test } from "@playwright/test";

test("health endpoint returns ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("unauthenticated member list redirects to Auth0 login route", async ({ request }) => {
  const response = await request.get("/socias", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toBe("/auth/login");
});

test("Auth0 login route is mounted and redirects to Auth0", async ({ request }) => {
  const response = await request.get("/auth/login", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  const location = response.headers()["location"];
  expect(location).toContain(".auth0.com/authorize");
  expect(location).toContain("organization=");
});

test("manifest is reachable and names the app", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.name).toContain("Mi Banquito");
});
