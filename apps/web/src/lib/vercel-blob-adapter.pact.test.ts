import { Blob as NodeBlob } from "node:buffer";
import { resolve } from "node:path";
import { MatchersV3, PactV3 } from "@pact-foundation/pact";
import { afterEach, describe, expect, it } from "vitest";

const originalApiUrl = process.env.VERCEL_BLOB_API_URL;
const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
const originalRetries = process.env.VERCEL_BLOB_RETRIES;

const provider = new PactV3({
  consumer: "mi-banquito-web",
  provider: "vercel-blob-api",
  dir: resolve(process.cwd(), "pacts"),
  logLevel: "error",
});

afterEach(() => {
  if (originalApiUrl === undefined) delete process.env.VERCEL_BLOB_API_URL;
  else process.env.VERCEL_BLOB_API_URL = originalApiUrl;
  if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  if (originalRetries === undefined) delete process.env.VERCEL_BLOB_RETRIES;
  else process.env.VERCEL_BLOB_RETRIES = originalRetries;
});

describe("Vercel Blob Pact consumer contract", () => {
  it("uploads a private non-overwriting Blob through the SDK contract", async () => {
    provider.addInteraction({
      states: [{ description: "the Blob store accepts private uploads" }],
      uponReceiving: "a private non-overwriting receipt upload",
      withRequest: {
        method: "PUT",
        path: "/",
        query: { pathname: "expense-slip-candidates/pact-receipt.png" },
        headers: {
          authorization: "Bearer vercel_blob_rw_contract_secret",
          "content-type": "image/png",
          "x-vercel-blob-store-id": "contract",
          "x-vercel-blob-access": "private",
          "x-content-type": "image/png",
          "x-add-random-suffix": "0",
          "x-allow-overwrite": "0",
        },
        contentType: "image/png",
        body: "contract-body",
      },
      willRespondWith: {
        status: 200,
        headers: { "content-type": "application/json" },
        body: {
          url: MatchersV3.like("https://contract.private.blob.vercel-storage.com/expense-slip-candidates/pact-receipt.png"),
          downloadUrl: MatchersV3.like("https://contract.private.blob.vercel-storage.com/expense-slip-candidates/pact-receipt.png?download=1"),
          pathname: "expense-slip-candidates/pact-receipt.png",
          contentType: "image/png",
          contentDisposition: "inline",
          etag: MatchersV3.like("contract-etag"),
        },
      },
    });

    await provider.executeTest(async (mockServer) => {
      process.env.VERCEL_BLOB_API_URL = mockServer.url;
      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_contract_secret";
      process.env.VERCEL_BLOB_RETRIES = "0";
      const { uploadPrivateBlob } = await import("./vercel-blob-adapter");

      const result = await uploadPrivateBlob(
        "expense-slip-candidates/pact-receipt.png",
        new NodeBlob(["contract-body"], { type: "image/png" }) as unknown as Parameters<typeof uploadPrivateBlob>[1],
        "image/png",
      );

      expect(result).toMatchObject({
        pathname: "expense-slip-candidates/pact-receipt.png",
        contentType: "image/png",
        etag: "contract-etag",
      });
    });
  });

  it("deletes an orphan through the SDK contract", async () => {
    const uri = "https://contract.private.blob.vercel-storage.com/expense-slip-candidates/org/request/orphan.png";
    provider.addInteraction({
      states: [{ description: "the orphan exists in the Blob store" }],
      uponReceiving: "a request to delete one orphan",
      withRequest: {
        method: "POST",
        path: "/delete",
        headers: {
          authorization: "Bearer vercel_blob_rw_contract_secret",
          "x-vercel-blob-store-id": "contract",
          "content-type": "application/json",
        },
        body: { urls: [uri] },
      },
      willRespondWith: {
        status: 200,
        headers: { "content-type": "application/json" },
        body: {},
      },
    });

    await provider.executeTest(async (mockServer) => {
      process.env.VERCEL_BLOB_API_URL = mockServer.url;
      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_contract_secret";
      process.env.VERCEL_BLOB_RETRIES = "0";
      const { deletePrivateBlob } = await import("./vercel-blob-adapter");

      await expect(deletePrivateBlob(uri)).resolves.toBeUndefined();
    });
  });

  it("lists a paginated candidate page through the SDK contract", async () => {
    provider.addInteraction({
      states: [{ description: "candidate objects exist after an interrupted expense write" }],
      uponReceiving: "a paginated candidate listing request",
      withRequest: {
        method: "GET",
        path: "/",
        query: {
          limit: "1000",
          prefix: "expense-slip-candidates/",
          cursor: "page-one",
        },
        headers: {
          authorization: "Bearer vercel_blob_rw_contract_secret",
          "x-vercel-blob-store-id": "contract",
        },
      },
      willRespondWith: {
        status: 200,
        headers: { "content-type": "application/json" },
        body: {
          blobs: [{
            url: MatchersV3.like("https://contract.private.blob.vercel-storage.com/expense-slip-candidates/org/request/orphan.png"),
            downloadUrl: MatchersV3.like("https://contract.private.blob.vercel-storage.com/expense-slip-candidates/org/request/orphan.png?download=1"),
            pathname: "expense-slip-candidates/org/request/orphan.png",
            size: 68,
            uploadedAt: "2026-07-10T12:00:00.000Z",
            etag: "list-etag",
          }],
          cursor: "next-page",
          hasMore: true,
        },
      },
    });

    await provider.executeTest(async (mockServer) => {
      process.env.VERCEL_BLOB_API_URL = mockServer.url;
      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_contract_secret";
      process.env.VERCEL_BLOB_RETRIES = "0";
      const { listPrivateBlobs } = await import("./vercel-blob-adapter");

      const page = await listPrivateBlobs({ prefix: "expense-slip-candidates/", cursor: "page-one" });

      expect(page).toEqual(expect.objectContaining({
        hasMore: true,
        cursor: "next-page",
        blobs: [expect.objectContaining({
          pathname: "expense-slip-candidates/org/request/orphan.png",
          uploadedAt: new Date("2026-07-10T12:00:00.000Z"),
        })],
      }));
    });
  });
});
