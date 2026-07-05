import { describe, expect, it } from "vitest";

import { canonicalJson, publicVerifyUrl, sha256Hex, verifierResultText } from "./reporting";

describe("public statement verification", () => {
  it("orders object keys deterministically before hashing", () => {
    const left = canonicalJson({ b: 2, a: { d: 4, c: 3 } });
    const right = canonicalJson({ a: { c: 3, d: 4 }, b: 2 });

    expect(left).toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(right).toBe(left);
    expect(sha256Hex(left)).toBe("c461c47a913352f1a21e3f2ea49e1fd34754c0dc12cb7366e4636d5e186c6c6e");
  });

  it("builds the verifier URL from a canonical hash", () => {
    expect(publicVerifyUrl("https://mi-banquito.vercel.app", "a".repeat(64))).toBe(
      "https://mi-banquito.vercel.app/verify/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  it("returns minimal hit and miss copy", () => {
    expect(verifierResultText({
      matched: true,
      groupName: "Mi Banquito",
      generatedAt: "2026-07-04T10:00:00.000Z",
    })).toBe("Este documento coincide con el registro del grupo Mi Banquito al 2026-07-04.");
    expect(verifierResultText({ matched: false })).toBe("No se encontró un documento con este código.");
  });
});
