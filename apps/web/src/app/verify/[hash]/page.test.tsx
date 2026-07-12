import { describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const verifyStatementHash = vi.fn();

vi.mock("@mi-banquito/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mi-banquito/domain")>();
  return {
    ...actual,
    createReportingService: () => ({
      verifyStatementHash,
    }),
  };
});

describe("public verifier route", () => {
  it("renders public HTML without requiring an authenticated session", async () => {
    verifyStatementHash.mockResolvedValueOnce({
      matched: true,
      groupName: "Mi Banquito",
      generatedAt: "2026-07-04T10:00:00.000Z",
      movements: [
        { id: "c1", kind: "contribution", datedOn: "2026-07-01", amount: "50.0000", status: "pending", label: "Aporte pendiente · Cuenta personal" },
        { id: "t1", kind: "regularization_transfer", datedOn: "2026-07-02", amount: "50.0000", status: "regularized", label: "Transferencia para regularizar · Banco del grupo" },
      ],
    });

    const response = await GET(new Request("http://localhost/verify/hash", {
      headers: { accept: "text/html" },
    }), {
      params: Promise.resolve({ hash: "A".repeat(64) }),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(verifyStatementHash).toHaveBeenCalledWith("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(html).toContain("Verificación de documento");
    expect(html).toContain("Este documento coincide con el registro del grupo Mi Banquito al 2026-07-04.");
    expect(html).toContain("Aporte pendiente · Cuenta personal");
    expect(html).toContain("Transferencia para regularizar · Banco del grupo");
  });

  it("returns minimal JSON from the public route", async () => {
    verifyStatementHash.mockResolvedValueOnce({
      matched: false,
    });

    const response = await GET(new Request("http://localhost/verify/bad"), {
      params: Promise.resolve({ hash: "b".repeat(64) }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ matched: false });
  });
});
