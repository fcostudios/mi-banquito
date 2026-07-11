import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";

import { deletePrivateBlob, uploadPrivateBlob } from "./vercel-blob-adapter";

const MAX_SLIP_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 10_000;
const MAX_INPUT_PIXELS = 40_000_000;

const SUPPORTED_FORMATS = {
  jpeg: { mimeType: "image/jpeg", extension: "jpg" },
  png: { mimeType: "image/png", extension: "png" },
  webp: { mimeType: "image/webp", extension: "webp" },
} as const;

type SupportedImage = (typeof SUPPORTED_FORMATS)[keyof typeof SUPPORTED_FORMATS];

async function decodeImage(bytes: Uint8Array, declaredMimeType: string): Promise<SupportedImage> {
  if (!Object.values(SUPPORTED_FORMATS).some(({ mimeType }) => mimeType === declaredMimeType)) {
    throw new Error("movement_slip_invalid");
  }

  try {
    const decoder = sharp(bytes, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true,
    });
    const metadata = await decoder.metadata();
    const format = metadata.format && metadata.format in SUPPORTED_FORMATS
      ? SUPPORTED_FORMATS[metadata.format as keyof typeof SUPPORTED_FORMATS]
      : undefined;
    if (
      !format
      || format.mimeType !== declaredMimeType
      || !metadata.width
      || !metadata.height
      || metadata.width > MAX_IMAGE_DIMENSION
      || metadata.height > MAX_IMAGE_DIMENSION
    ) {
      throw new Error("movement_slip_invalid");
    }

    await decoder.clone().resize({
      width: 1,
      height: 1,
      fit: "inside",
      withoutEnlargement: true,
    }).toBuffer();
    return format;
  } catch {
    throw new Error("movement_slip_invalid");
  }
}

export async function uploadExpenseSlip(input: { orgId: string; clientRequestId: string; file: File }) {
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SLIP_BYTES) {
    throw new Error("movement_slip_invalid");
  }
  const image = await decodeImage(bytes, input.file.type);
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const pathname = `expense-slip-candidates/${input.orgId}/${input.clientRequestId}/${randomUUID()}-${contentHash}.${image.extension}`;
  const body = new Blob([bytes], { type: image.mimeType });
  const blob = await uploadPrivateBlob(pathname, body, image.mimeType);
  return {
    uri: blob.url,
    mimeType: image.mimeType,
    byteSize: bytes.byteLength,
    contentHash,
  } as const;
}

export async function deleteExpenseSlip(uri: string): Promise<void> {
  await deletePrivateBlob(uri);
}
