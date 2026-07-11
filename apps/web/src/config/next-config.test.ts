import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Next Server Actions upload transport", () => {
  it("allows the five-megabyte validated slip plus multipart overhead", () => {
    const source = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
    const configured = source.match(/bodySizeLimit:\s*"(\d+)mb"/);

    expect(configured?.[1]).toBe("6");
    expect(Number(configured?.[1])).toBeGreaterThan(5);
  });
});
