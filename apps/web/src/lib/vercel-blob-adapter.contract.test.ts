import { createServer, type IncomingHttpHeaders } from "node:http";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";

type CapturedRequest = {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
};

const requests: CapturedRequest[] = [];
const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  requests.push({
    method: request.method ?? "",
    url: request.url ?? "",
    headers: request.headers,
    body: Buffer.concat(chunks),
  });
  response.setHeader("content-type", "application/json");
  if (request.method === "GET") {
    response.end(JSON.stringify({
      blobs: [{
        url: "https://contract.private.blob.vercel-storage.com/expense-slip-candidates/org/request/orphan.png",
        downloadUrl: "https://contract.private.blob.vercel-storage.com/expense-slip-candidates/org/request/orphan.png?download=1",
        pathname: "expense-slip-candidates/org/request/orphan.png",
        size: 68,
        uploadedAt: "2026-07-10T12:00:00.000Z",
        etag: "list-etag",
      }],
      cursor: "next-page",
      hasMore: true,
    }));
    return;
  }
  if (request.method === "PUT") {
    const pathname = new URL(request.url ?? "/", "http://contract.invalid").searchParams.get("pathname") ?? "expense-slips/receipt.png";
    response.end(JSON.stringify({
      url: `https://contract.private.blob.vercel-storage.com/${pathname}`,
      downloadUrl: `https://contract.private.blob.vercel-storage.com/${pathname}?download=1`,
      pathname,
      contentType: request.headers["x-content-type"] ?? "application/octet-stream",
      contentDisposition: "inline",
      etag: "contract-etag",
    }));
    return;
  }
  response.end("{}");
});

const originalApiUrl = process.env.VERCEL_BLOB_API_URL;
const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
const originalRetries = process.env.VERCEL_BLOB_RETRIES;

describe("Vercel Blob installed SDK contract", () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("contract_server_not_listening");
    process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${address.port}`;
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_contract_secret";
    process.env.VERCEL_BLOB_RETRIES = "0";
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (originalApiUrl === undefined) delete process.env.VERCEL_BLOB_API_URL;
    else process.env.VERCEL_BLOB_API_URL = originalApiUrl;
    if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    if (originalRetries === undefined) delete process.env.VERCEL_BLOB_RETRIES;
    else process.env.VERCEL_BLOB_RETRIES = originalRetries;
  });

  it("maps the private non-overwriting upload request and SDK response", async () => {
    const { uploadPrivateBlob } = await import("./vercel-blob-adapter");
    const body = Buffer.from([1, 2, 3, 4]);

    const result = await uploadPrivateBlob("expense-slips/receipt.png", body, "image/png");

    expect(result).toEqual(expect.objectContaining({
      url: "https://contract.private.blob.vercel-storage.com/expense-slips/receipt.png",
      pathname: "expense-slips/receipt.png",
      contentType: "image/png",
      etag: "contract-etag",
    }));
    expect(requests[0]).toEqual(expect.objectContaining({
      method: "PUT",
      url: "/?pathname=expense-slips%2Freceipt.png",
      body: Buffer.from([1, 2, 3, 4]),
      headers: expect.objectContaining({
        authorization: "Bearer vercel_blob_rw_contract_secret",
        "x-vercel-blob-store-id": "contract",
        "x-vercel-blob-access": "private",
        "x-content-type": "image/png",
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "0",
      }),
    }));
  });

  it("maps deletion to the installed SDK delete contract", async () => {
    const { deletePrivateBlob } = await import("./vercel-blob-adapter");
    const uri = "https://contract.private.blob.vercel-storage.com/expense-slip-candidates/org/request/orphan.png";

    await deletePrivateBlob(uri);

    expect(requests.find((request) => request.method === "POST")).toEqual(expect.objectContaining({
      method: "POST",
      url: "/delete",
      body: Buffer.from(JSON.stringify({ urls: [uri] })),
      headers: expect.objectContaining({
        authorization: "Bearer vercel_blob_rw_contract_secret",
        "content-type": "application/json",
        "x-vercel-blob-store-id": "contract",
      }),
    }));
  });

  it("uploads a Node Readable without buffering through the installed SDK", async () => {
    const { uploadPrivateBlob } = await import("./vercel-blob-adapter");
    const pathname = "tenant-exports/11111111-1111-4111-8111-111111111111/export.zip";

    const result = await uploadPrivateBlob(pathname, Readable.from([Buffer.from("zip-"), Buffer.from("stream")]), "application/zip");

    expect(result).toEqual(expect.objectContaining({ pathname, contentType: "application/zip" }));
    expect(requests.find((request) => request.url.includes("tenant-exports"))).toEqual(expect.objectContaining({
      method: "PUT",
      body: Buffer.from("zip-stream"),
      headers: expect.objectContaining({
        "x-vercel-blob-access": "private",
        "x-content-type": "application/zip",
      }),
    }));
  });

  it("maps paginated candidate listing through the installed SDK", async () => {
    const { listPrivateBlobs } = await import("./vercel-blob-adapter");

    const page = await listPrivateBlobs({
      prefix: "expense-slip-candidates/",
      cursor: "page-one",
    });

    expect(page).toEqual(expect.objectContaining({
      hasMore: true,
      cursor: "next-page",
      blobs: [expect.objectContaining({
        pathname: "expense-slip-candidates/org/request/orphan.png",
        uploadedAt: new Date("2026-07-10T12:00:00.000Z"),
      })],
    }));
    expect(requests.find((request) => request.method === "GET")).toEqual(expect.objectContaining({
      url: "/?limit=1000&prefix=expense-slip-candidates%2F&cursor=page-one",
      headers: expect.objectContaining({
        authorization: "Bearer vercel_blob_rw_contract_secret",
        "x-vercel-blob-store-id": "contract",
      }),
    }));
  });

  it("streams a private get response through the installed SDK", async () => {
    const originalDispatcher = getGlobalDispatcher();
    const agent = new MockAgent();
    agent.disableNetConnect();
    const bytes = Buffer.from("private-zip-stream");
    agent.get("https://contract.private.blob.vercel-storage.com").intercept({
      path: "/tenant-exports/11111111-1111-4111-8111-111111111111/export.zip",
      method: "GET",
      headers: { authorization: "Bearer vercel_blob_rw_contract_secret" },
    }).reply(200, bytes, {
      headers: {
        "content-type": "application/zip",
        "content-length": String(bytes.byteLength),
        etag: "get-etag",
        "last-modified": "Sun, 12 Jul 2026 12:00:00 GMT",
      },
    });
    setGlobalDispatcher(agent);
    try {
      const { readPrivateBlob } = await import("./vercel-blob-adapter");
      const result = await readPrivateBlob("tenant-exports/11111111-1111-4111-8111-111111111111/export.zip");
      if (!result || result.statusCode !== 200) throw new Error("expected_private_blob_stream");
      expect(result).toEqual(expect.objectContaining({ statusCode: 200 }));
      expect(result.blob).toEqual(expect.objectContaining({
        contentType: "application/zip",
        size: bytes.byteLength,
        etag: "get-etag",
      }));
      const chunks: Buffer[] = [];
      const reader = result.stream.getReader();
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        chunks.push(Buffer.from(next.value));
      }
      expect(Buffer.concat(chunks)).toEqual(bytes);
      agent.assertNoPendingInterceptors();
    } finally {
      setGlobalDispatcher(originalDispatcher);
      await agent.close();
    }
  });
});
