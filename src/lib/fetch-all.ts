/** PostgREST caps every response at `max_rows` (1,000 in supabase/config.toml). */
export const POSTGREST_MAX_ROWS = 1_000;

type PageResult<T> = {
  data: T[] | null;
  error: unknown;
};

export type FetchAllResult<T> = {
  rows: T[];
  /** A page failed to load; `rows` holds what was read before the failure. */
  failed: boolean;
  /** The safety cap was reached before the table was exhausted. */
  truncated: boolean;
};

/**
 * Reads every row of a query in `pageSize` chunks so a single capped response
 * can never be mistaken for the whole table. `fetchPage` must apply a total,
 * stable ordering (end with a unique column) or rows can repeat or be skipped
 * between pages.
 *
 * Totals computed from a `failed` or `truncated` result are incomplete and the
 * caller must say so instead of showing them as exact.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = POSTGREST_MAX_ROWS, maxRows = 20_000 } = {},
): Promise<FetchAllResult<T>> {
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);

    if (error) return { rows, failed: true, truncated: false };

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) {
      return { rows, failed: false, truncated: false };
    }
  }

  return { rows, failed: false, truncated: true };
}
