import { describe, expect, it } from "vitest";

import { publicVerifyUrl, verifierResultText } from "./reporting";

describe("public statement verification", () => {
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
