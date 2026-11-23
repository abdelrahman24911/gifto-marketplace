import { describe, expect, it } from "vitest";

import {
  OCCASION_DESCRIPTION_MAX,
  OCCASION_IMAGE_ALT_MAX,
  OCCASION_IMAGE_MAX_BYTES,
  OCCASION_NAME_MAX,
  OCCASION_SLUG_MAX,
  attachPreservedOccasionImage,
  buildOccasionImagePath,
  detectOccasionImageType,
  filterOccasions,
  isOccasionFormDirty,
  isOccasionMatchMode,
  isUuid,
  moveOccasionId,
  normalizeOccasionName,
  normalizeOccasionSlug,
  occasionFormValuesEqual,
  occasionImagePathBelongsTo,
  parseOccasionStatusFilter,
  validateOccasionImageBasics,
  validateOccasionImageFile,
  validateOccasionInput,
  type OccasionFormValues,
} from "./occasions";

const OCCASION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

const validInput = {
  name: "  Ramadan   evenings ",
  slug: "",
  description: "  Warm gifts for the table.  ",
  imageAlt: "  Lanterns   at dusk ",
  matchMode: "hybrid",
  isActive: false,
};

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

function imageFile(name: string, type: string, bytes = PNG_BYTES) {
  return new File([bytes], name, { type });
}

describe("occasion value normalization", () => {
  it("collapses name whitespace", () => {
    expect(normalizeOccasionName("  Eid   al-Fitr ")).toBe("Eid al-Fitr");
  });

  it("falls back to the name and slugifies the slug", () => {
    expect(normalizeOccasionSlug("", "Eid al-Fitr")).toBe("eid-al-fitr");
    expect(normalizeOccasionSlug("  Mother's Day  ", "Ignored")).toBe(
      "mother-s-day",
    );
  });

  it("recognizes only the database matching modes", () => {
    expect(isOccasionMatchMode("manual")).toBe(true);
    expect(isOccasionMatchMode("automatic")).toBe(true);
    expect(isOccasionMatchMode("hybrid")).toBe(true);
    expect(isOccasionMatchMode("rules")).toBe(false);
    expect(isOccasionMatchMode("")).toBe(false);
  });

  it("accepts only RFC-style UUIDs", () => {
    expect(isUuid(OCCASION_ID)).toBe(true);
    expect(isUuid(OCCASION_ID.toUpperCase())).toBe(true);
    expect(isUuid("11111111-1111-4111-8111")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

describe("occasion form dirty state", () => {
  const savedValues: OccasionFormValues = {
    name: "Ramadan evenings",
    slug: "ramadan-evenings",
    description: "Warm gifts for the table.",
    imageAlt: "Lanterns at dusk",
    matchMode: "hybrid",
    isActive: false,
  };

  it("treats identical values as unchanged", () => {
    expect(occasionFormValuesEqual(savedValues, { ...savedValues })).toBe(true);
    expect(isOccasionFormDirty(savedValues, savedValues)).toBe(false);
  });

  it("detects each editable field and a new image", () => {
    expect(
      occasionFormValuesEqual(savedValues, {
        ...savedValues,
        name: "Ramadan evenings ",
      }),
    ).toBe(false);
    expect(
      isOccasionFormDirty({ ...savedValues, isActive: true }, savedValues),
    ).toBe(true);
    expect(isOccasionFormDirty(savedValues, savedValues, true)).toBe(true);
  });

  it("becomes clean again when edits are reverted", () => {
    const edited: OccasionFormValues = {
      ...savedValues,
      description: "Temporary edit",
    };

    expect(isOccasionFormDirty(edited, savedValues)).toBe(true);
    expect(
      isOccasionFormDirty(
        { ...edited, description: savedValues.description },
        savedValues,
      ),
    ).toBe(false);
  });
});

describe("validateOccasionInput", () => {
  it("normalizes valid values and generates a slug from the name", () => {
    const result = validateOccasionInput(validInput);

    expect(result.ok).toBe(true);
    expect(result.fieldErrors).toEqual({});
    expect(result.values).toEqual({
      name: "Ramadan evenings",
      slug: "ramadan-evenings",
      description: "Warm gifts for the table.",
      imageAlt: "Lanterns at dusk",
      matchMode: "hybrid",
      isActive: false,
    });
  });

  it("normalizes CRLF descriptions without trimming the meaning", () => {
    const result = validateOccasionInput({
      ...validInput,
      description: "  Line one\r\nLine two\r  ",
    });

    expect(result.values.description).toBe("Line one\nLine two");
  });

  it("reports boundary violations for name, slug, description and alt text", () => {
    const result = validateOccasionInput({
      name: "a",
      slug: "a".repeat(OCCASION_SLUG_MAX + 1),
      description: "x".repeat(OCCASION_DESCRIPTION_MAX + 1),
      imageAlt: "x".repeat(OCCASION_IMAGE_ALT_MAX + 1),
      matchMode: "not-a-mode",
      isActive: false,
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors).toEqual({
      name: expect.any(String),
      slug: expect.any(String),
      description: expect.any(String),
      image_alt: expect.any(String),
      match_mode: expect.any(String),
    });
    expect(result.values.matchMode).toBe("hybrid");
  });

  it("rejects a name over the maximum length", () => {
    const result = validateOccasionInput({
      ...validInput,
      name: "x".repeat(OCCASION_NAME_MAX + 1),
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors.name).toContain(String(OCCASION_NAME_MAX));
  });

  it("reports an empty slug when neither slug nor usable name is supplied", () => {
    const result = validateOccasionInput({
      ...validInput,
      name: "!!",
      slug: "!!",
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors.slug).toBeDefined();
  });
});

describe("image validation", () => {
  it("accepts JPEG, PNG and WebP basics with the expected extension", () => {
    expect(
      validateOccasionImageBasics({
        name: "a.jpg",
        size: 100,
        type: "image/jpeg",
      }),
    ).toEqual({
      ok: true,
      value: { contentType: "image/jpeg", extension: "jpg" },
    });
    expect(
      validateOccasionImageBasics({
        name: "a.png",
        size: 100,
        type: "image/png",
      }),
    ).toMatchObject({ ok: true, value: { extension: "png" } });
    expect(
      validateOccasionImageBasics({
        name: "a.webp",
        size: OCCASION_IMAGE_MAX_BYTES,
        type: "image/webp",
      }),
    ).toMatchObject({ ok: true, value: { extension: "webp" } });
  });

  it("rejects empty, oversized and unsupported files", () => {
    expect(
      validateOccasionImageBasics({ name: "a.png", size: 0, type: "image/png" }),
    ).toMatchObject({ ok: false });
    expect(
      validateOccasionImageBasics({
        name: "a.png",
        size: OCCASION_IMAGE_MAX_BYTES + 1,
        type: "image/png",
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("5 MB") });
    expect(
      validateOccasionImageBasics({
        name: "a.gif",
        size: 100,
        type: "image/gif",
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("JPEG") });
  });

  it("detects magic bytes for every allowed format", () => {
    expect(
      detectOccasionImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
    ).toBe("image/jpeg");
    expect(detectOccasionImageType(PNG_BYTES)).toBe("image/png");
    expect(
      detectOccasionImageType(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
          0x50,
        ]),
      ),
    ).toBe("image/webp");
    expect(detectOccasionImageType(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it("accepts a matching file and rejects a spoofed content type", async () => {
    await expect(
      validateOccasionImageFile(imageFile("a.png", "image/png")),
    ).resolves.toMatchObject({
      ok: true,
      value: { contentType: "image/png", extension: "png" },
    });

    await expect(
      validateOccasionImageFile(imageFile("a.jpg", "image/jpeg")),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("do not match"),
    });
  });

  it("rejects an allowed MIME type whose bytes are not an image", async () => {
    await expect(
      validateOccasionImageFile(
        imageFile("a.png", "image/png", new Uint8Array([1, 2, 3, 4])),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("does not look like"),
    });
  });
});

describe("preserved occasion images", () => {
  it("re-attaches a preserved file when the rebuilt form has none", () => {
    const formData = new FormData();
    formData.set("name", "Eid al-Fitr");
    const preserved = imageFile("preserved.png", "image/png");

    attachPreservedOccasionImage(formData, preserved);

    const attached = formData.get("image");
    expect(attached).toBeInstanceOf(File);
    expect((attached as File).name).toBe("preserved.png");
  });

  it("replaces an empty file input with the preserved file", () => {
    const formData = new FormData();
    formData.set(
      "image",
      new File([], "", { type: "application/octet-stream" }),
    );
    const preserved = imageFile("preserved.png", "image/png");

    attachPreservedOccasionImage(formData, preserved);

    expect((formData.get("image") as File).name).toBe("preserved.png");
  });

  it("does not replace a freshly selected file", () => {
    const formData = new FormData();
    const fresh = imageFile("fresh.png", "image/png");
    formData.set("image", fresh);

    attachPreservedOccasionImage(
      formData,
      imageFile("preserved.png", "image/png"),
    );

    expect((formData.get("image") as File).name).toBe("fresh.png");
  });

  it("leaves the form untouched when nothing was preserved", () => {
    const formData = new FormData();
    formData.set("name", "Eid al-Fitr");

    attachPreservedOccasionImage(formData, null);

    expect(formData.get("image")).toBeNull();
  });
});

describe("occasion image paths", () => {
  it("builds a UUID-owned path with a supported extension", () => {
    const path = buildOccasionImagePath(OCCASION_ID, "webp");

    expect(path).toMatch(
      new RegExp(`^${OCCASION_ID}/[0-9a-f-]{36}\\.webp$`),
    );
    expect(occasionImagePathBelongsTo(path, OCCASION_ID)).toBe(true);
  });

  it("refuses invalid ids or extensions", () => {
    expect(() => buildOccasionImagePath("not-a-uuid", "jpg")).toThrow();
    expect(() =>
      buildOccasionImagePath(
        OCCASION_ID,
        "gif" as Parameters<typeof buildOccasionImagePath>[1],
      ),
    ).toThrow();
  });

  it("only recognizes objects inside the matching occasion folder", () => {
    expect(
      occasionImagePathBelongsTo(`${OCCASION_ID}/image.png`, OCCASION_ID),
    ).toBe(true);
    expect(
      occasionImagePathBelongsTo(`${OTHER_ID}/image.png`, OCCASION_ID),
    ).toBe(false);
    expect(
      occasionImagePathBelongsTo(`${OCCASION_ID}/../image.png`, OCCASION_ID),
    ).toBe(false);
    expect(
      occasionImagePathBelongsTo(`${OCCASION_ID}/nested/image.png`, OCCASION_ID),
    ).toBe(false);
  });
});

describe("moveOccasionId", () => {
  const ids = [OCCASION_ID, OTHER_ID, "33333333-3333-4333-8333-333333333333"];

  it("swaps adjacent ids while preserving the rest", () => {
    expect(moveOccasionId(ids, OTHER_ID, "up")).toEqual({
      ids: [OTHER_ID, OCCASION_ID, ids[2]],
      moved: true,
      reason: null,
    });
    expect(moveOccasionId(ids, OTHER_ID, "down")).toEqual({
      ids: [OCCASION_ID, ids[2], OTHER_ID],
      moved: true,
      reason: null,
    });
    expect(ids).toEqual([
      OCCASION_ID,
      OTHER_ID,
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("reports boundaries without changing the list", () => {
    expect(moveOccasionId(ids, OCCASION_ID, "up")).toMatchObject({
      ids,
      moved: false,
      reason: "first",
    });
    expect(moveOccasionId(ids, ids[2], "down")).toMatchObject({
      ids,
      moved: false,
      reason: "last",
    });
  });

  it("reports ids that are no longer present", () => {
    expect(moveOccasionId(ids, "44444444-4444-4444-8444-444444444444", "up")).toMatchObject({
      ids,
      moved: false,
      reason: "missing",
    });
  });
});

describe("occasion filtering", () => {
  const rows = [
    { name: "Ramadan evenings", is_active: true },
    { name: "Mother's Day", is_active: false },
    { name: "Eid al-Fitr", is_active: true },
  ];

  it("parses only known status values", () => {
    expect(parseOccasionStatusFilter("published")).toBe("published");
    expect(parseOccasionStatusFilter("hidden")).toBe("hidden");
    expect(parseOccasionStatusFilter("all")).toBe("all");
    expect(parseOccasionStatusFilter("archived")).toBe("all");
    expect(parseOccasionStatusFilter(undefined)).toBe("all");
  });

  it("filters by status and case-insensitive name", () => {
    expect(filterOccasions(rows, "", "all")).toHaveLength(3);
    expect(filterOccasions(rows, "", "published")).toEqual([
      rows[0],
      rows[2],
    ]);
    expect(filterOccasions(rows, "", "hidden")).toEqual([rows[1]]);
    expect(filterOccasions(rows, "  EID ", "all")).toEqual([rows[2]]);
    expect(filterOccasions(rows, "missing", "all")).toEqual([]);
  });
});
