import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { deletePrivateBlob, readPrivateBlob, uploadPrivateBlob } from "./vercel-blob-adapter";

const token = process.env.BLOB_READ_WRITE_TOKEN;
const tokenRequired = process.env.BLOB_LIVE_REQUIRED === "1";
const hasLiveToken = Boolean(
  token
  && !token.startsWith("ci-vercel-blob-placeholder")
  && !token.includes("contract_secret"),
);

describe("Vercel Blob live installed SDK contract", () => {
  it.runIf(hasLiveToken || tokenRequired)(
    "puts a private Node Readable, streams it back byte-for-byte, and deletes it",
    async () => {
      if (!hasLiveToken) throw new Error("BLOB_LIVE_REQUIRED=1 requires a real BLOB_READ_WRITE_TOKEN");

      const pathname = `contract-tests/${randomUUID()}.bin`;
      const expected = Buffer.concat([
        Buffer.from("mi-banquito-live-blob-contract:"),
        Buffer.alloc(128 * 1024, 0x5a),
      ]);
      let uploadedUrl: string | undefined;
      try {
        const uploaded = await uploadPrivateBlob(
          pathname,
          Readable.from([expected.subarray(0, 31), expected.subarray(31)]),
          "application/octet-stream",
        );
        uploadedUrl = uploaded.url;
        expect(uploaded).toEqual(expect.objectContaining({ pathname }));

        const downloaded = await readPrivateBlob(pathname);
        if (!downloaded || downloaded.statusCode !== 200) throw new Error("live_private_blob_not_readable");
        const actual = Buffer.concat(await Array.fromAsync(
          Readable.fromWeb(downloaded.stream as never),
          (chunk) => Buffer.from(chunk),
        ));
        expect(actual).toEqual(expected);
      } finally {
        if (uploadedUrl) await deletePrivateBlob(uploadedUrl);
      }
    },
    30_000,
  );
});
