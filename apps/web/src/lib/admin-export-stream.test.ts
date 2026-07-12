import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { streamArchiveToClient } from "./admin-export-service";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("tenant export stream fan-out", () => {
  it("does not pull past a blocked Blob upload and resumes through an explicit gate", async () => {
    const uploadGate = deferred();
    const uploadStarted = deferred();
    const chunk = Buffer.alloc(128 * 1024, 7);
    let emitted = 0;
    const source = new Readable({
      read() {
        emitted += 1;
        this.push(emitted <= 8 ? chunk : null);
      },
    });
    const { stream, completion } = streamArchiveToClient({
      source,
      archiveCompletion: Promise.resolve(),
      upload: async (body) => {
        uploadStarted.resolve();
        await uploadGate.promise;
        for await (const _chunk of body) {
          // The upload gate controls when the PassThrough can drain.
        }
        return { url: "https://private.invalid/export.zip", pathname: "export.zip" };
      },
      finalize: async () => "done",
    });
    const reader = stream.getReader();
    let firstReadSettled = false;
    const firstRead = reader.read().then((result) => {
      firstReadSettled = true;
      return result;
    });

    await uploadStarted.promise;
    await Promise.resolve();
    expect(firstReadSettled).toBe(false);
    expect(emitted).toBeLessThanOrEqual(2);

    uploadGate.resolve();
    expect((await firstRead).done).toBe(false);
    while (!(await reader.read()).done) {
      // Drain the response to allow finalization.
    }
    await expect(completion).resolves.toBe("done");
    expect(emitted).toBe(9);
  });
});
