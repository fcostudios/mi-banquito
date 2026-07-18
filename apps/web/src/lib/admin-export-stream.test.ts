import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { finalizedFileStream } from "./admin-export-service";
import { redirectToGeneratedExportDownload } from "./admin-export-response";

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

  it("cleans the temporary stream and redirects generation to the durable Blob download", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mi-banquito-export-redirect-test-"));
    directories.push(directory);
    const path = join(directory, `${randomUUID()}.zip`);
    await writeFile(path, Buffer.from("durable-export"));
    let cleaned = 0;
    const orgId = randomUUID();
    const exportId = randomUUID();
    const finalized = finalizedFileStream({
      path,
      result: { exportId },
      cleanup: async () => { cleaned += 1; },
    });

    const response = await redirectToGeneratedExportDownload({
      requestUrl: `https://mi-banquito.example/admin/orgs/${orgId}/export/${exportId}?request=signed`,
      orgId,
      exportId,
      ...finalized,
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `https://mi-banquito.example/admin/orgs/${orgId}/export/${exportId}`,
    );
    await expect(finalized.completion).resolves.toEqual({ exportId });
    expect(cleaned).toBe(1);
  });
});
