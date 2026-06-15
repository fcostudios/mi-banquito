import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthSessionProvider } from "@/lib/auth/session-provider";
import { uiColors } from "@mi-banquito/ui";

export const metadata: Metadata = {
  title: "Mi Banquito",
  description: "Mi Banquito",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: uiColors.primary,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // IMP-255 / I02 — the auth provider IS mounted (was a `// TODO` no-op, so
  // `useUser()` in header.tsx threw at runtime on every authenticated page).
  // AuthSessionProvider is the stack-correct client wrapper (Auth0Provider for
  // an Auth0 stack, SessionProvider for next-auth) — it fetches the session
  // client-side, so this server component stays SSR/prerender-safe.
  return (
    <html lang="es-EC">
      <body className="antialiased">
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
