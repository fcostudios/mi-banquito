"use client";

import { Auth0Provider } from "@auth0/nextjs-auth0";
import { ReactNode } from "react";

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return <Auth0Provider>{children}</Auth0Provider>;
}
