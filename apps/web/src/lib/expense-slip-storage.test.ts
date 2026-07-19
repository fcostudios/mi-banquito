import { Buffer } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { put } from "@vercel/blob";
import sharp from "sharp";

import { uploadContributionSlip, uploadExpenseSlip } from "./expense-slip-storage";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://private.blob.invalid/${pathname}` })),
  del: vi.fn(async () => undefined),
}));

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

function imageFile(bytes: number[], name: string, mimeType: string): File {
  return new File([Uint8Array.from(bytes)], name, { type: mimeType });
}

function realJpeg(): number[] {
  return Array.from(Buffer.from(
    "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAcEAADAAIDAQAAAAAAAAAAAAABAgMABQQGByH/xAAUAQEAAAAAAAAAAAAAAAAAAAAG/8QAGhEAAAcAAAAAAAAAAAAAAAAAAAECBDNxsf/aAAwDAQACEQMRAD8Auvm+n1l/O+rWvruHStNVxXd3gpZmMVJJJH0nGMYVcSrs9Ap3Ouz0f//Z",
    "base64",
  ));
}

function realWebp(): number[] {
  return Array.from(Buffer.from(
    "UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoCAAIAAUAmJaQAAudZtgAA/vZ//5wOIS38q//7Rj88te91eiYeAAAA",
    "base64",
  ));
}

function wrappedInvalidJpeg(): number[] {
  return [
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x00,
    0xff, 0xd9,
  ];
}

function wrappedInvalidWebp(): number[] {
  return [
    0x52, 0x49, 0x46, 0x46, 0x18, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20, 0x0b, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00,
  ];
}

async function upload(bytes: number[], name: string, mimeType: string) {
  return uploadExpenseSlip({
    orgId: ORG_ID,
    clientRequestId: REQUEST_ID,
    file: imageFile(bytes, name, mimeType),
  });
}

describe("expense slip structural image validation", () => {
  beforeEach(() => {
    vi.mocked(put).mockClear();
  });

  it("accepts structurally complete minimal JPEG and WebP fixtures", async () => {
    const jpeg = await upload(realJpeg(), "minimal.jpg", "image/jpeg");
    const webp = await upload(realWebp(), "minimal.webp", "image/webp");

    expect(jpeg).toMatchObject({ mimeType: "image/jpeg", byteSize: realJpeg().length });
    expect(webp).toMatchObject({ mimeType: "image/webp", byteSize: realWebp().length });
    expect(put).toHaveBeenNthCalledWith(1, expect.stringMatching(/^expense-slip-candidates\/.*\.jpg$/), expect.any(Blob),
      expect.objectContaining({ access: "private", contentType: "image/jpeg" }));
    expect(put).toHaveBeenNthCalledWith(2, expect.stringMatching(/^expense-slip-candidates\/.*\.webp$/), expect.any(Blob),
      expect.objectContaining({ access: "private", contentType: "image/webp" }));
  });

  it("uses a unique non-overwriting object key for each upload attempt", async () => {
    const first = await upload(realJpeg(), "receipt.jpg", "image/jpeg");
    const second = await upload(realJpeg(), "receipt.jpg", "image/jpeg");
    const firstPath = vi.mocked(put).mock.calls[0]?.[0];
    const secondPath = vi.mocked(put).mock.calls[1]?.[0];

    expect(firstPath).not.toBe(secondPath);
    expect(first.contentHash).toBe(second.contentHash);
    expect(put).toHaveBeenNthCalledWith(1, expect.any(String), expect.any(Blob), expect.objectContaining({
      addRandomSuffix: false,
      allowOverwrite: false,
    }));
    expect(put).toHaveBeenNthCalledWith(2, expect.any(String), expect.any(Blob), expect.objectContaining({
      addRandomSuffix: false,
      allowOverwrite: false,
    }));
  });

  it.each([
    ["structurally wrapped JPEG with invalid compressed data", wrappedInvalidJpeg()],
    ["SOF-only JPEG", wrappedInvalidJpeg().slice(0, 15)],
    ["JPEG without EOI", wrappedInvalidJpeg().slice(0, -2)],
    ["JPEG with an overflowing segment", [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x20, 0x00, 0xff, 0xd9]],
  ])("rejects %s", async (_case, bytes) => {
    await expect(upload(bytes, "invalid.jpg", "image/jpeg")).rejects.toThrow("movement_slip_invalid");
    expect(put).not.toHaveBeenCalled();
  });

  it.each([
    [
      "structurally wrapped WebP with invalid compressed data",
      wrappedInvalidWebp(),
    ],
    [
      "header-only VP8X WebP",
      [
        0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
        0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ],
    ],
    ["WebP with a false RIFF declared size", wrappedInvalidWebp().map((byte, index) => index === 4 ? 0x40 : byte)],
    ["WebP with an overflowing chunk length", wrappedInvalidWebp().map((byte, index) => index === 16 ? 0x40 : byte)],
    ["truncated WebP payload", wrappedInvalidWebp().slice(0, -4)],
  ])("rejects %s", async (_case, bytes) => {
    await expect(upload(bytes, "invalid.webp", "image/webp")).rejects.toThrow("movement_slip_invalid");
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a client MIME that does not match the decoded image format", async () => {
    await expect(upload(realJpeg(), "mismatch.webp", "image/webp")).rejects.toThrow("movement_slip_invalid");
    expect(put).not.toHaveBeenCalled();
  });
});

describe("contribution slip constraints", () => {
  it("downscales the long edge to 1024 pixels before upload", async () => {
    const source = await sharp({
      create: { width: 2048, height: 1200, channels: 3, background: "white" },
    }).jpeg().toBuffer();

    await uploadContributionSlip({
      orgId: ORG_ID,
      clientRequestId: REQUEST_ID,
      file: new File([new Uint8Array(source)], "large.jpg", { type: "image/jpeg" }),
    });

    const uploaded = vi.mocked(put).mock.calls.at(-1)?.[1];
    expect(uploaded).toBeInstanceOf(Blob);
    const metadata = await sharp(Buffer.from(await (uploaded as Blob).arrayBuffer())).metadata();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBe(1024);
  });
});
