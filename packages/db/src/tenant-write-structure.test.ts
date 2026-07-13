import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
function listDomainSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return listDomainSourceFiles(path);
      }
      if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
        return [];
      }
      return [relative(root, path)];
    })
    .sort();
}

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
  it("routes every domain mutation through an explicit transaction helper without exemptions", () => {
    const files = listDomainSourceFiles(resolve(root, "packages/domain/src"));
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(resolve(root, file), "utf8");
      if (/\bdb\.(?:insert|update|delete)\(/.test(source)) {
        violations.push(`${file}: direct db mutation`);
      }
      if (/\bdb\.transaction\(/.test(source)) {
        violations.push(`${file}: direct db transaction`);
      }
      const writeCount = readTenantTransactionWrites(file, source);
      for (let index = 0; index < writeCount; index += 1) {
        violations.push(`${file}: mutation in read tenant transaction`);
      }
    }

    expect(violations).toEqual([]);
  });
});
