export const BUSINESS_TIME_ZONE = "Africa/Cairo";

export type BusinessDateParts = {
  year: number;
  month: number;
  day: number;
};

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function readParts(date: Date) {
  const parts = partsFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function shiftDateParts(
  parts: BusinessDateParts,
  days: number,
): BusinessDateParts {
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function startOfBusinessDate(parts: BusinessDateParts): Date {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day);
  let guess = target;

  for (let guard = 0; guard < 6; guard += 1) {
    const local = readParts(new Date(guess));
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    const difference = target - localAsUtc;
    if (difference === 0) break;
    guess += difference;
  }

  return new Date(guess);
}

export function businessDateParts(date: Date): BusinessDateParts {
  const parts = readParts(date);
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function businessDateKey(date: Date): string {
  const parts = businessDateParts(date);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function startOfBusinessDay(date: Date): Date {
  return startOfBusinessDate(businessDateParts(date));
}

export function startOfBusinessDayOffset(date: Date, daysAgo: number): Date {
  return startOfBusinessDate(shiftDateParts(businessDateParts(date), -daysAgo));
}

export function startOfBusinessMonth(date: Date): Date {
  const parts = businessDateParts(date);
  return startOfBusinessDate({ ...parts, day: 1 });
}

export function businessDayWindow(now: Date) {
  const start = startOfBusinessDay(now);
  const parts = businessDateParts(start);
  const end = startOfBusinessDate(shiftDateParts(parts, 1));

  return { start, end, dateKey: businessDateKey(now) };
}

export function businessDateFromKey(key: string): BusinessDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}
