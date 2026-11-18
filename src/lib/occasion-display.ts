/**
 * Presentation-only corrections for hosted occasion records. The database slug
 * and stored name stay untouched until an admin edits them.
 */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "ramdan-night": "Ramadan Night",
};

export function occasionDisplayName(slug: string, name: string): string {
  return DISPLAY_NAMES[slug] ?? name;
}
