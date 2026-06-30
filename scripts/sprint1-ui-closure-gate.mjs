#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");

const sprint1Files = [
  "apps/web/src/app/(authenticated)/page.tsx",
  "apps/web/src/app/(authenticated)/bienvenida/page.tsx",
  "apps/web/src/app/(authenticated)/socias/page.tsx",
  "apps/web/src/app/(authenticated)/socias/nueva/page.tsx",
  "apps/web/src/app/(authenticated)/socias/[id]/page.tsx",
  "apps/web/src/app/(authenticated)/grupo/page.tsx",
  "apps/web/src/app/(authenticated)/aportes/registrar/page.tsx",
  "apps/web/src/app/(authenticated)/historial/page.tsx",
  "apps/web/src/app/(authenticated)/cuota-base/registrar/page.tsx",
  "apps/web/src/app/(authenticated)/admin/orgs/nueva/page.tsx",
  "apps/web/src/app/(authenticated)/admin/orgs/[id]/page.tsx",
  "apps/web/src/app/(authenticated)/admin/orgs/[id]/config/page.tsx",
];

const requiredMarkers = [
  {
    file: "apps/web/src/app/(authenticated)/layout.tsx",
    marker: 'data-ui-stabilized="authenticated-shell"',
  },
  {
    file: "apps/web/src/app/(authenticated)/page.tsx",
    marker: 'data-screen="SCR-treasurer-home"',
  },
  {
    file: "apps/web/src/app/(authenticated)/socias/page.tsx",
    marker: 'data-screen="SCR-members-list"',
  },
  {
    file: "apps/web/src/app/(authenticated)/socias/[id]/page.tsx",
    marker: 'data-screen="SCR-member-detail"',
  },
];

let failed = false;

for (const rel of sprint1Files) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) {
    console.error(`[sprint1-ui] missing required Sprint 1 surface: ${rel}`);
    failed = true;
    continue;
  }

  const text = readFileSync(abs, "utf8");
  if (/\bSCAFFOLD\b|data-scaffold=/.test(text)) {
    console.error(`[sprint1-ui] scaffold marker remains in Sprint 1 surface: ${rel}`);
    failed = true;
  }
}

for (const { file, marker } of requiredMarkers) {
  const abs = resolve(root, file);
  const text = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  if (!text.includes(marker)) {
    console.error(`[sprint1-ui] missing closure marker ${marker} in ${file}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("[sprint1-ui] ok");
