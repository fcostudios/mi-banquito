#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");

const requiredFiles = [
  "packages/db/src/sprint4-schema.test.ts",
  "packages/domain/src/collections.ts",
  "packages/domain/src/compensation.ts",
  "packages/domain/src/liquidity.ts",
  "packages/domain/src/pilot.ts",
  "apps/web/src/app/(authenticated)/atrasos/page.tsx",
  "apps/web/src/app/(authenticated)/liquidez/page.tsx",
  "apps/web/src/app/verify/[hash]/route.ts",
  "apps/web/src/app/api/cron/promise-reminders/route.ts",
  "apps/web/e2e/sprint4.spec.ts",
];

const scaffoldFiles = [
  "apps/web/src/app/(authenticated)/atrasos/page.tsx",
  "apps/web/src/app/(authenticated)/liquidez/page.tsx",
  "apps/web/src/app/(authenticated)/admin/orgs/[id]/pilot-log/page.tsx",
];

const requiredText = [
  ["packages/domain/src/compensation.ts", "awardDueTreasurerCompensation"],
  ["packages/domain/src/liquidity.ts", "applyHypotheticalLoan"],
  ["packages/domain/src/reporting.ts", "verifyStatementHash"],
  ["packages/domain/src/pilot.ts", "evaluatePilotExitChecklist"],
  ["apps/web/src/lib/offline/outbox.ts", "queuedCountLabel"],
];

let failed = false;

for (const rel of requiredFiles) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) {
    console.error(`[sprint4] missing required file: ${rel}`);
    failed = true;
    continue;
  }

  const text = readFileSync(abs, "utf8");
  if (/\bSCAFFOLD\b|data-scaffold=/.test(text)) {
    console.error(`[sprint4] scaffold marker remains in Sprint 4 file: ${rel}`);
    failed = true;
  }
}

for (const rel of scaffoldFiles) {
  const abs = resolve(root, rel);
  const text = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  if (/\bSCAFFOLD\b|data-scaffold=/.test(text)) {
    console.error(`[sprint4] scaffold marker remains: ${rel}`);
    failed = true;
  }
}

for (const [rel, marker] of requiredText) {
  const abs = resolve(root, rel);
  const text = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  if (!text.includes(marker)) {
    console.error(`[sprint4] missing expected implementation marker ${marker} in ${rel}`);
    failed = true;
  }
}

if (existsSync(resolve(root, "apps/web/src/app/(authenticated)/verify/[hash]/page.tsx"))) {
  console.error("[sprint4] public verifier must not live under (authenticated)");
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log("[sprint4] ok");
