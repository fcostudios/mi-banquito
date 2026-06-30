"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { navItems } from "@/components/shell/nav-items.gen";

const APP_NAME = "Mi Banquito";
const SHELL_SUBTITLE = "Tesorería operativa";

type SidebarProps = {
  roles: string[];
};

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

export function Sidebar({ roles }: SidebarProps) {
  const pathname = usePathname();
  const visible = navItems.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true;
    return item.roles.some((role) => roles.includes(role));
  });
  const mainItems = visible.filter((item) => item.position !== "bottom");
  const bottomItems = visible.filter((item) => item.position === "bottom");

  return (
    <aside className="hidden w-72 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
      <div className="flex min-h-16 items-center gap-3 border-b border-border px-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-text-on-primary">
          <LayoutDashboard className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-text-primary">{APP_NAME}</p>
          <p className="truncate text-xs font-medium text-text-secondary">{SHELL_SUBTITLE}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navegación principal">
        <div className="grid gap-1">
          {mainItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-text-on-primary"
                    : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {bottomItems.length > 0 ? (
        <nav className="border-t border-border px-3 py-4" aria-label="Configuración">
          <div className="grid gap-1">
            {bottomItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-text-on-primary"
                      : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </aside>
  );
}
