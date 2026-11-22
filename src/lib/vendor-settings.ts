import { normalizeGovernorate } from "@/lib/governorates";

import type { Json } from "@/lib/supabase/database.types";

/**
 * Vendor store-profile helpers. Only fields that already exist on
 * `public.vendors` are handled here; anything else belongs in a migration.
 */

export const VENDOR_NAME_MAX = 80;
export const VENDOR_NAME_MIN = 2;
export const VENDOR_DESCRIPTION_MAX = 600;
export const VENDOR_CONTACT_PHONE_MAX = 30;
export const VENDOR_CONTACT_EMAIL_MAX = 160;
export const VENDOR_LOCATION_MAX = 80;
export const VENDOR_COVERAGE_MAX_ITEMS = 30;
export const VENDOR_COVERAGE_ITEM_MAX = 80;
export const VENDOR_ADDRESS_MIN = 5;
export const VENDOR_ADDRESS_MAX = 300;
export const VENDOR_PREP_TIME_MAX_DAYS = 60;

export const WORKING_DAYS = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

export type WorkingDay = (typeof WORKING_DAYS)[number];

export const WORKING_DAY_LABELS: Record<WorkingDay, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

/** Arabic day names for the storefront's Arabic slice (P1-10, H-15). */
export const WORKING_DAY_LABELS_AR: Record<WorkingDay, string> = {
  sun: "الأحد",
  mon: "الاثنين",
  tue: "الثلاثاء",
  wed: "الأربعاء",
  thu: "الخميس",
  fri: "الجمعة",
  sat: "السبت",
};

export type WorkingHours = Partial<
  Record<WorkingDay, { open: string; close: string }>
>;

export type DeliveryCoverage = {
  governorates: string[];
  areas: string[];
};

export const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const WORKING_TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function isWorkingDay(value: string): value is WorkingDay {
  return WORKING_DAYS.includes(value as WorkingDay);
}

export function isWorkingTime(value: string): boolean {
  return WORKING_TIME_PATTERN.test(value);
}

/**
 * Reads the database's documented working-hours shape:
 * `{"mon":{"open":"09:00","close":"18:00"}}`.
 *
 * Malformed entries are ignored rather than throwing inside a server
 * component; the database constraint remains the final gate on writes.
 */
export function workingHoursFromJson(
  value: Json | null | undefined,
): WorkingHours {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, Json | undefined>;
  const hours: WorkingHours = {};

  for (const day of WORKING_DAYS) {
    const slot = record[day];
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) continue;

    const open = slot.open;
    const close = slot.close;
    if (typeof open !== "string" || typeof close !== "string") continue;
    if (!isWorkingTime(open) || !isWorkingTime(close) || close <= open) continue;

    hours[day] = { open, close };
  }

  return hours;
}

export function workingHoursToJson(hours: WorkingHours): Json {
  const value: Record<string, { open: string; close: string }> = {};

  for (const day of WORKING_DAYS) {
    const slot = hours[day];
    if (!slot) continue;
    if (!isWorkingTime(slot.open) || !isWorkingTime(slot.close)) continue;
    if (slot.close <= slot.open) continue;
    value[day] = { open: slot.open, close: slot.close };
  }

  return value;
}

export function validateWorkingHours(hours: WorkingHours): string | null {
  for (const day of WORKING_DAYS) {
    const slot = hours[day];
    if (!slot) continue;

    if (!slot.open || !slot.close) {
      return `Enter both opening and closing times for ${WORKING_DAY_LABELS[day]}, or leave both blank.`;
    }
    if (!isWorkingTime(slot.open) || !isWorkingTime(slot.close)) {
      return `Use 24-hour times such as 09:00 for ${WORKING_DAY_LABELS[day]}.`;
    }
    if (slot.close <= slot.open) {
      return `Closing time for ${WORKING_DAY_LABELS[day]} must be after opening time.`;
    }
  }

  return null;
}

export function formatWorkingHours(
  hours: WorkingHours,
  locale: "en" | "ar" = "en",
): Array<{ day: WorkingDay; label: string; value: string }> {
  const labels =
    locale === "ar" ? WORKING_DAY_LABELS_AR : WORKING_DAY_LABELS;
  return WORKING_DAYS.flatMap((day) => {
    const slot = hours[day];
    if (!slot) return [];
    return [
      {
        day,
        label: labels[day],
        value: `${slot.open}–${slot.close}`,
      },
    ];
  });
}

export function formatPrepTime(
  minDays: number | null,
  maxDays: number | null,
  locale: "en" | "ar" = "en",
): string | null {
  if (minDays === null && maxDays === null) return null;

  if (minDays !== null && maxDays !== null) {
    if (minDays === maxDays) {
      return minDays === 0
        ? locale === "ar"
          ? "نفس اليوم"
          : "Same day"
        : formatDays(minDays, locale);
    }
    if (minDays === 0)
      return locale === "ar"
        ? `حتى ${formatDays(maxDays, locale)}`
        : `Up to ${formatDays(maxDays, locale)}`;
    return `${formatCount(minDays, locale)}–${formatDays(maxDays, locale)}`;
  }

  const value = minDays ?? maxDays;
  return value === 0
    ? locale === "ar"
      ? "نفس اليوم"
      : "Same day"
    : formatDays(value ?? 0, locale);
}

/** Arabic-Indic digits for Arabic phrases, Western digits otherwise. */
function formatCount(n: number, locale: "en" | "ar"): string {
  return locale === "ar"
    ? new Intl.NumberFormat("ar-EG").format(n)
    : String(n);
}

function formatDays(days: number, locale: "en" | "ar" = "en"): string {
  if (locale === "ar") {
    if (days === 1) return "يوم واحد";
    return `${formatCount(days, locale)} أيام`;
  }
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function parsePrepTimeDays(input: string): {
  value: number | null;
  error: string | null;
} {
  const trimmed = input.trim();
  if (!trimmed) return { value: null, error: null };
  if (!/^\d+$/.test(trimmed)) {
    return { value: null, error: "Enter a whole number of days, or leave blank." };
  }

  const value = Number(trimmed);
  if (value < 0 || value > VENDOR_PREP_TIME_MAX_DAYS) {
    return {
      value: null,
      error: `Preparation time must be between 0 and ${VENDOR_PREP_TIME_MAX_DAYS} days.`,
    };
  }

  return { value, error: null };
}

function toStringList(value: Json | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * `delivery_coverage` is free-form jsonb. Malformed or legacy shapes degrade to
 * an empty coverage rather than throwing inside a server component.
 */
export function coverageFromJson(
  value: Json | null | undefined,
): DeliveryCoverage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { governorates: [], areas: [] };
  }

  const record = value as Record<string, Json | undefined>;
  return {
    governorates: toStringList(record.governorates),
    areas: toStringList(record.areas),
  };
}

export function coverageToJson(coverage: DeliveryCoverage): Json {
  return {
    governorates: coverage.governorates,
    areas: coverage.areas,
  };
}

export function formatCoverageList(values: string[]): string {
  return values.join(", ");
}

function normalizeCoverageValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Mirrors the database trigger that guards checkout. Empty lists mean the shop
 * has not configured coverage, so the address is allowed for backwards
 * compatibility. Governorates must match exactly; areas may match the city or
 * appear in the street address.
 *
 * P1-06: governorate comparison uses the same normalisation as
 * delivery_coverage_allows() (migration 37) — trim, case, a trailing
 * "Governorate" suffix or a leading "محافظة" prefix, Arabic
 * orthography — with the plain trimmed comparison as fallback for
 * values the normaliser cannot map. Areas use String.includes, which
 * is already literal; the DB escapes LIKE wildcards.
 */
export function deliveryCoverageAllows(
  coverage: DeliveryCoverage,
  address: { city: string; governorate: string; addressLine: string },
): boolean {
  const governorates = coverage.governorates
    .map(normalizeCoverageValue)
    .filter(Boolean);
  const areas = coverage.areas.map(normalizeCoverageValue).filter(Boolean);

  if (governorates.length === 0 && areas.length === 0) return true;

  const city = normalizeCoverageValue(address.city);
  const governorate = normalizeCoverageValue(address.governorate);
  // Canonical form of the order's governorate, or null when it cannot
  // be mapped — compared against each stored value's canonical form,
  // exactly like normalize_governorate_name() in the database.
  const governorateCanonical = normalizeGovernorate(address.governorate);
  const addressLine = normalizeCoverageValue(address.addressLine);

  if (
    governorates.length > 0 &&
    !governorates.includes(governorate) &&
    !(
      governorateCanonical !== null &&
      governorates.some(
        (stored) => normalizeGovernorate(stored) === governorateCanonical,
      )
    )
  ) {
    return false;
  }

  if (areas.length > 0 && !areas.includes(city)) {
    if (!areas.some((area) => addressLine.includes(area))) return false;
  }

  return true;
}

/**
 * Parses a comma/newline separated coverage list. Duplicates are collapsed
 * case-insensitively so the same governorate cannot be stored twice.
 */
export function parseCoverageList(input: string): {
  values: string[];
  error: string | null;
} {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const raw of input.split(/[,\n]/)) {
    const value = raw.trim();
    if (!value) continue;
    if (value.length > VENDOR_COVERAGE_ITEM_MAX) {
      return {
        values: [],
        error: `Keep each delivery entry to ${VENDOR_COVERAGE_ITEM_MAX} characters or fewer.`,
      };
    }
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }

  if (values.length > VENDOR_COVERAGE_MAX_ITEMS) {
    return {
      values: [],
      error: `List at most ${VENDOR_COVERAGE_MAX_ITEMS} delivery entries.`,
    };
  }

  return { values, error: null };
}
