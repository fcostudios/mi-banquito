import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readdirSync(new URL("./migrations", import.meta.url))
  .filter((name) => name.includes("legacy_payment_command_repair"))
  .map((name) => readFileSync(new URL(`./migrations/${name}`, import.meta.url), "utf8"))
  .join("\n");

describe("legacy payment command repair migration", () => {
  it("reconstructs only an unambiguous account and leaves discretionary targets unknown", () => {
    expect(migration).toContain("legacy_payment_command_v1");
    expect(migration).toContain("payment_receipt_id");
    expect(migration).toMatch(/COUNT\(DISTINCT source\.account_id\)[\s\S]+COUNT\(DISTINCT source\.account_id\) = 1/);
    expect(migration).toMatch(/CASE WHEN legacy\.account_id IS NOT NULL THEN jsonb_build_object\('accountId', legacy\.account_id\)/);
    expect(migration).not.toMatch(/COALESCE\(pr\.account_id/);
    expect(migration).not.toContain("FROM payment_allocation");
    expect(migration).not.toMatch(/jsonb_build_object\('target(?:Loan|Cycle)Id', legacy\./);
    expect(migration).toMatch(/'unknownFields',[\s\S]+\[\s*CASE WHEN legacy\.account_id IS NULL THEN 'accountId' END,\s*'targetLoanId',\s*'targetCycleId',\s*'overrideReason'/);
    expect(migration).toContain("pr.command_payload IS NULL");
    expect(migration).not.toContain("created_at < TIMESTAMP");
  });
});
