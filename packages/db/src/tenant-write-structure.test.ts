import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const lifecycleReadTransactionExceptions = new Set([
  "apps/web/src/app/(authenticated)/admin/orgs/[id]/admin-auth-actions.ts",
  "apps/web/src/lib/admin-export-service.ts",
  "packages/domain/src/impersonation.ts",
  "packages/domain/src/reconciliation.ts",
]);
const directDbMutationExceptions = new Set([
  "apps/web/src/app/(authenticated)/admin/cron-runs/actions.ts",
  "apps/web/src/lib/cron/handler.ts",
  "packages/db/seed/platform-bootstrap.ts",
  "packages/domain/src/pilot.ts",
  "packages/domain/src/platform.ts",
]);

function readTenantTransactionWrites(file: string, source: string): number {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let writes = 0;
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "withTenantTransaction"
      && /\btx\.(?:insert|update|delete)\(/.test(node.getText(sourceFile))) {
      writes += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return writes;
}

describe("tenant write boundary structure", () => {
  it("routes tenant mutations through the writable helper or a named lifecycle exception", () => {
    const files = execFileSync("rg", [
      "--files", "packages", "apps/web/src", "-g", "*.ts", "-g", "!*.test.ts", "-g", "!*.test.tsx",
    ], { cwd: root, encoding: "utf8" }).trim().split("\n");
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(resolve(root, file), "utf8");
      if (!directDbMutationExceptions.has(file) && /\bdb\.(?:insert|update|delete)\(/.test(source)) {
        violations.push(`${file}: direct db mutation`);
      }
      if (!lifecycleReadTransactionExceptions.has(file)) {
        const writeCount = readTenantTransactionWrites(file, source);
        for (let index = 0; index < writeCount; index += 1) {
          violations.push(`${file}: mutation in read tenant transaction`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
