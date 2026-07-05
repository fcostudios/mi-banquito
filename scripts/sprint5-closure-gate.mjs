#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");

const requiredFiles = [
  "apps/web/src/app/(authenticated)/cierre/actions.ts",
  "apps/web/src/app/(authenticated)/cierre/page.tsx",
  "apps/web/src/app/(authenticated)/cierre/page.test.tsx",
  "apps/web/src/app/(authenticated)/statement-archive/monthly-close/[hash]/route.ts",
  "apps/web/src/app/(authenticated)/admin/orgs/[id]/page.tsx",
  "packages/db/seed/platform-bootstrap.ts",
  "packages/db/src/migrations/V20260705170000__sprint_5_monthly_close_guards.sql",
  "packages/db/src/sprint5-schema.test.ts",
  "packages/domain/src/alerts.ts",
  "packages/domain/src/reconciliation.ts",
  "packages/ui/src/organisms/pdf-statement-template.tsx",
];

const requiredText = [
  ["packages/domain/src/reconciliation.ts", "executeReconciliation"],
  ["packages/domain/src/reconciliation.ts", "annotateReconciliation"],
  ["packages/domain/src/reconciliation.ts", "closePeriod"],
  ["packages/domain/src/reconciliation.ts", "recordMonthlyCloseShareAttempt"],
  ["packages/domain/src/alerts.ts", "emitCloseOverdueAlerts"],
  ["packages/domain/src/alerts.ts", "closeOverdueAlertState"],
  ["apps/web/src/lib/cron/handler.ts", "closeOverdueAlertsEmitted"],
  ["packages/db/src/tenant.ts", "withWritableTenantTransaction"],
  ["packages/domain/src/platform.ts", "updateOrganizationLifecycle"],
  ["packages/db/seed/platform-bootstrap.ts", "CONFIRM_PLATFORM_BOOTSTRAP"],
  ["packages/ui/src/organisms/pdf-statement-template.tsx", "PdfStatementSection"],
];

let failed = false;

for (const rel of requiredFiles) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) {
    console.error(`[sprint5] missing required file: ${rel}`);
    failed = true;
    continue;
  }

  const text = readFileSync(abs, "utf8");
  if (/\bSCAFFOLD\b|data-scaffold=/.test(text)) {
    console.error(`[sprint5] scaffold marker remains in Sprint 5 file: ${rel}`);
    failed = true;
  }
}

for (const [rel, marker] of requiredText) {
  const abs = resolve(root, rel);
  const text = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  if (!text.includes(marker)) {
    console.error(`[sprint5] missing expected implementation marker ${marker} in ${rel}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("[sprint5] ok");
