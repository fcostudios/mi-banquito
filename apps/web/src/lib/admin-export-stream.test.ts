import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { finalizedFileStream } from "./admin-export-service";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("finalized tenant export file stream", () => {
  it("streams from disk and treats cancellation as cleanup after a committed result", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mi-banquito-stream-test-"));
    directories.push(directory);
    const path = join(directory, `${randomUUID()}.zip`);
    const bytes = Buffer.alloc(256 * 1024, 7);
    await writeFile(path, bytes);
    let cleaned = 0;
    const result = { exportId: randomUUID() };
    const finalized = finalizedFileStream({
      path,
      result,
      cleanup: async () => { cleaned += 1; },
    });

    const reader = finalized.stream.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(first.value?.byteLength).toBeLessThan(bytes.byteLength);
    await reader.cancel("client_disconnected");

    await expect(finalized.completion).resolves.toBe(result);
    expect(cleaned).toBe(1);
  });
});
