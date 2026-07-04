import { notFound } from "next/navigation";
import { verifyHashSchema } from "@mi-banquito/contracts";
import { createReportingService, verifierResultText } from "@mi-banquito/domain";

import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

const copy = messages.verifier;

export default async function PublicVerifyPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const parsed = verifyHashSchema.safeParse(hash);
  if (!parsed.success) {
    notFound();
  }

  const result = await createReportingService().verifyStatementHash(parsed.data.toLowerCase());

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-2xl content-center gap-4 p-6" data-screen="SCR-public-verify-pdf">
      <p className="text-sm font-semibold text-primary">{messages.app_name}</p>
      <h1 className="text-3xl font-bold text-text-primary">{copy.title}</h1>
      <p className="text-lg text-text-secondary">{verifierResultText(result)}</p>
    </main>
  );
}
