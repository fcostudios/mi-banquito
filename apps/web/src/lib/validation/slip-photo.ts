export type SlipPhotoInput = {
  byteSize: number;
  width: number;
  height: number;
  mimeType: string;
};

export type SlipPhotoValidation =
  | { ok: true; resizedLongEdge: number }
  | { ok: false; reason: "unsupported_type" | "too_large" | "invalid_dimensions" };

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateSlipPhoto(input: SlipPhotoInput): SlipPhotoValidation {
  if (!SUPPORTED.has(input.mimeType)) {
    return { ok: false, reason: "unsupported_type" };
  }
  if (input.byteSize > 5 * 1024 * 1024) {
    return { ok: false, reason: "too_large" };
  }

  const longEdge = Math.max(input.width, input.height);
  if (longEdge <= 0) {
    return { ok: false, reason: "invalid_dimensions" };
  }

  return { ok: true, resizedLongEdge: Math.min(longEdge, 1024) };
}
