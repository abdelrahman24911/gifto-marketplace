/**
 * Money handling for the catalog.
 *
 * Prices are stored as integer minor units (piastres) so that no fractional
 * currency arithmetic ever touches the database. EGP has 2 decimal places.
 */

/** Locales the storefront renders prices in. */
export type MoneyLocale = "en" | "ar";

const MAX_MINOR = 1_000_000_000; // 10,000,000.00 EGP — sanity bound for form input

/**
 * Formats integer piastres for display, e.g. 17500 -> "EGP 175.00".
 * Manual formatting keeps output stable across ICU/Node versions.
 *
 * With locale "ar" (P1-10, H-15) the amount is formatted with
 * Intl.NumberFormat("ar-EG"), so Arabic-speaking customers see Arabic-Indic
 * digits and the "ج.م." currency mark. Vendor/admin call sites keep the
 * default English format.
 */
export function formatEgp(minor: number, locale: MoneyLocale = "en"): string {
  if (locale === "ar") {
    // Node's ICU wraps the formatted value in invisible bidi marks
    // (U+200E/U+200F); strip them so the text copies and lays out cleanly.
    return new Intl.NumberFormat("ar-EG", {
      style: "currency",
      currency: "EGP",
    })
      .format(minor / 100)
      .replace(/[\u200e\u200f]/g, "");
  }

  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  const pounds = Math.floor(abs / 100);
  const piastres = abs % 100;
  return `${sign}EGP ${pounds.toLocaleString("en-US")}.${String(piastres).padStart(2, "0")}`;
}

/** Arabic-Indic digits (٠-٩) and Eastern Arabic-Indic digits (۰-۹). */
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";

/** Maps Arabic-Indic digits to Western digits and normalises separators. */
function normalizeArabicNumerals(input: string): string {
  return (
    input
      // Arabic-Indic / Eastern Arabic-Indic digits -> 0-9.
      .replace(/[٠-٩۰-۹]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit) % 10))
      // Arabic decimal separator (٫ U+066B) -> "."
      .replace(/٫/g, ".")
      // Arabic thousands separator (٬ U+066C) -> "" (removed).
      .replace(/٬/g, "")
  );
}

/**
 * Parses human EGP input ("1,250.50", "1250", "EGP 99") into integer piastres.
 * Returns null for anything that is not a plain non-negative amount with at
 * most two decimals.
 *
 * P1-10 (H-15): Arabic input is normalised first — Arabic-Indic digits,
 * the Arabic decimal separator (٫) and thousands separator (٬) — and a
 * decimal comma is accepted when it is unambiguous: exactly one comma,
 * followed by one or two digits at the end, with no dot and no other comma
 * ("250,50" -> 250.50). A comma in a group of three is still a thousands
 * separator ("1,250" -> 1250.00); anything mixing the two is rejected.
 */
export function parseEgpToMinor(input: string): number | null {
  const normalized = normalizeArabicNumerals(input)
    .replace(/EGP/gi, "")
    .replace(/ج\.?م\.?/g, "")
    .trim();

  // A single trailing comma with 1-2 digits is a decimal comma, not a
  // thousands separator (Arabic decimal-comma input, e.g. "250,50").
  const decimalComma = /^(\d+),(\d{1,2})$/.exec(normalized);
  const cleaned = decimalComma
    ? `${decimalComma[1]}.${decimalComma[2]}`
    : normalized;

  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }

  const [whole, fraction = ""] = cleaned.replace(/,/g, "").split(".");
  const minor = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));

  if (!Number.isSafeInteger(minor) || minor > MAX_MINOR) return null;

  return minor;
}

/** Inverse of {@link parseEgpToMinor} for pre-filling editable forms. */
export function minorToEgpInput(minor: number): string {
  const abs = Math.abs(Math.trunc(minor));
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
