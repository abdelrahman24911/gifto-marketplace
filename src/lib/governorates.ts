/**
 * Egypt's 27 governorates — the one canonical list for the whole app.
 *
 * P1-06 (H-06): checkout and vendor coverage both import this module; no
 * second copy exists. The canonical stored value is the English name
 * (e.g. "Cairo"); the Arabic name is shown beside it in pickers.
 *
 * The normaliser below maps the free-text variants that already exist in
 * stored data (trim, case, a trailing "Governorate" suffix or a leading
 * "محافظة" prefix, Arabic orthographic variants) to the canonical English
 * name. Anything it cannot map returns null — it is never guessed into a
 * different governorate; unmappable values are preserved as-is and reported.
 */

export type Governorate = {
  /** Canonical stored value. */
  en: string;
  /** Arabic name, shown beside the English name in pickers. */
  ar: string;
};

export const GOVERNORATES: readonly Governorate[] = [
  { en: "Cairo", ar: "القاهرة" },
  { en: "Alexandria", ar: "الإسكندرية" },
  { en: "Giza", ar: "الجيزة" },
  { en: "Qalyubia", ar: "القليوبية" },
  { en: "Dakahlia", ar: "الدقهلية" },
  { en: "Sharqia", ar: "الشرقية" },
  { en: "Gharbia", ar: "الغربية" },
  { en: "Monufia", ar: "المنوفية" },
  { en: "Beheira", ar: "البحيرة" },
  { en: "Kafr El Sheikh", ar: "كفر الشيخ" },
  { en: "Damietta", ar: "دمياط" },
  { en: "Port Said", ar: "بورسعيد" },
  { en: "Ismailia", ar: "الإسماعيلية" },
  { en: "Suez", ar: "السويس" },
  { en: "Faiyum", ar: "الفيوم" },
  { en: "Beni Suef", ar: "بني سويف" },
  { en: "Minya", ar: "المنيا" },
  { en: "Asyut", ar: "أسيوط" },
  { en: "Sohag", ar: "سوهاج" },
  { en: "Qena", ar: "قنا" },
  { en: "Luxor", ar: "الأقصر" },
  { en: "Aswan", ar: "أسوان" },
  { en: "Red Sea", ar: "البحر الأحمر" },
  { en: "New Valley", ar: "الوادي الجديد" },
  { en: "Matrouh", ar: "مطروح" },
  { en: "North Sinai", ar: "شمال سيناء" },
  { en: "South Sinai", ar: "جنوب سيناء" },
] as const;

export const GOVERNORATE_NAMES: readonly string[] = GOVERNORATES.map(
  (governorate) => governorate.en,
);

export function isGovernorate(value: string): value is string {
  return (GOVERNORATE_NAMES as readonly string[]).includes(value);
}

export function governorateLabel(en: string): string {
  const found = GOVERNORATES.find((governorate) => governorate.en === en);
  return found ? `${found.en} — ${found.ar}` : en;
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Normalises Arabic orthography for matching only: the alef forms
 * (أ/إ/آ) collapse to ا, teh marbuta (ة) to ه, and alef maksura (ى)
 * to ي. No two governorate names differ only by these letters, so
 * this cannot map one governorate into another.
 */
function normalizeArabic(value: string): string {
  return value
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

/**
 * The match key for a governorate value: trimmed, single-spaced,
 * case-folded, with a trailing "governorate" / "محافظة" suffix
 * stripped, and Arabic orthography normalised. Identical rules are
 * implemented in SQL by normalize_governorate_name() (migration 37);
 * keep the two in sync.
 */
export function governorateMatchKey(value: string): string {
  const collapsed = collapseWhitespace(value).toLowerCase();
  // English puts the suffix last ("Cairo Governorate"); Arabic puts it
  // first ("محافظة القاهرة" — literally "Governorate Cairo").
  const stripped = collapsed
    .replace(/ governorate$/, "")
    .replace(/ محافظة$/, "")
    .replace(/^محافظة /, "");
  return normalizeArabic(stripped);
}

const GOVERNORATE_BY_KEY = new Map<string, string>(
  GOVERNORATES.flatMap((governorate) => [
    [governorateMatchKey(governorate.en), governorate.en],
    [governorateMatchKey(governorate.ar), governorate.en],
  ]),
);

/**
 * Maps a stored or typed governorate value to its canonical English
 * name, or null when it cannot be mapped without guessing. Accepts:
 * trim/case/whitespace variants, a trailing "Governorate" suffix or a
 * leading "محافظة" prefix ("Cairo Governorate" -> "Cairo",
 * "محافظة القاهرة" -> "Cairo"), and Arabic names with the orthographic
 * variants above ("الاسكندريه" -> "Alexandria").
 */
export function normalizeGovernorate(value: string): string | null {
  if (!value.trim()) return null;
  return GOVERNORATE_BY_KEY.get(governorateMatchKey(value)) ?? null;
}

/**
 * Partitions stored governorate values into canonical ones (deduped,
 * in first-seen order) and unmappable ones (original spellings, in
 * first-seen order). Unmappable values are reported, never dropped
 * or guessed.
 */
export function partitionGovernorates(values: readonly string[]): {
  canonical: string[];
  unmappable: string[];
} {
  const canonical: string[] = [];
  const unmappable: string[] = [];
  const seenCanonical = new Set<string>();
  const seenUnmappable = new Set<string>();

  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const mapped = normalizeGovernorate(value);
    if (mapped) {
      if (seenCanonical.has(mapped)) continue;
      seenCanonical.add(mapped);
      canonical.push(mapped);
    } else {
      if (seenUnmappable.has(value)) continue;
      seenUnmappable.add(value);
      unmappable.push(value);
    }
  }

  return { canonical, unmappable };
}

/**
 * Display name for a stored (canonical English) governorate value in the
 * requested locale. Arabic uses the known Arabic name; anything unmapped
 * renders as stored, never guessed.
 */
export function governorateDisplayName(
  en: string | null,
  locale: "en" | "ar",
): string | null {
  if (!en) return null;
  if (locale !== "ar") return en;
  return GOVERNORATES.find((governorate) => governorate.en === en)?.ar ?? en;
}
