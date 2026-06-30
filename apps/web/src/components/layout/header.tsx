"use client";

import { Bell } from "lucide-react";

type HeaderProps = {
  displayName: string;
  email?: string;
};

const APP_NAME = "Mi Banquito";
const HEADER_SUBTITLE = "Panel de tesorería";
const FALLBACK_USER_LABEL = "Usuario";

function initials(value: string) {
  const source = value.trim() || FALLBACK_USER_LABEL;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Header({ displayName, email }: HeaderProps) {
  const label = displayName || email || FALLBACK_USER_LABEL;

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur md:px-6">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-text-secondary">{APP_NAME}</p>
        <p className="truncate text-sm font-medium text-text-primary">{HEADER_SUBTITLE}</p>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <button
          className="relative flex h-10 w-10 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
          aria-label="Notificaciones"
          type="button"
        >
          <Bell className="h-5 w-5" aria-hidden />
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-text-on-primary">
            3
          </span>
        </button>
        <div className="hidden min-w-0 text-right sm:block">
          <p className="truncate text-sm font-semibold text-text-primary">{label}</p>
          {email ? <p className="truncate text-xs text-text-secondary">{email}</p> : null}
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-muted text-sm font-bold text-text-primary"
          aria-label={label}
        >
          {initials(label)}
        </div>
      </div>
    </header>
  );
}
