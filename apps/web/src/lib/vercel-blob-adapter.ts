import { del, get, list, put } from "@vercel/blob";

export function uploadPrivateBlob(pathname: string, body: Parameters<typeof put>[1], contentType: string) {
  return put(pathname, body, {
    access: "private",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: false,
  });
}

export async function deletePrivateBlob(uri: string): Promise<void> {
  await del(uri);
}

export function listPrivateBlobs(input: { prefix: string; cursor?: string }) {
  return list({
    limit: 1_000,
    prefix: input.prefix,
    cursor: input.cursor,
  });
}

export async function readPrivateBlob(pathname: string) {
  const e2eBaseUrl = process.env.NODE_ENV !== "production"
    ? process.env.E2E_BLOB_READ_BASE_URL
    : undefined;
  if (e2eBaseUrl) {
    const response = await fetch(`${e2eBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(pathname)}`);
    if (response.status === 404) return null;
    if (!response.ok || !response.body) throw new Error(`e2e_blob_read_failed:${response.status}`);
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    return {
      statusCode: 200 as const,
      stream: response.body,
      headers: response.headers,
      blob: {
        url: `${e2eBaseUrl}/${pathname}`,
        downloadUrl: `${e2eBaseUrl}/${pathname}?download=1`,
        pathname,
        contentType,
        contentDisposition: response.headers.get("content-disposition") ?? "",
        cacheControl: response.headers.get("cache-control") ?? "",
        size: Number(response.headers.get("content-length") ?? 0),
        uploadedAt: new Date(response.headers.get("last-modified") ?? Date.now()),
        etag: response.headers.get("etag") ?? "",
      },
    };
  }
  return get(pathname, { access: "private" });
}
