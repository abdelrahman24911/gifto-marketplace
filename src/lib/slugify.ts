/**
 * Mirrors the database-side `public.slugify()` exactly so that slugs computed
 * in the application match what the database derives on insert:
 * runs of non-alphanumerics collapse to a single hyphen, ends are trimmed.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
