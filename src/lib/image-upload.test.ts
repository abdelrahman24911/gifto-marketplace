import { describe, expect, it } from "vitest";

import {
  detectImageType,
  validateImageFile,
  type ImageContentType,
} from "./image-upload";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const AVIF_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
]);
const GARBAGE_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

const ALLOWED: Record<ImageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function imageFile(
  name: string,
  type: string,
  bytes: Uint8Array<ArrayBuffer> = PNG_BYTES,
) {
  return new File([bytes], name, { type });
}

describe("detectImageType", () => {
  it("detects JPEG, PNG, WebP and AVIF magic bytes", () => {
    expect(detectImageType(JPEG_BYTES)).toBe("image/jpeg");
    expect(detectImageType(PNG_BYTES)).toBe("image/png");
    expect(detectImageType(WEBP_BYTES)).toBe("image/webp");
    expect(detectImageType(AVIF_BYTES)).toBe("image/avif");
  });

  it("returns null for garbage and truncated headers", () => {
    expect(detectImageType(GARBAGE_BYTES)).toBeNull();
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(new Uint8Array([]))).toBeNull();
    // RIFF without the WEBP trailer is not WebP.
    expect(
      detectImageType(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
          0x51,
        ]),
      ),
    ).toBeNull();
    // ftyp without the avif brand is not AVIF.
    expect(
      detectImageType(
        new Uint8Array([
          0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69,
          0x63,
        ]),
      ),
    ).toBeNull();
  });
});

describe("validateImageFile", () => {
  const options = { maxBytes: 5 * 1024 * 1024, allowed: ALLOWED };

  it("accepts a file whose bytes match its declared type", async () => {
    await expect(
      validateImageFile(imageFile("a.png", "image/png"), options),
    ).resolves.toEqual({
      ok: true,
      value: { contentType: "image/png", extension: "png" },
    });
    await expect(
      validateImageFile(imageFile("a.avif", "image/avif", AVIF_BYTES), options),
    ).resolves.toEqual({
      ok: true,
      value: { contentType: "image/avif", extension: "avif" },
    });
  });

  it("rejects empty and oversized files", async () => {
    await expect(
      validateImageFile(new File([], "empty.png", { type: "image/png" }), options),
    ).resolves.toEqual({ ok: false, reason: "empty" });
    await expect(
      validateImageFile(
        imageFile("big.png", "image/png", new Uint8Array(11)),
        { maxBytes: 10, allowed: ALLOWED },
      ),
    ).resolves.toEqual({ ok: false, reason: "too-large" });
  });

  it("rejects a declared type outside the allowed set", async () => {
    await expect(
      validateImageFile(imageFile("a.gif", "image/gif", GARBAGE_BYTES), options),
    ).resolves.toEqual({ ok: false, reason: "unsupported-type" });
  });

  it("rejects an allowed MIME type whose bytes are not an image", async () => {
    await expect(
      validateImageFile(
        imageFile("a.png", "image/png", GARBAGE_BYTES),
        options,
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid-content" });
  });

  it("rejects bytes that do not match the declared type", async () => {
    await expect(
      validateImageFile(imageFile("a.jpg", "image/jpeg", PNG_BYTES), options),
    ).resolves.toEqual({ ok: false, reason: "type-mismatch" });
  });

  it("rejects a detected type the surface does not allow", async () => {
    // AVIF bytes labelled image/png, on a surface that allows only PNG:
    // the content is a real image, but not one this surface accepts.
    await expect(
      validateImageFile(imageFile("a.png", "image/png", AVIF_BYTES), {
        maxBytes: 5 * 1024 * 1024,
        allowed: { "image/png": "png" },
      }),
    ).resolves.toEqual({ ok: false, reason: "type-mismatch" });
    // And AVIF bytes honestly labelled image/avif on the PNG-only surface.
    await expect(
      validateImageFile(imageFile("a.avif", "image/avif", AVIF_BYTES), {
        maxBytes: 5 * 1024 * 1024,
        allowed: { "image/png": "png" },
      }),
    ).resolves.toEqual({ ok: false, reason: "unsupported-type" });
  });
});
