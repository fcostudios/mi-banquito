# Testing Conventions Reference

Patterns for testing the serverless Next.js app (route handlers, Server/Client
Components, Drizzle, stores). See `CLAUDE.md` for the condensed rules.

## Route Handler Tests

```ts
import { GET } from "@/app/api/<resource>/route";

// Inject a test db client / mock the session; assert on the Response.
it("returns 401 without a session", async () => {
  const res = await GET();
  expect(res.status).toBe(401);
});
```

- Assert against a **test Drizzle client** (or a typed mock of `db`) — never the production connection.
- Cover the auth branches: no session → 401, wrong role → 403, happy path → 200.

## Component Tests

- **Server Components** are async functions returning JSX — test them by awaiting and asserting the tree; they cannot use hooks/state.
- **Client Components** (`"use client"`) — render with Testing Library; prefer `getByRole()` over `getByText()`.
- Reset Zustand stores between tests:
  ```ts
  beforeEach(() => useMyStore.getState().reset());
  ```

## Fetch Mock Isolation

```ts
// Use EXACT URL matching — broad patterns collide
global.fetch = jest.fn((url: string) => {
  if (url === "/api/v1/socias") return Promise.resolve({ json: () => sociasData });
  if (url === "/api/v1/socias/summary") return Promise.resolve({ json: () => summaryData });
  return Promise.reject(new Error(`Unhandled: ${url}`));
}) as jest.Mock;
```

## Verification

A story is not done until `pnpm type-check`, `pnpm lint`, and `pnpm build` all pass —
see [`DEFINITION_OF_DONE.md`](DEFINITION_OF_DONE.md).
