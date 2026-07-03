#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");

const requiredFiles = [
  "packages/db/src/sprint3-substrate.test.ts",
  "packages/domain/src/audit.test.ts",
  "packages/domain/src/alerts.test.ts",
  "packages/domain/src/reconciliation.test.ts",
  "apps/web/e2e/sprint3.spec.ts",
  "apps/web/src/app/(authenticated)/historial/page.tsx",
  "apps/web/src/app/(authenticated)/admin/orgs/[id]/business-rules/page.tsx",
  "apps/web/src/app/(authenticated)/admin/orgs/[id]/business-rules/export/route.ts",
  "apps/web/src/app/(authenticated)/admin/orgs/[id]/period-close/[periodCloseId]/adjust/page.tsx",
  "apps/web/src/app/(authenticated)/alerts/actions.ts",
  "apps/web/src/lib/sentry/redaction.ts",
  "apps/web/instrumentation.ts",
  "apps/web/instrumentation-client.ts",
];

const requiredMarkers = [
  ["apps/web/src/app/(authenticated)/historial/page.tsx", 'data-screen="SCR-history"'],
  ["apps/web/src/app/(authenticated)/admin/orgs/[id]/business-rules/page.tsx", 'data-screen="SCR-admin-business-rules"'],
];

const requiredText = [
  ["packages/domain/src/alerts.ts", "alertAction"],
  ["packages/domain/src/alerts.ts", "assertActionableAlert"],
  ["packages/domain/src/audit.ts", "narratedAuditActionKinds"],
  ["packages/db/scripts/verify-schema.mjs", "raise_append_only_violation"],
  ["packages/db/scripts/verify-schema.mjs", "enforce_period_lock"],
  ["apps/web/src/lib/sentry/redaction.ts", "redactSentryEvent"],
];

let failed = false;

for (const rel of requiredFiles) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) {
    console.error(`[sprint3] missing required file: ${rel}`);
    failed = true;
    continue;
  }

  const text = readFileSync(abs, "utf8");
  if (/\bSCAFFOLD\b|data-scaffold=/.test(text)) {
    console.error(`[sprint3] scaffold marker remains in Sprint 3 file: ${rel}`);
    failed = true;
  }
}

for (const [rel, marker] of requiredMarkers) {
  const abs = resolve(root, rel);
  const text = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  if (!text.includes(marker)) {
    console.error(`[sprint3] missing marker ${marker} in ${rel}`);
    failed = true;
  }
}

for (const [rel, marker] of requiredText) {
  const abs = resolve(root, rel);
  const text = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  if (!text.includes(marker)) {
    console.error(`[sprint3] missing expected implementation marker ${marker} in ${rel}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("[sprint3] ok");
