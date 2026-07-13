import { Calendar, Key, User } from "lucide-react";
import { ButtonSecondary } from "@mi-banquito/ui";
import messages from "@/lib/i18n/en-US.json";

const copy = messages.impersonation.banner;

export function ImpersonationBanner({
  orgName,
  reason,
  expiresAt,
}: {
  orgName: string;
  reason: string;
  expiresAt: Date;
}) {
  const expiry = new Intl.DateTimeFormat("es-EC", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Guayaquil",
  }).format(expiresAt);

  return (
    <aside className="flex flex-col gap-3 border-b border-accent bg-surface-muted px-4 py-3 md:flex-row md:items-center md:justify-between" role="status">
      <div className="flex min-w-0 items-start gap-3">
        <User className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-text-primary">{copy.title}</p>
          <p className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">{orgName}</span>
            {` · ${copy.reason}: ${reason}`}
          </p>
          <p className="flex items-center gap-1 text-xs text-text-secondary">
            <Calendar className="h-3.5 w-3.5" aria-hidden />
            {copy.expires.replace("{{time}}", expiry)}
          </p>
        </div>
      </div>
      <form action="/api/impersonation/end" method="post" className="shrink-0">
        <ButtonSecondary type="submit">
          <Key className="h-4 w-4" aria-hidden />
          {copy.end}
        </ButtonSecondary>
      </form>
    </aside>
  );
}
