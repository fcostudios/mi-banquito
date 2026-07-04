import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PublicVerifyPage from "./page";
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

describe("PublicVerifyPage", () => {
  it("renders a public match without requiring an authenticated session", async () => {
    verifyStatementHash.mockResolvedValueOnce({
      matched: true,
      groupName: "Mi Banquito",
      generatedAt: "2026-07-04T10:00:00.000Z",
    });

    render(await PublicVerifyPage({
      params: Promise.resolve({ hash: "A".repeat(64) }),
    }));

    expect(verifyStatementHash).toHaveBeenCalledWith("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(screen.getByRole("heading", { name: "Verificación de documento" })).toBeInTheDocument();
    expect(screen.getByText("Este documento coincide con el registro del grupo Mi Banquito al 2026-07-04.")).toBeInTheDocument();
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
