/**
 * Gift options and delivery-date preference (UX Batch 1).
 *
 * The database is authoritative: migration 47's `_validate_gift_options`
 * enforces the same limits inside the checkout wrappers, so a tampered
 * client cannot store an over-long message or an out-of-window date. This
 * module mirrors those rules for friendly client-side errors and for the
 * date input's min/max attributes — it never decides what an order costs
 * (gift wrap is free; see migration 47).
 *
 * The order-level gift choice is also kept in localStorage (same pattern
 * as the cart) so the cart page's "Make it a gift" section and the
 * checkout form share one draft without a round-trip.
 */

export const GIFT_MESSAGE_MAX_LENGTH = 500;
export const DELIVERY_TIME_NOTE_MAX_LENGTH = 200;

/** Earliest preferred delivery day, in days from today. */
export const PREFERRED_DELIVERY_MIN_LEAD_DAYS = 1;
/** Latest preferred delivery day, in days from today. */
export const PREFERRED_DELIVERY_MAX_LEAD_DAYS = 14;

export const GIFT_OPTIONS_STORAGE_KEY = "gifto.gift-options.v1";

export type GiftOptions = {
  giftWrap: boolean;
  giftMessage: string;
  /** Preferred delivery day (YYYY-MM-DD) or "" when unset. */
  preferredDeliveryDate: string;
  /** Preferred delivery time note or "" when unset. */
  deliveryTimeNote: string;
};

export type GiftOptionsInput = {
  giftWrap: boolean;
  giftMessage: string;
  preferredDeliveryDate: string;
  deliveryTimeNote: string;
};

export const EMPTY_GIFT_OPTIONS: GiftOptions = {
  giftWrap: false,
  giftMessage: "",
  preferredDeliveryDate: "",
  deliveryTimeNote: "",
};

/** `YYYY-MM-DD` in the browser's local timezone (never UTC-shifted). */
export function toISODateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * The allowed preferred-delivery window for a date input: tomorrow
 * through 14 days from today. A preference, not a booked slot — there is
 * no courier slot system (see migration 47).
 */
export function preferredDeliveryDateRange(today: Date = new Date()): {
  min: string;
  max: string;
} {
  return {
    min: toISODateLocal(addDays(today, PREFERRED_DELIVERY_MIN_LEAD_DAYS)),
    max: toISODateLocal(addDays(today, PREFERRED_DELIVERY_MAX_LEAD_DAYS)),
  };
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Strict `YYYY-MM-DD` check against the window. Anything malformed,
 * impossible (e.g. 2026-02-30), or outside tomorrow..+14 days is invalid.
 * An empty value is valid — the preference is optional.
 */
export function isValidPreferredDeliveryDate(
  value: string,
  today: Date = new Date(),
): boolean {
  if (value === "") return true;
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return false;
  }
  const { min, max } = preferredDeliveryDateRange(today);
  return value >= min && value <= max;
}

/**
 * Client-side mirror of the database validation. Returns a friendly error
 * message, or null when the input is acceptable. The server re-checks
 * everything; this only avoids a wasted round-trip.
 */
export function validateGiftOptions(
  input: GiftOptionsInput,
  today: Date = new Date(),
): string | null {
  if (input.giftMessage.trim().length > GIFT_MESSAGE_MAX_LENGTH) {
    return "Gift message must be 500 characters or fewer.";
  }
  if (input.deliveryTimeNote.trim().length > DELIVERY_TIME_NOTE_MAX_LENGTH) {
    return "Delivery time note must be 200 characters or fewer.";
  }
  if (!isValidPreferredDeliveryDate(input.preferredDeliveryDate, today)) {
    return "Choose a delivery date between tomorrow and 14 days from today.";
  }
  return null;
}

/**
 * Reads the stored draft, sanitising field by field (R-08). A stale or
 * malformed field is dropped on its own — a preferred date that has
 * since left the tomorrow..+14-day window, or a draft written before
 * the date/time-note fields existed, must not wipe the wrap and
 * message the customer already chose.
 */
export function readGiftOptions(): GiftOptions {
  if (typeof window === "undefined") return { ...EMPTY_GIFT_OPTIONS };
  try {
    const raw = window.localStorage.getItem(GIFT_OPTIONS_STORAGE_KEY);
    if (!raw) return { ...EMPTY_GIFT_OPTIONS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ...EMPTY_GIFT_OPTIONS };
    }
    const record = parsed as Record<string, unknown>;
    const giftMessage =
      typeof record.giftMessage === "string" ? record.giftMessage : "";
    const deliveryTimeNote =
      typeof record.deliveryTimeNote === "string" ? record.deliveryTimeNote : "";
    const preferredDeliveryDate =
      typeof record.preferredDeliveryDate === "string"
        ? record.preferredDeliveryDate
        : "";
    return {
      giftWrap: record.giftWrap === true,
      giftMessage:
        giftMessage.length <= GIFT_MESSAGE_MAX_LENGTH ? giftMessage : "",
      preferredDeliveryDate: isValidPreferredDeliveryDate(preferredDeliveryDate)
        ? preferredDeliveryDate
        : "",
      deliveryTimeNote:
        deliveryTimeNote.length <= DELIVERY_TIME_NOTE_MAX_LENGTH
          ? deliveryTimeNote
          : "",
    };
  } catch {
    return { ...EMPTY_GIFT_OPTIONS };
  }
}

export function writeGiftOptions(options: GiftOptions): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      GIFT_OPTIONS_STORAGE_KEY,
      JSON.stringify({
        giftWrap: options.giftWrap,
        giftMessage: options.giftMessage.slice(0, GIFT_MESSAGE_MAX_LENGTH),
        preferredDeliveryDate: options.preferredDeliveryDate,
        deliveryTimeNote: options.deliveryTimeNote.slice(
          0,
          DELIVERY_TIME_NOTE_MAX_LENGTH,
        ),
      }),
    );
  } catch {
    // Storage can be unavailable (private mode, quota). The gift choice
    // then simply does not persist across reloads.
  }
}
