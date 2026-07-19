#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const files = {
  package: readFileSync(resolve(root, "apps/web/package.json"), "utf8"),
  spec: readFileSync(resolve(root, "apps/web/e2e/sprint8-movements.spec.ts"), "utf8"),
  ci: readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8"),
};

const requirements = [
  [files.package.includes('"axe-core"'), "axe-core dependency"],
  [files.spec.includes('from "axe-core"'), "Playwright axe import"],
  [files.spec.includes("axeApi.run("), "axe analysis call"],
  [files.spec.includes("results.violations"), "axe violation assertion"],
  [files.ci.includes("test:e2e:movements"), "blocking CI execution"],
];

const missing = requirements.filter(([present]) => !present).map(([, label]) => label);
if (missing.length > 0) {
  console.error(`[a11y] missing enforced axe wiring: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("[a11y] axe-core Playwright gate is wired and blocking in CI");
