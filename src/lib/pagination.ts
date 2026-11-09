export const DEFAULT_PAGE_SIZE = 25;

export type PageWindow = {
  page: number;
  pageSize: number;
  /** Inclusive row indexes for PostgREST `.range(from, to)`. */
  from: number;
  to: number;
};

/** Parses a `?page=` value into a positive integer; anything invalid is page 1. */
export function parsePage(value: string | string[] | undefined | null): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{1,6}$/.test(raw)) return 1;
  const page = Number(raw);
  return page >= 1 ? page : 1;
}

export function pageWindow(
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PageWindow {
  const safePage = Math.max(1, Math.floor(page));
  const from = (safePage - 1) * pageSize;
  return { page: safePage, pageSize, from, to: from + pageSize - 1 };
}

export function totalPages(
  total: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/** Last valid page for a total, used to clamp out-of-range requests. */
export function clampPage(
  page: number,
  total: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): number {
  return Math.min(Math.max(1, page), totalPages(total, pageSize));
}
