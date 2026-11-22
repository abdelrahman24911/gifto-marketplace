/**
 * Price-change consent helpers (P1-03, H-19).
 *
 * The cart prices the order from a cached catalogue; the database prices it
 * from live rows. These pure helpers validate the prices the customer saw
 * (sent with checkout) and build the old-vs-new diff the UI shows when the
 * database refuses the order with PRICE_CHANGED. No money decision lives
 * here — the database is the only authority; this module only shapes data
 * for the form and the diff display.
 */

export type ExpectedPrice = {
  product_id: string;
  unit_price_minor: number;
};

export type LivePriceRow = {
  id: string;
  name: string;
  price_minor: number;
};

export type PriceDiffLine = {
  productId: string;
  name: string;
  quantity: number;
  expectedMinor: number;
  liveMinor: number;
};

export type PriceDiff = {
  lines: PriceDiffLine[];
  expectedTotalMinor: number;
  liveTotalMinor: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_EXPECTED_PRICE_LINES = 50;

/**
 * Strictly validates the expected-prices payload from the checkout form.
 * Anything malformed (wrong shape, bad id, negative or non-integer price,
 * duplicate line, empty, or over the cart limit) returns null so the caller
 * can reject the attempt instead of trusting it.
 */
export function parseExpectedPrices(input: unknown): ExpectedPrice[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length === 0 || input.length > MAX_EXPECTED_PRICE_LINES) {
    return null;
  }

  const seen = new Set<string>();
  const prices: ExpectedPrice[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    const record = entry as Record<string, unknown>;
    const productId = record.product_id;
    const unitPrice = record.unit_price_minor;

    if (typeof productId !== "string" || !UUID_PATTERN.test(productId)) {
      return null;
    }
    if (
      typeof unitPrice !== "number" ||
      !Number.isSafeInteger(unitPrice) ||
      unitPrice < 0
    ) {
      return null;
    }
    if (seen.has(productId)) return null;
    seen.add(productId);

    prices.push({ product_id: productId, unit_price_minor: unitPrice });
  }

  return prices;
}

/**
 * Builds the old-vs-new diff from the expected prices and the live rows the
 * server just read. Returns null when the live data does not cover every
 * expected line (a product vanished between the check and the read), so the
 * caller can fall back to a generic error instead of showing a partial diff.
 */
export function buildPriceDiff(
  expected: ExpectedPrice[],
  quantities: Map<string, number>,
  live: LivePriceRow[],
): PriceDiff | null {
  const liveById = new Map(live.map((row) => [row.id, row]));
  const lines: PriceDiffLine[] = [];
  let expectedTotalMinor = 0;
  let liveTotalMinor = 0;

  for (const price of expected) {
    const row = liveById.get(price.product_id);
    const quantity = quantities.get(price.product_id);
    if (!row || quantity === undefined) return null;

    lines.push({
      productId: price.product_id,
      name: row.name,
      quantity,
      expectedMinor: price.unit_price_minor,
      liveMinor: row.price_minor,
    });
    expectedTotalMinor += price.unit_price_minor * quantity;
    liveTotalMinor += row.price_minor * quantity;
  }

  return { lines, expectedTotalMinor, liveTotalMinor };
}

export function hasPriceChange(diff: PriceDiff): boolean {
  return (
    diff.lines.some((line) => line.expectedMinor !== line.liveMinor) ||
    diff.expectedTotalMinor !== diff.liveTotalMinor
  );
}
