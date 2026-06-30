import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import messages from "@/lib/i18n/en-US.json";
import { ROUTE_LOGIN } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function AccessDeniedPage() {
  const session = await auth0.getSession();

  if (!session?.user?.sub) {
    redirect(ROUTE_LOGIN);
  }

  const copy = messages.pages.accessDenied;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-4 p-6">
      <p className="text-sm font-medium text-text-secondary">{copy.eyebrow}</p>
      <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
      <p className="text-text-secondary">{copy.description}</p>
      <div className="flex flex-wrap gap-3 pt-2">
        <a
          href="/auth/logout"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-muted"
        >
          {copy.logout}
        </a>
      </div>
    </main>
  );
}
