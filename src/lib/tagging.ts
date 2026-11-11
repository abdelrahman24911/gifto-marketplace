export const TAG_NAME_MIN = 2;
export const TAG_NAME_MAX = 60;
export const TAG_DESCRIPTION_MAX = 500;
export const PRODUCT_TAG_LIMIT = 10;

export type TagInputValues = {
  name: string;
  description: string;
};

export type TagFieldErrors = Partial<
  Record<"name" | "description" | "rejection_reason", string>
>;

export function normalizeTagName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeTagDescription(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function validateTagInput(input: {
  name: string;
  description?: string;
}): {
  ok: boolean;
  values: TagInputValues;
  fieldErrors: TagFieldErrors;
} {
  const name = normalizeTagName(input.name);
  const description = normalizeTagDescription(input.description ?? "");
  const fieldErrors: TagFieldErrors = {};

  if (name.length < TAG_NAME_MIN || name.length > TAG_NAME_MAX) {
    fieldErrors.name = `Tag name must be between ${TAG_NAME_MIN} and ${TAG_NAME_MAX} characters.`;
  }

  if (description.length > TAG_DESCRIPTION_MAX) {
    fieldErrors.description = `Tag description must be ${TAG_DESCRIPTION_MAX} characters or fewer.`;
  }

  return {
    ok: Object.keys(fieldErrors).length === 0,
    values: { name, description },
    fieldErrors,
  };
}

export function tagSelectionIsDirty(
  selected: readonly string[],
  saved: readonly string[],
): boolean {
  if (selected.length !== saved.length) return true;
  const savedIds = new Set(saved);
  return selected.some((id) => !savedIds.has(id));
}

export function toggleTagSelection(
  selected: readonly string[],
  tagId: string,
  checked: boolean,
): string[] {
  if (checked) {
    return selected.includes(tagId) ? [...selected] : [...selected, tagId];
  }
  return selected.filter((id) => id !== tagId);
}
