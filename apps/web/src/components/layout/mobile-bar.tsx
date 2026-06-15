"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@auth0/nextjs-auth0";
import { navItems } from "@/components/shell/nav-items.gen";
import { getRolesFromUser } from "@/lib/auth/session-claims";

const MOBILE_ITEM_LIMIT = 5;

export function MobileBar() {
  const pathname = usePathname();
  const { user } = useUser();
  const userRoles = getRolesFromUser(user as Record<string, unknown> | undefined);
  const visible = navItems
    .filter((item) => {
      if (!item.roles || item.roles.length === 0) return true;
      return item.roles.some((role) => userRoles.includes(role));
    })
    .slice(0, MOBILE_ITEM_LIMIT);

  return (
    <nav className="fixed bottom-0 left-0 right-0 flex md:hidden h-14 border-t bg-white">
      {visible.map((item) => {
        const active = pathname.startsWith(item.href);
        // Data-driven active color from the project's primary token (IMP-241).
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center text-xs ${
              active ? "" : "text-gray-500"
            }`}
            style={active ? { color: "var(--color-primary)" } : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
