import { createServer } from "node:http";

const blobs = new Map();

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3030");
  if (url.pathname === "/health") {
    response.writeHead(200).end("ok");
    return;
  }

  if (request.method === "PUT" && url.pathname === "/") {
    const pathname = url.searchParams.get("pathname");
    if (!pathname) {
      response.writeHead(400).end("missing pathname");
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    blobs.set(pathname, {
      bytes,
      contentType: request.headers["x-content-type"] ?? "application/octet-stream",
      request: {
        method: request.method,
        authorization: request.headers.authorization,
        access: request.headers["x-vercel-blob-access"],
        allowOverwrite: request.headers["x-allow-overwrite"],
        contentType: request.headers["x-content-type"],
      },
    });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      url: `https://contract.private.blob.vercel-storage.com/${pathname}`,
      downloadUrl: `https://contract.private.blob.vercel-storage.com/${pathname}?download=1`,
      pathname,
      contentType: request.headers["x-content-type"] ?? "application/octet-stream",
      contentDisposition: "inline",
      etag: `e2e-${bytes.byteLength}`,
    }));
    return;
  }

  if (request.method === "GET" && url.pathname === "/inspect") {
    const pathname = url.searchParams.get("pathname") ?? "";
    const blob = blobs.get(pathname);
    response.setHeader("content-type", "application/json");
    if (!blob) {
      response.writeHead(404).end(JSON.stringify({ error: "not_found" }));
      return;
    }
    response.end(JSON.stringify({
      pathname,
      byteSize: blob.bytes.byteLength,
      prefix: blob.bytes.subarray(0, 4).toString("utf8"),
      request: blob.request,
    }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/delete") {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    for (const uri of payload.urls ?? []) blobs.delete(new URL(uri).pathname.slice(1));
    response.setHeader("content-type", "application/json");
    response.end("{}");
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/blobs/")) {
    const pathname = decodeURIComponent(url.pathname.slice("/blobs/".length));
    const blob = blobs.get(pathname);
    if (!blob) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type": blob.contentType,
      "content-length": String(blob.bytes.byteLength),
      etag: `e2e-${blob.bytes.byteLength}`,
      "last-modified": "Wed, 22 Jul 2026 12:00:00 GMT",
    });
    response.end(blob.bytes);
    return;
  }

  response.writeHead(404).end("not found");
});

server.listen(3030, "127.0.0.1");
