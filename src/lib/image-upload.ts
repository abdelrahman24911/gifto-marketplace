/**
 * Shared image-upload validation.
 *
 * The Storage buckets enforce size and declared MIME type at the API layer,
 * but that check trusts the client-supplied `Content-Type` header, so a
 * disguised file (e.g. an HTML document labelled image/jpeg) would pass it.
 * These helpers verify the actual file contents via magic bytes before an
 * upload reaches Storage. Occasion images already had their own copy of
 * this check; product images and vendor branding used only the declared
 * type, so all three surfaces now share one implementation.
 */

export type ImageContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/avif";

export type ImageValidationReason =
  | "empty"
  | "too-large"
  | "unsupported-type"
  | "invalid-content"
  | "type-mismatch";

/** Detects an image type from its magic bytes, or null if unrecognised. */
export function detectImageType(bytes: Uint8Array): ImageContentType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70 &&
    bytes[8] === 0x61 &&
    bytes[9] === 0x76 &&
    bytes[10] === 0x69 &&
    bytes[11] === 0x66
  ) {
    return "image/avif";
  }

  return null;
}

export type ValidatedImage<T extends ImageContentType = ImageContentType> = {
  contentType: T;
  extension: string;
};

export type ImageValidationOptions = {
  /** Maximum accepted file size in bytes. */
  maxBytes: number;
  /**
   * Declared MIME type -> file extension for the types this surface allows.
   * The detected content type must be one of these keys.
   */
  allowed: Partial<Record<ImageContentType, string>>;
};

/**
 * Validates size, declared type, and actual contents of an image file.
 * The returned `contentType`/`extension` come from the detected bytes, never
 * from the client-supplied `file.type`, so the Storage upload cannot be
 * tricked into storing a disguised file under an image content type.
 * Callers map `reason` to their own user-facing message.
 */
export async function validateImageFile(
  file: File,
  options: ImageValidationOptions,
): Promise<
  | { ok: true; value: ValidatedImage }
  | { ok: false; reason: ImageValidationReason }
> {
  if (file.size <= 0) {
    return { ok: false, reason: "empty" };
  }

  if (file.size > options.maxBytes) {
    return { ok: false, reason: "too-large" };
  }

  const extension = options.allowed[file.type as ImageContentType];
  if (!extension) {
    return { ok: false, reason: "unsupported-type" };
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detected = detectImageType(header);

  if (!detected) {
    return { ok: false, reason: "invalid-content" };
  }

  // The label must match the bytes, even when the detected type is one this
  // surface would otherwise accept — a mismatched label is a disguised file.
  if (detected !== file.type) {
    return { ok: false, reason: "type-mismatch" };
  }

  return {
    ok: true,
    value: { contentType: detected, extension: options.allowed[detected]! },
  };
}
