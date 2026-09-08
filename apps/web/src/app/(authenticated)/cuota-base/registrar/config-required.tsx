import Link from "next/link";
import messages from "@/lib/i18n/en-US.json";
import { ROUTE_SCR_GROUP_CONFIG } from "@/lib/routes";

const copy = messages.sprint1.quota;

export function BaseFundQuotaConfigRequired() {
  return (
    <section className="rounded-md border border-warning-text bg-warning-bg p-5 text-text-primary" role="alert">
      <h2 className="font-semibold">{copy.configRequiredTitle}</h2>
      <p className="mt-2 text-sm">{copy.configRequiredBody}</p>
      <Link
        className="mt-4 inline-flex min-h-12 items-center rounded-md bg-primary px-4 py-2 font-semibold text-text-on-primary"
        href={`${ROUTE_SCR_GROUP_CONFIG}?editar=1`}
      >
        {copy.configure}
      </Link>
    </section>
  );
}
