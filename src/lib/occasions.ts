import type { OccasionMatchMode } from "@/lib/supabase/database.types";
import { slugify } from "@/lib/slugify";

export const OCCASION_NAME_MIN = 2;
export const OCCASION_NAME_MAX = 80;
export const OCCASION_SLUG_MAX = 120;
export const OCCASION_DESCRIPTION_MAX = 2_000;
export const OCCASION_IMAGE_ALT_MAX = 200;
export const OCCASION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const OCCASION_MATCH_MODES = [
  "manual",
  "automatic",
  "hybrid",
] as const satisfies readonly OccasionMatchMode[];

export const OCCASION_MATCH_MODE_LABELS: Record<OccasionMatchMode, string> = {
  manual: "Manual",
  automatic: "Automatic",
  hybrid: "Hybrid",
};

// What each matching mode actually does, in plain words. Shown on the edit
// page and as a tooltip on the list page, where "Hybrid matching" used to
// appear with no explanation at all.
export const OCCASION_MATCH_MODE_NOTES: Record<OccasionMatchMode, string> = {
  manual:
    "Manual mode uses only the products picked above. These category and tag rules are saved for later but do not affect the public collection yet.",
  automatic:
    "Automatic mode uses category and tag matches only. Manual picks stay saved but are not currently included in the public collection.",
  hybrid:
    "Hybrid mode places manual picks first, then adds matching products from these categories and tags. A product matched more than once appears only once.",
};

export const OCCASION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OccasionFormValues = {
  name: string;
  slug: string;
  description: string;
  imageAlt: string;
  matchMode: OccasionMatchMode;
  isActive: boolean;
};

export type OccasionFieldErrors = Partial<
  Record<"name" | "slug" | "description" | "image_alt" | "match_mode" | "image", string>
>;

export function occasionFormValuesEqual(
  left: OccasionFormValues,
  right: OccasionFormValues,
): boolean {
  return (
    left.name === right.name &&
    left.slug === right.slug &&
    left.description === right.description &&
    left.imageAlt === right.imageAlt &&
    left.matchMode === right.matchMode &&
    left.isActive === right.isActive
  );
}

export function isOccasionFormDirty(
  values: OccasionFormValues,
  savedValues: OccasionFormValues,
  hasNewImage = false,
): boolean {
  return hasNewImage || !occasionFormValuesEqual(values, savedValues);
}

export type OccasionValidationResult = {
  ok: boolean;
  values: OccasionFormValues;
  fieldErrors: OccasionFieldErrors;
};

export function isOccasionMatchMode(
  value: string,
): value is OccasionMatchMode {
  return (OCCASION_MATCH_MODES as readonly string[]).includes(value);
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function normalizeOccasionName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeOccasionSlug(value: string, name: string): string {
  const candidate = value.trim() || name;
  return slugify(candidate);
}

/** Validates and normalizes untrusted form values against the DB constraints. */
export function validateOccasionInput(input: {
  name: string;
  slug: string;
  description: string;
  imageAlt: string;
  matchMode: string;
  isActive: boolean;
}): OccasionValidationResult {
  const name = normalizeOccasionName(input.name);
  const slug = normalizeOccasionSlug(input.slug, name);
  const description = input.description.replace(/\r\n?/g, "\n").trim();
  const imageAlt = normalizeOccasionName(input.imageAlt);
  const fieldErrors: OccasionFieldErrors = {};

  if (name.length < OCCASION_NAME_MIN || name.length > OCCASION_NAME_MAX) {
    fieldErrors.name = `Name must be between ${OCCASION_NAME_MIN} and ${OCCASION_NAME_MAX} characters.`;
  }

  if (!slug) {
    fieldErrors.slug =
      "Enter a slug using Latin letters, numbers and hyphens.";
  } else if (slug.length > OCCASION_SLUG_MAX) {
    fieldErrors.slug = `Slug must be ${OCCASION_SLUG_MAX} characters or fewer.`;
  } else if (!OCCASION_SLUG_PATTERN.test(slug)) {
    fieldErrors.slug =
      "Use lowercase Latin letters, numbers and single hyphens.";
  }

  if (description.length > OCCASION_DESCRIPTION_MAX) {
    fieldErrors.description = `Description must be ${OCCASION_DESCRIPTION_MAX.toLocaleString()} characters or fewer.`;
  }

  if (imageAlt.length > OCCASION_IMAGE_ALT_MAX) {
    fieldErrors.image_alt = `Image alt text must be ${OCCASION_IMAGE_ALT_MAX} characters or fewer.`;
  }

  if (!isOccasionMatchMode(input.matchMode)) {
    fieldErrors.match_mode = "Choose a valid matching mode.";
  }

  const matchMode = isOccasionMatchMode(input.matchMode)
    ? input.matchMode
    : "hybrid";

  return {
    ok: Object.keys(fieldErrors).length === 0,
    values: {
      name,
      slug,
      description,
      imageAlt,
      matchMode,
      isActive: input.isActive,
    },
    fieldErrors,
  };
}

export const OCCASION_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type OccasionImageContentType = keyof typeof OCCASION_IMAGE_TYPES;
export type OccasionImageExtension =
  (typeof OCCASION_IMAGE_TYPES)[OccasionImageContentType];

export type ValidatedOccasionImage = {
  contentType: OccasionImageContentType;
  extension: OccasionImageExtension;
};

export function validateOccasionImageBasics(file: {
  name: string;
  size: number;
  type: string;
}):
  | { ok: true; value: ValidatedOccasionImage }
  | { ok: false; error: string } {
  if (file.size <= 0) {
    return { ok: false, error: "Choose a non-empty image file." };
  }

  if (file.size > OCCASION_IMAGE_MAX_BYTES) {
    return { ok: false, error: "The image must be 5 MB or smaller." };
  }

  const extension =
    OCCASION_IMAGE_TYPES[file.type as OccasionImageContentType];
  if (!extension) {
    return { ok: false, error: "Use a JPEG, PNG or WebP image." };
  }

  return {
    ok: true,
    value: { contentType: file.type as OccasionImageContentType, extension },
  };
}

/** Reads magic bytes so a client-supplied MIME type cannot disguise a file. */
export function detectOccasionImageType(
  bytes: Uint8Array,
): OccasionImageContentType | null {
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

  return null;
}

export async function validateOccasionImageFile(
  file: File,
): Promise<
  | { ok: true; value: ValidatedOccasionImage }
  | { ok: false; error: string }
> {
  const basics = validateOccasionImageBasics(file);
  if (!basics.ok) return basics;

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detected = detectOccasionImageType(header);

  if (!detected) {
    return {
      ok: false,
      error: "The file does not look like a valid JPEG, PNG or WebP image.",
    };
  }

  if (detected !== file.type) {
    return {
      ok: false,
      error: "The file contents do not match the selected image type.",
    };
  }

  return {
    ok: true,
    value: {
      contentType: detected,
      extension: OCCASION_IMAGE_TYPES[detected],
    },
  };
}

export function buildOccasionImagePath(
  occasionId: string,
  extension: OccasionImageExtension,
): string {
  if (!isUuid(occasionId)) {
    throw new Error("A valid occasion id is required for image paths.");
  }
  if (!/^(jpg|jpeg|png|webp)$/.test(extension)) {
    throw new Error("Unsupported occasion image extension.");
  }

  return `${occasionId}/${crypto.randomUUID()}.${extension}`;
}

export function attachPreservedOccasionImage(
  formData: FormData,
  preservedFile: File | null,
): FormData {
  if (!preservedFile) return formData;

  const current = formData.get("image");
  const hasFile =
    typeof current !== "string" &&
    current !== null &&
    current.size > 0;

  if (!hasFile) {
    formData.set("image", preservedFile, preservedFile.name);
  }

  return formData;
}

/** Guards cleanup so an admin action can never remove an unrelated object. */
export function occasionImagePathBelongsTo(
  path: string,
  occasionId: string,
): boolean {
  if (!isUuid(occasionId)) return false;

  return new RegExp(
    `^${occasionId}/[A-Za-z0-9._-]+\\.(jpg|jpeg|png|webp)$`,
    "i",
  ).test(path);
}

export type MoveDirection = "up" | "down";

export type MoveOccasionResult = {
  ids: string[];
  moved: boolean;
  reason: "missing" | "first" | "last" | null;
};

/** Moves one id within a complete ordered list; hidden rows are not special. */
export function moveOccasionId(
  ids: readonly string[],
  occasionId: string,
  direction: MoveDirection,
): MoveOccasionResult {
  const next = [...ids];
  const index = next.indexOf(occasionId);

  if (index === -1) {
    return { ids: next, moved: false, reason: "missing" };
  }

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0) {
    return { ids: next, moved: false, reason: "first" };
  }
  if (target >= next.length) {
    return { ids: next, moved: false, reason: "last" };
  }

  [next[index], next[target]] = [next[target], next[index]];
  return { ids: next, moved: true, reason: null };
}

export const OCCASION_STATUS_FILTERS = [
  "all",
  "published",
  "hidden",
] as const;

export type OccasionStatusFilter = (typeof OCCASION_STATUS_FILTERS)[number];

export function parseOccasionStatusFilter(
  value: string | undefined,
): OccasionStatusFilter {
  return (OCCASION_STATUS_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as OccasionStatusFilter)
    : "all";
}

export function filterOccasions<
  T extends { name: string; is_active: boolean },
>(rows: readonly T[], query: string, status: OccasionStatusFilter): T[] {
  const needle = query.trim().toLowerCase();

  return rows.filter((row) => {
    if (status === "published" && !row.is_active) return false;
    if (status === "hidden" && row.is_active) return false;
    return !needle || row.name.toLowerCase().includes(needle);
  });
}
