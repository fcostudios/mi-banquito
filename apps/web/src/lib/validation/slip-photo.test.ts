import { describe, expect, it } from "vitest";
import { validateSlipPhoto } from "./slip-photo";

describe("validateSlipPhoto", () => {
  it("caps the long edge at 1024 pixels", () => {
    expect(validateSlipPhoto({ byteSize: 200_000, width: 3000, height: 1000, mimeType: "image/jpeg" })).toEqual({
      ok: true,
      resizedLongEdge: 1024,
    });
  });

  it("rejects files above five megabytes", () => {
    expect(validateSlipPhoto({ byteSize: 6 * 1024 * 1024, width: 800, height: 600, mimeType: "image/png" })).toEqual({
      ok: false,
      reason: "too_large",
    });
  });
});
