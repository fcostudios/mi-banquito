"use client";

/**
 * Auth0 logout — redirect to the SDK's logout route handler.
 * The Auth0 middleware (src/middleware.ts) mounts /auth/logout.
 */
export function logout() {
  window.location.href = "/auth/logout";
}
