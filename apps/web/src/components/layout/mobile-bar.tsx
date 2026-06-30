"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/components/shell/nav-items.gen";

const MOBILE_ITEM_LIMIT = 5;

type MobileBarProps = {
  roles: string[];
};

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

export function MobileBar({ roles }: MobileBarProps) {
  const pathname = usePathname();
  const visible = navItems
    .filter((item) => {
      if (!item.roles || item.roles.length === 0) return true;
      return item.roles.some((role) => roles.includes(role));
    })
    .slice(0, MOBILE_ITEM_LIMIT);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid min-h-16 grid-flow-col border-t border-border bg-surface md:hidden" aria-label="Navegación móvil">
      {visible.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs font-medium ${
              active ? "text-primary" : "text-text-secondary"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
