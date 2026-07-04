import { describe, expect, it } from "vitest";

import { offlineChipLabel, reduceOutboxState } from "./outbox";

describe("offline outbox state", () => {
  it("shows readable queued copy", () => {
    expect(offlineChipLabel({ status: "queued" })).toBe("Guardado. Se sincronizará cuando vuelva la señal");
  });

  it("tracks queued count and clears synced writes", () => {
    const state = reduceOutboxState({ queued: [] }, { type: "queued", clientRequestId: "a" });

    expect(state.queued).toEqual(["a"]);
    expect(reduceOutboxState(state, { type: "synced", clientRequestId: "a" }).queued).toEqual([]);
  });
});
