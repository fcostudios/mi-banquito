#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");

const requiredFiles = [
  "packages/domain/src/loan.ts",
  "packages/domain/src/loans/accrual.ts",
  "packages/domain/src/sprint2-loans.test.ts",
  "packages/domain/src/sprint2-contributions.test.ts",
  "packages/domain/src/sprint2-cron.test.ts",
  "apps/web/src/app/(authenticated)/prestamos/page.tsx",
  "apps/web/src/app/(authenticated)/prestamos/nuevo/page.tsx",
  "apps/web/src/app/(authenticated)/prestamos/[id]/page.tsx",
  "apps/web/src/app/(authenticated)/prestamos/[id]/pago/page.tsx",
  "apps/web/src/app/(authenticated)/cierre/page.tsx",
  "apps/web/src/app/(authenticated)/admin/cron-runs/page.tsx",
  "apps/web/src/app/api/cron/accrue-interest/route.ts",
  "apps/web/e2e/sprint2.spec.ts",
];

const requiredMarkers = [
  ["apps/web/src/app/(authenticated)/prestamos/page.tsx", 'data-screen="SCR-loans-list"'],
  ["apps/web/src/app/(authenticated)/prestamos/nuevo/page.tsx", 'data-screen="SCR-originate-loan"'],
  ["apps/web/src/app/(authenticated)/prestamos/[id]/page.tsx", 'data-screen="SCR-loan-detail"'],
  ["apps/web/src/app/(authenticated)/prestamos/[id]/pago/page.tsx", 'data-screen="SCR-record-repayment"'],
  ["apps/web/src/app/(authenticated)/cierre/page.tsx", 'data-screen="SCR-monthly-close"'],
  ["apps/web/src/app/(authenticated)/admin/cron-runs/page.tsx", 'data-screen="SCR-admin-cron-runs"'],
];

let failed = false;

for (const rel of requiredFiles) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) {
    console.error(`[sprint2] missing required file: ${rel}`);
    failed = true;
    continue;
  }

  const text = readFileSync(abs, "utf8");
  if (/\bSCAFFOLD\b|data-scaffold=/.test(text)) {
    console.error(`[sprint2] scaffold marker remains in Sprint 2 file: ${rel}`);
    failed = true;
  }
}

for (const [rel, marker] of requiredMarkers) {
  const abs = resolve(root, rel);
  const text = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  if (!text.includes(marker)) {
    console.error(`[sprint2] missing closure marker ${marker} in ${rel}`);
    failed = true;
  }
}

const migration = readFileSync(
  resolve(root, "packages/db/src/migrations/V20260630090000__sprint_2_loans_cron_contribution_source.sql"),
  "utf8",
);
for (const marker of ["mv_cash_balances", "cron_run", "loan_referral", "loan_guarantor", "non_member_borrower"]) {
  if (!migration.includes(marker)) {
    console.error(`[sprint2] migration missing ${marker}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("[sprint2] ok");
