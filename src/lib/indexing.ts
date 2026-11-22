/**
 * Public indexing stays off until the invitation-only beta gate is lifted.
 * Set NEXT_PUBLIC_SEO_INDEXING=true only after the launch checklist allows
 * search engines to discover the marketplace.
 */
export function isIndexingEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_SEO_INDEXING,
): boolean {
  return value?.trim().toLowerCase() === "true";
}
