import { describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const archiveRows = vi.fn();

vi.mock("@mi-banquito/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: archiveRows,
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/statement-artifact", () => ({
  readPrivateStatementArtifact: vi.fn(() => Promise.resolve(null)),
}));

describe("public statement PDF route", () => {
  it("rejects invalid hashes", async () => {
    const response = await GET(new Request("https://example.com"), {
      params: Promise.resolve({ hash: "bad.pdf" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns not found for archived hashes when the blob is missing", async () => {
    archiveRows.mockResolvedValueOnce([{
      id: "archive-1",
      orgId: "11111111-1111-4111-8111-111111111111",
      kind: "monthly_member",
      memberId: "22222222-2222-4222-8222-222222222222",
      periodLabel: "2026-06",
      canonicalPayloadHash: "a".repeat(64),
      generatedAt: new Date("2026-07-05T20:00:00.000Z"),
    }]);

    const response = await GET(new Request("https://example.com"), {
      params: Promise.resolve({ hash: `${"a".repeat(64)}.pdf` }),
    });

    expect(response.status).toBe(404);
  });
});
