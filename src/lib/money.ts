/**
 * Money handling for the catalog.
 *
 * Prices are stored as integer minor units (piastres) so that no fractional
 * currency arithmetic ever touches the database. EGP has 2 decimal places.
 */

const MAX_MINOR = 1_000_000_000; // 10,000,000.00 EGP — sanity bound for form input

/**
 * Formats integer piastres for display, e.g. 17500 -> "EGP 175.00".
 * Manual formatting keeps output stable across ICU/Node versions.
 */
export function formatEgp(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  const pounds = Math.floor(abs / 100);
  const piastres = abs % 100;
  return `${sign}EGP ${pounds.toLocaleString("en-US")}.${String(piastres).padStart(2, "0")}`;
}

/**
 * Parses human EGP input ("1,250.50", "1250", "EGP 99") into integer piastres.
 * Returns null for anything that is not a plain non-negative amount with at
 * most two decimals — never silently rounds or guesses.
 */
export function parseEgpToMinor(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, "").replace(/EGP/gi, "").trim();

  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;

  const [whole, fraction = ""] = cleaned.split(".");
  const minor = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));

  if (!Number.isSafeInteger(minor) || minor > MAX_MINOR) return null;

  return minor;
}

/** Inverse of {@link parseEgpToMinor} for pre-filling editable forms. */
export function minorToEgpInput(minor: number): string {
  const abs = Math.abs(Math.trunc(minor));
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
