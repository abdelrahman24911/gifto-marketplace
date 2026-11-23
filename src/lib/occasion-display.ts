/**
 * Presentation-only corrections and translations for hosted occasion records.
 * The database slug and stored name stay untouched until an admin edits them.
 */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "ramdan-night": "Ramadan Night",
};

const NAME_KEYS: Readonly<Record<string, string>> = {
  graduation: "names.graduation",
  "ramdan-night": "names.ramdan-night",
  birthdays: "names.birthdays",
  weddings: "names.weddings",
  "mothers-day": "names.mothers-day",
  housewarming: "names.housewarming",
};

type TranslateOccasionName = (key: string) => string;

export function occasionDisplayName(
  slug: string,
  name: string,
  translate?: TranslateOccasionName,
): string {
  const key = NAME_KEYS[slug];
  if (key && translate) return translate(key);

  return DISPLAY_NAMES[slug] ?? name;
}

/**
 * Seeded occasion rows point at a generic `demo-banner.jpg` placeholder with
 * baked-in text. Render the branded illustration instead of that asset.
 */
export function isSeedPlaceholderImage(path: string | null): boolean {
  return Boolean(
    path && (path === "demo-banner.jpg" || path.endsWith("/demo-banner.jpg")),
  );
}
