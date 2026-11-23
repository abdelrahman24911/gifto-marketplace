import type { CatalogProduct } from "@/lib/catalog";

/**
 * Gift Finder v1 is a deterministic filter over real catalogue rows. It is not
 * an AI recommendation engine and it never invents products, ratings, or
 * popularity signals.
 *
 * Recipient and occasion are not columns in the database today, so the
 * mappings below are an explicit merchandising decision. They are isolated
 * here so they can be reviewed, unit-tested, and later replaced by
 * admin-managed occasion rules without touching the UI.
 */

export const GIFT_FINDER_RECIPIENTS = [
  { id: "any", label: "Anyone" },
  { id: "her", label: "For her" },
  { id: "him", label: "For him" },
  { id: "kids", label: "For kids" },
  { id: "home", label: "For home" },
  { id: "couples", label: "For couples" },
] as const;

export type GiftFinderRecipientId =
  (typeof GIFT_FINDER_RECIPIENTS)[number]["id"];

/**
 * Budgets are half-open ranges: the lower bound is inclusive and the upper
 * bound is exclusive. That keeps every price in exactly one band and avoids a
 * gift appearing in two adjacent ranges at a boundary.
 */
export const GIFT_FINDER_BUDGET_BANDS = [
  {
    id: "under-250",
    label: "Under EGP 250",
    minMinor: 0,
    maxMinor: 25_000,
  },
  {
    id: "250-500",
    label: "EGP 250 – 500",
    minMinor: 25_000,
    maxMinor: 50_000,
  },
  {
    id: "500-750",
    label: "EGP 500 – 750",
    minMinor: 50_000,
    maxMinor: 75_000,
  },
  {
    id: "750-1000",
    label: "EGP 750 – 1,000",
    minMinor: 75_000,
    maxMinor: 100_000,
  },
  {
    id: "1000-1500",
    label: "EGP 1,000 – 1,500",
    minMinor: 100_000,
    maxMinor: 150_000,
  },
  {
    id: "1500-plus",
    label: "EGP 1,500+",
    minMinor: 150_000,
    maxMinor: null,
  },
] as const;

export type GiftFinderBudgetId =
  | "any"
  | (typeof GIFT_FINDER_BUDGET_BANDS)[number]["id"];

export const GIFT_FINDER_BUDGET_OPTIONS: ReadonlyArray<{
  id: GiftFinderBudgetId;
  label: string;
  minMinor: number | null;
  maxMinor: number | null;
}> = [
  { id: "any", label: "Any budget", minMinor: null, maxMinor: null },
  ...GIFT_FINDER_BUDGET_BANDS,
];

export const RECIPIENT_CATEGORY_SLUGS: Readonly<
  Record<Exclude<GiftFinderRecipientId, "any">, readonly string[]>
> = {
  her: ["flowers", "chocolates-sweets", "personalized-gifts", "gift-boxes"],
  him: ["corporate-gifts", "personalized-gifts", "chocolates-sweets", "gift-boxes"],
  kids: ["toys-kids", "personalized-gifts", "cakes-baked-goods"],
  home: ["cakes-baked-goods", "gift-boxes", "flowers"],
  couples: ["flowers", "chocolates-sweets", "personalized-gifts", "gift-boxes"],
};

/**
 * Live occasion slugs. "ramadan-night" is the current value in hosted data
 * (migration 68 renamed it from "ramdan-night"); the old spelling stays as
 * an alias so the Finder keeps working for old links and cached data.
 */
export const OCCASION_CATEGORY_SLUGS: Readonly<
  Record<string, readonly string[]>
> = {
  graduation: ["personalized-gifts", "gift-boxes", "flowers"],
  "ramadan-night": ["gift-boxes", "chocolates-sweets", "cakes-baked-goods"],
  "ramdan-night": ["gift-boxes", "chocolates-sweets", "cakes-baked-goods"],
};

export type GiftFinderProduct = {
  id: string;
  name: string;
  slug: string;
  priceMinor: number;
  stock: number;
  imagePath: string | null;
  imageAlt: string | null;
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  vendorIsAcceptingOrders: boolean;
  categoryName: string | null;
  categorySlug: string | null;
};

export type GiftFinderSelection = {
  recipient: GiftFinderRecipientId;
  occasionSlug: string | null;
  budget: GiftFinderBudgetId;
};

export type GiftFinderPage = {
  products: GiftFinderProduct[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  occasionUnsupported: boolean;
};

export type GiftFinderQuery = GiftFinderSelection & {
  offset: number;
  limit: number;
};

export type GiftFinderQueryParse =
  | { ok: true; query: GiftFinderQuery }
  | { ok: false };

export const GIFT_FINDER_PAGE_SIZE = 8;
export const GIFT_FINDER_MAX_PAGE_SIZE = 24;
const MAX_OCCASION_SLUG_LENGTH = 80;
const MAX_QUERY_OFFSET = 10_000;

const RECIPIENT_IDS = new Set<string>(
  GIFT_FINDER_RECIPIENTS.map((option) => option.id),
);
const BUDGET_IDS = new Set<string>(
  GIFT_FINDER_BUDGET_OPTIONS.map((option) => option.id),
);

function parseInteger(value: string | null, fallback: number): number | null {
  if (value === null || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseGiftFinderSearchParams(
  params: URLSearchParams,
): GiftFinderQueryParse {
  const recipient = params.get("recipient")?.trim() || "any";
  const budget = params.get("budget")?.trim() || "any";
  const occasionSlug = params.get("occasion")?.trim() || null;

  if (!RECIPIENT_IDS.has(recipient) || !BUDGET_IDS.has(budget)) {
    return { ok: false };
  }

  if (
    occasionSlug !== null &&
    (occasionSlug.length > MAX_OCCASION_SLUG_LENGTH ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(occasionSlug))
  ) {
    return { ok: false };
  }

  const offset = parseInteger(params.get("offset"), 0);
  const requestedLimit = parseInteger(
    params.get("limit"),
    GIFT_FINDER_PAGE_SIZE,
  );

  if (
    offset === null ||
    offset < 0 ||
    offset > MAX_QUERY_OFFSET ||
    requestedLimit === null ||
    requestedLimit < 1
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    query: {
      recipient: recipient as GiftFinderRecipientId,
      occasionSlug,
      budget: budget as GiftFinderBudgetId,
      offset,
      limit: Math.min(requestedLimit, GIFT_FINDER_MAX_PAGE_SIZE),
    },
  };
}

export function planGiftFinderCategories(selection: GiftFinderSelection): {
  categorySlugs: string[] | null;
  occasionUnsupported: boolean;
} {
  const recipientCategories =
    selection.recipient === "any"
      ? null
      : RECIPIENT_CATEGORY_SLUGS[selection.recipient];
  const occasionCategories = selection.occasionSlug
    ? (OCCASION_CATEGORY_SLUGS[selection.occasionSlug] ?? null)
    : null;

  if (selection.occasionSlug && !occasionCategories) {
    return { categorySlugs: [], occasionUnsupported: true };
  }

  if (recipientCategories && occasionCategories) {
    const occasionSet = new Set(occasionCategories);
    return {
      categorySlugs: recipientCategories.filter((slug) =>
        occasionSet.has(slug),
      ),
      occasionUnsupported: false,
    };
  }

  if (recipientCategories) {
    return {
      categorySlugs: [...recipientCategories],
      occasionUnsupported: false,
    };
  }

  if (occasionCategories) {
    return {
      categorySlugs: [...occasionCategories],
      occasionUnsupported: false,
    };
  }

  return { categorySlugs: null, occasionUnsupported: false };
}

export function giftFinderBudgetRange(id: GiftFinderBudgetId): {
  minMinor: number | null;
  maxMinor: number | null;
} {
  if (id === "any") return { minMinor: null, maxMinor: null };

  const band = GIFT_FINDER_BUDGET_BANDS.find((item) => item.id === id);
  return band
    ? { minMinor: band.minMinor, maxMinor: band.maxMinor }
    : { minMinor: null, maxMinor: null };
}

export function emptyGiftFinderPage(
  query: Pick<GiftFinderQuery, "offset" | "limit">,
  occasionUnsupported = false,
): GiftFinderPage {
  return {
    products: [],
    total: 0,
    offset: query.offset,
    limit: query.limit,
    hasMore: false,
    occasionUnsupported,
  };
}

/**
 * Converts a catalogue row into the lean shape sent to the client. Rows
 * without a public vendor name cannot be added to the cart, so they are
 * omitted rather than rendered with a fake shop name.
 */
export function toGiftFinderProduct(
  product: CatalogProduct,
): GiftFinderProduct | null {
  if (!product.vendorName) return null;

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    priceMinor: product.priceMinor,
    stock: product.stock,
    imagePath: product.imagePath,
    imageAlt: product.imageAlt,
    vendorId: product.vendorId,
    vendorName: product.vendorName,
    vendorSlug: product.vendorSlug,
    vendorIsAcceptingOrders: product.vendorIsAcceptingOrders,
    categoryName: product.categoryName,
    categorySlug: product.categorySlug,
  };
}


