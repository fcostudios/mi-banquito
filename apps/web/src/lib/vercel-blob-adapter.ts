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

export function readPrivateBlob(pathname: string) {
  return get(pathname, { access: "private" });
}
