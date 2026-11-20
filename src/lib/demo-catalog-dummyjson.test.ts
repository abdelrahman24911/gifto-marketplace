import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

type CuratedProduct = {
  demoId: string;
  slug: string;
  name: string;
  description: string;
  priceEgp: number;
  stock: number;
  status: string;
  isDemo: boolean;
  curationGroup: string;
  categorySlug: string;
  vendorSlug: string;
  image: {
    path: string;
    alt: string;
    format: string;
    width: number;
    height: number;
    byteSize: number;
    sourceImageIndex: number;
    sourceUrl: string;
    license: string;
  };
  source: {
    type: string;
    provider: string;
    productId: number;
    title: string;
    category: string;
    brand: string | null;
    sourcePriceUsd: number;
    sourceUrl: string;
    thumbnailUrl: string;
    images: string[];
    selectedImageUrl: string;
    license: string;
    note: string;
  };
};

type CuratedDataset = {
  datasetId: string;
  version: number;
  currency: string;
  priceNote: string;
  demoDisclosure: string;
  categoryMapping: {
    status: string;
    note: string;
    groupMapping: Record<string, string>;
  };
  imagePolicy: string;
  products: CuratedProduct[];
};

type SourceProduct = {
  id: number;
  title: string;
  category: string;
  brand?: string;
  price: number;
  images: string[];
  thumbnail: string;
};

type SourceSnapshot = {
  products: SourceProduct[];
};

type CuratedManifest = {
  productCount: number;
  actualDistribution: Record<string, number>;
  vendorDistribution: Record<string, number>;
  categoryDistribution: Record<string, number>;
  source: {
    totalProducts: number;
    selectedProducts: number;
    excludedProducts: number;
  };
  imageSummary: {
    count: number;
    format: string;
    width: number;
    height: number;
    thirdPartyAssets: number;
    totalBytes: number;
  };
  reports: {
    contactSheet: string;
    exclusions: string;
    exclusionsJson: string;
  };
};

type Exclusions = {
  source: {
    totalProducts: number;
    selectedProducts: number;
    excludedProducts: number;
  };
  excluded: { id: number; title: string; reason: string }[];
};

type LegacyProduct = {
  demoId: string;
  slug: string;
};

type LegacyDataset = {
  products: LegacyProduct[];
};

const DATA_DIR = path.join(process.cwd(), "data/demo-catalog-dummyjson");
const IMAGE_DIR = path.join(DATA_DIR, "images");

const dataset = JSON.parse(
  readFileSync(path.join(DATA_DIR, "products.json"), "utf8"),
) as CuratedDataset;
const manifest = JSON.parse(
  readFileSync(path.join(DATA_DIR, "manifest.json"), "utf8"),
) as CuratedManifest;
const exclusions = JSON.parse(
  readFileSync(path.join(DATA_DIR, "exclusions.json"), "utf8"),
) as Exclusions;
const source = JSON.parse(
  readFileSync(path.join(DATA_DIR, "source/dummyjson-products.json"), "utf8"),
) as SourceSnapshot;
const legacy = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/demo-catalog/products.json"), "utf8"),
) as LegacyDataset;

const EXPECTED_GROUPS: Record<string, number> = {
  Fragrance: 5,
  "Skin care": 3,
  Beauty: 5,
  Bags: 5,
  Jewellery: 3,
  Watches: 6,
  Sunglasses: 4,
  "Home & living": 4,
  "Kitchen & dining": 6,
  "Gourmet gifts": 1,
  "Coffee gifts": 1,
  "Executive gifts": 3,
};

const EXPECTED_VENDORS: Record<string, number> = {
  "nile-blossoms": 23,
  "legacy-engraving": 21,
  "cairo-cocoa": 2,
};

const EXPECTED_CATEGORIES: Record<string, number> = {
  "personalized-gifts": 31,
  "gift-boxes": 11,
  "chocolates-sweets": 1,
  "corporate-gifts": 3,
};

const EXPECTED_CATEGORY_FOR_GROUP: Record<string, string> = {
  Fragrance: "personalized-gifts",
  "Skin care": "personalized-gifts",
  Beauty: "personalized-gifts",
  Bags: "personalized-gifts",
  Jewellery: "personalized-gifts",
  Watches: "personalized-gifts",
  Sunglasses: "personalized-gifts",
  "Home & living": "gift-boxes",
  "Kitchen & dining": "gift-boxes",
  "Gourmet gifts": "chocolates-sweets",
  "Coffee gifts": "gift-boxes",
  "Executive gifts": "corporate-gifts",
};

const EXPECTED_SOURCE_IDS = [
  6, 7, 8, 9, 10, 118, 119, 120, 1, 2, 3, 4, 5, 172, 173, 174, 175, 176, 182, 183, 184,
  93, 94, 95, 96, 193, 194, 154, 155, 156, 158, 44, 45, 46, 49, 53, 65, 67, 73, 75,
  27, 34, 47, 190, 97, 98,
];

function countBy(
  products: CuratedProduct[],
  key: "curationGroup" | "vendorSlug" | "categorySlug",
) {
  return products.reduce<Record<string, number>>((counts, product) => {
    counts[product[key]] = (counts[product[key]] ?? 0) + 1;
    return counts;
  }, {});
}

function webpSize(buffer: Buffer) {
  if (
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 ") {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

describe("DummyJSON demo catalogue", () => {
  it("contains 46 unique, active, categorised demo products with stable prefixed slugs", () => {
    expect(dataset.datasetId).toBe("gifto-demo-catalog-dummyjson");
    expect(dataset.version).toBe(2);
    expect(dataset.currency).toBe("EGP");
    expect(dataset.priceNote).toMatch(/^Illustrative demo prices/);
    expect(dataset.demoDisclosure).toMatch(/DummyJSON sample data/i);
    expect(dataset.categoryMapping.status).toBe("mapped-existing-categories");
    expect(dataset.categoryMapping.note).toMatch(/closest existing Gifto categories/i);
    expect(dataset.categoryMapping.groupMapping).toEqual(EXPECTED_CATEGORY_FOR_GROUP);
    expect(dataset.imagePolicy).toMatch(/Actual DummyJSON sample product images/);
    expect(dataset.products).toHaveLength(46);
    expect(new Set(dataset.products.map((product) => product.demoId)).size).toBe(46);
    expect(new Set(dataset.products.map((product) => product.slug)).size).toBe(46);
    expect(new Set(dataset.products.map((product) => product.source.productId)).size).toBe(46);
    expect([...dataset.products.map((product) => product.source.productId)].sort((a, b) => a - b)).toEqual(
      [...EXPECTED_SOURCE_IDS].sort((a, b) => a - b),
    );

    const legacySlugs = new Set(legacy.products.map((product) => product.slug));
    const legacyIds = new Set(legacy.products.map((product) => product.demoId));

    for (const product of dataset.products) {
      expect(product.demoId).toMatch(/^gdj-\d{3}$/);
      expect(product.slug.startsWith("demo-catalog-dj-")).toBe(true);
      expect(legacySlugs.has(product.slug)).toBe(false);
      expect(legacyIds.has(product.demoId)).toBe(false);
      expect(product.name.length).toBeGreaterThanOrEqual(2);
      expect(product.name.length).toBeLessThanOrEqual(120);
      expect(product.description.length).toBeGreaterThanOrEqual(40);
      expect(product.description).toMatch(/Demo listing based on DummyJSON sample data; price is illustrative/);
      expect(Number.isInteger(product.priceEgp)).toBe(true);
      expect(product.priceEgp).toBeGreaterThan(0);
      expect(Number.isInteger(product.stock)).toBe(true);
      expect(product.stock).toBeGreaterThanOrEqual(0);
      expect(product.status).toBe("active");
      expect(product.isDemo).toBe(true);
      expect(product.categorySlug).toBe(
        EXPECTED_CATEGORY_FOR_GROUP[product.curationGroup],
      );
      expect(product.vendorSlug in EXPECTED_VENDORS).toBe(true);
    }

    expect(countBy(dataset.products, "curationGroup")).toEqual(EXPECTED_GROUPS);
    expect(countBy(dataset.products, "vendorSlug")).toEqual(EXPECTED_VENDORS);
    expect(countBy(dataset.products, "categorySlug")).toEqual(EXPECTED_CATEGORIES);
  });

  it("stores actual local WebP images with traceable DummyJSON source URLs", () => {
    const files = readdirSync(IMAGE_DIR).filter((file) => file.endsWith(".webp"));
    expect(files).toHaveLength(46);
    expect(manifest.productCount).toBe(46);
    expect(manifest.actualDistribution).toEqual(EXPECTED_GROUPS);
    expect(manifest.vendorDistribution).toEqual(EXPECTED_VENDORS);
    expect(manifest.categoryDistribution).toEqual(EXPECTED_CATEGORIES);
    expect(manifest.source).toEqual(
      expect.objectContaining({ totalProducts: 194, selectedProducts: 46, excludedProducts: 148 }),
    );
    expect(manifest.imageSummary).toEqual(
      expect.objectContaining({
        count: 46,
        format: "WebP",
        width: 1000,
        height: 1000,
        thirdPartyAssets: 46,
      }),
    );

    let totalBytes = 0;
    for (const product of dataset.products) {
      expect(product.image.path).toBe(`images/${product.demoId}.webp`);
      expect(product.image.path).not.toMatch(/^https?:/);
      expect(product.image.alt.length).toBeGreaterThanOrEqual(12);
      expect(product.image.format).toBe("webp");
      expect(product.image.license).toMatch(/image-specific rights/i);

      const imagePath = path.join(DATA_DIR, product.image.path);
      const buffer = readFileSync(imagePath);
      totalBytes += statSync(imagePath).size;
      expect(statSync(imagePath).size).toBeGreaterThan(10_000);
      expect(statSync(imagePath).size).toBe(product.image.byteSize);
      expect(webpSize(buffer)).toEqual({ width: 1000, height: 1000 });
      expect(product.image.width).toBe(1000);
      expect(product.image.height).toBe(1000);
      expect(product.image.sourceUrl).toMatch(/^https:\/\/cdn\.dummyjson\.com\/product-images\//);
      expect(product.image.sourceUrl).toBe(product.source.selectedImageUrl);
      expect(product.source.images[product.image.sourceImageIndex - 1]).toBe(
        product.image.sourceUrl,
      );
    }
    expect(manifest.imageSummary.totalBytes).toBe(totalBytes);
    expect(
      dataset.products.find((product) => product.source.productId === 67)?.image.sourceImageIndex,
    ).toBe(2);
  });

  it("keeps source metadata accurate without importing stock, ratings or reviews", () => {
    expect(source.products).toHaveLength(194);
    const sourceById = new Map(source.products.map((product) => [product.id, product]));

    for (const product of dataset.products) {
      const raw = sourceById.get(product.source.productId);
      expect(raw).toBeDefined();
      expect(product.source.type).toBe("dummyjson");
      expect(product.source.provider).toBe("DummyJSON");
      expect(product.source.title).toBe(raw?.title);
      expect(product.source.category).toBe(raw?.category);
      expect(product.source.brand).toBe(raw?.brand ?? null);
      expect(product.source.sourcePriceUsd).toBe(raw?.price);
      expect(product.source.sourceUrl).toBe(
        `https://dummyjson.com/products/${product.source.productId}`,
      );
      expect(product.source.thumbnailUrl).toBe(raw?.thumbnail);
      expect(product.source.images).toEqual(raw?.images);
      expect(product.source.license).toMatch(/image-specific rights/i);
      expect(product.source.note).toMatch(/No vendor affiliation/i);
      expect(product.source.note).toMatch(/stock, ratings and reviews were not imported/i);
      expect(product).not.toHaveProperty("rating");
      expect(product).not.toHaveProperty("reviews");
      expect(product).not.toHaveProperty("availabilityStatus");
      expect(product.source).not.toHaveProperty("rating");
      expect(product.source).not.toHaveProperty("reviews");
      expect(product.source).not.toHaveProperty("stock");
    }
  });

  it("documents the full 194-product exclusion set and the final contact sheet", () => {
    expect(exclusions.source).toEqual(
      expect.objectContaining({ totalProducts: 194, selectedProducts: 46, excludedProducts: 148 }),
    );
    expect(exclusions.excluded).toHaveLength(148);
    expect(new Set(exclusions.excluded.map((product) => product.id)).size).toBe(148);
    const selectedIds = new Set(dataset.products.map((product) => product.source.productId));
    const excludedIds = new Set(exclusions.excluded.map((product) => product.id));
    expect([...selectedIds].filter((id) => excludedIds.has(id))).toEqual([]);
    expect(selectedIds.size + excludedIds.size).toBe(194);
    for (const item of exclusions.excluded) {
      expect(item.reason.length).toBeGreaterThanOrEqual(12);
      expect(item.title.length).toBeGreaterThan(1);
    }
    expect(exclusions.excluded.find((item) => item.id === 157)?.reason).toMatch(/Novelty party glasses/);
    expect(exclusions.excluded.find((item) => item.id === 191)?.reason).toMatch(/Duplicate Rolex/);

    const contactSheetPath = path.join(DATA_DIR, manifest.reports.contactSheet);
    const contactSheet = readFileSync(contactSheetPath);
    expect(contactSheet.length).toBeGreaterThan(100_000);
    expect([...contactSheet.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(manifest.reports.exclusions).toBe("exclusions.md");
    expect(manifest.reports.exclusionsJson).toBe("exclusions.json");
    expect(statSync(path.join(DATA_DIR, "exclusions.md")).size).toBeGreaterThan(10_000);
  });
});
