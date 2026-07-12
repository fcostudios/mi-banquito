import { createPostgresAdminDriftRepository } from "@mi-banquito/domain";

import { AdminDriftView } from "@/components/admin/admin-drift-view";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import { getDriftRunnerDeploymentStatus } from "@/lib/drift/runner";
import messages from "@/lib/i18n/en-US.json";

const copy = messages.adminDrift;

export default async function ScrAdminDriftPage() {
  await requirePlatformOperator();
  const result = await createPostgresAdminDriftRepository().latest();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6" data-screen="SCR-admin-drift">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="mt-2 text-text-secondary">{copy.description}</p>
      </header>
      <AdminDriftView result={result} runnerDeployment={getDriftRunnerDeploymentStatus()} />
    </main>
  );
}
