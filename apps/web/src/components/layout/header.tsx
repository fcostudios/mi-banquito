"use client";

import { Bell } from "lucide-react";
import type { VisibleAlert } from "@mi-banquito/domain";
import {
  dismissAlertAction,
  snoozeAlertAction,
} from "@/app/(authenticated)/alerts/actions";

type HeaderProps = {
  displayName: string;
  email?: string;
  alertCount: number;
  alerts: VisibleAlert[];
  copy: {
    appName: string;
    subtitle: string;
    fallbackUser: string;
    alertsLabel: string;
    emptyAlerts: string;
    dismiss: string;
    snooze: string;
    shareWhatsApp: string;
  };
};

function initials(value: string, fallback: string) {
  const source = value.trim() || fallback;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Header({ displayName, email, alertCount, alerts, copy }: HeaderProps) {
  const label = displayName || email || copy.fallbackUser;

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur md:px-6">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-text-secondary">{copy.appName}</p>
        <p className="truncate text-sm font-medium text-text-primary">{copy.subtitle}</p>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <details className="relative">
          <summary
            className="relative flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
            aria-label={copy.alertsLabel}
          >
            <Bell className="h-5 w-5" aria-hidden />
            {alertCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-text-on-primary">
                {alertCount}
              </span>
            ) : null}
          </summary>
          <div className="absolute right-0 mt-2 grid max-h-[70vh] w-80 gap-3 overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-lg">
            <p className="text-sm font-semibold text-text-primary">{copy.alertsLabel}</p>
            {alerts.length === 0 ? (
              <p className="text-sm text-text-secondary">{copy.emptyAlerts}</p>
            ) : alerts.map((alert) => (
              <article key={alert.id} className="grid gap-2 rounded-md border border-border bg-background p-3">
                <div className="grid gap-1">
                  <p className="text-sm font-semibold text-text-primary">{alert.title}</p>
                  <p className="text-sm text-text-secondary">{alert.body}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={dismissAlertAction}>
                    <input type="hidden" name="alertId" value={alert.id} />
                    <button type="submit" className="rounded-md border border-border px-3 py-2 text-xs font-medium text-text-primary">
                      {copy.dismiss}
                    </button>
                  </form>
                  <form action={snoozeAlertAction}>
                    <input type="hidden" name="alertId" value={alert.id} />
                    <button type="submit" className="rounded-md border border-border px-3 py-2 text-xs font-medium text-text-primary">
                      {copy.snooze}
                    </button>
                  </form>
                  <a
                    className="rounded-md border border-border px-3 py-2 text-xs font-medium text-primary"
                    href={`https://wa.me/?text=${encodeURIComponent(alert.whatsAppText)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {copy.shareWhatsApp}
                  </a>
                </div>
              </article>
            ))}
          </div>
        </details>
        <div className="hidden min-w-0 text-right sm:block">
          <p className="truncate text-sm font-semibold text-text-primary">{label}</p>
          {email ? <p className="truncate text-xs text-text-secondary">{email}</p> : null}
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-muted text-sm font-bold text-text-primary"
          aria-label={label}
        >
          {initials(label, copy.fallbackUser)}
        </div>
      </div>
    </header>
  );
}
