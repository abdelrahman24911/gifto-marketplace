import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

type CatalogProduct = {
  demoId: string;
  slug: string;
  name: string;
  description: string;
  priceEgp: number;
  stock: number;
  status: string;
  isDemo: boolean;
  collection: string;
  categorySlug: string;
  vendorSlug: string;
  image: {
    path: string;
    alt: string;
    source: string;
    license: string;
  };
  source: {
    type: string;
    license?: string;
    imageUsage?: string;
  };
};

type CatalogDataset = {
  datasetId: string;
  version: number;
  currency: string;
  priceNote: string;
  products: CatalogProduct[];
};

type CatalogManifest = {
  productCount: number;
  actualDistribution: Record<string, number>;
  vendorDistribution: Record<string, number>;
  imageSummary: {
    count: number;
    thirdPartyAssets: number;
  };
  candidateSource: {
    candidateCount: number;
  };
};

type OccasionProposal = {
  status: string;
  occasions: {
    slug: string;
    picks: { demoId: string; slug: string; reason: string }[];
  }[];
};

const DATA_DIR = path.join(process.cwd(), "data/demo-catalog");
const IMAGE_DIR = path.join(DATA_DIR, "images");

const dataset = JSON.parse(
  readFileSync(path.join(DATA_DIR, "products.json"), "utf8"),
) as CatalogDataset;
const manifest = JSON.parse(
  readFileSync(path.join(DATA_DIR, "manifest.json"), "utf8"),
) as CatalogManifest;
const proposal = JSON.parse(
  readFileSync(path.join(DATA_DIR, "occasions.proposed.json"), "utf8"),
) as OccasionProposal;

const EXPECTED_COLLECTIONS: Record<string, number> = {
  Flowers: 8,
  "Chocolates & Sweets": 10,
  "Personalized Gifts": 8,
  "Gift Boxes": 8,
  "Perfumes & Accessories": 6,
  "Toys & Cute Gifts": 6,
  "Home & Lifestyle": 6,
};

const EXPECTED_VENDORS: Record<string, number> = {
  "nile-blossoms": 14,
  "cairo-cocoa": 14,
  "legacy-engraving": 18,
  "alex-toy-corner": 6,
};

const EXPECTED_CATEGORY: Record<string, string> = {
  Flowers: "flowers",
  "Chocolates & Sweets": "chocolates-sweets",
  "Personalized Gifts": "personalized-gifts",
  "Gift Boxes": "gift-boxes",
  "Perfumes & Accessories": "personalized-gifts",
  "Toys & Cute Gifts": "toys-kids",
  "Home & Lifestyle": "gift-boxes",
};

function countBy(products: CatalogProduct[], key: "collection" | "vendorSlug") {
  return products.reduce<Record<string, number>>((counts, product) => {
    counts[product[key]] = (counts[product[key]] ?? 0) + 1;
    return counts;
  }, {});
}

function jpegSize(buffer: Buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let marker = buffer[offset + 1];
    while (marker === 0xff) {
      offset += 1;
      marker = buffer[offset + 1];
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (marker === 0xda) return null;
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

describe("demo catalogue dataset", () => {
  it("contains 52 unique, active demo products with stable prefixed slugs", () => {
    expect(dataset.datasetId).toBe("gifto-demo-catalog");
    expect(dataset.version).toBe(1);
    expect(dataset.currency).toBe("EGP");
    expect(dataset.priceNote).toMatch(/^Illustrative demo prices/);
    expect(dataset.products).toHaveLength(52);
    expect(new Set(dataset.products.map((product) => product.demoId)).size).toBe(52);
    expect(new Set(dataset.products.map((product) => product.slug)).size).toBe(52);

    for (const product of dataset.products) {
      expect(product.demoId).toMatch(/^gdc-\d{3}$/);
      expect(product.slug.startsWith("demo-catalog-")).toBe(true);
      expect(product.name.length).toBeGreaterThanOrEqual(2);
      expect(product.description.length).toBeGreaterThanOrEqual(40);
      expect(Number.isInteger(product.priceEgp)).toBe(true);
      expect(product.priceEgp).toBeGreaterThan(0);
      expect(Number.isInteger(product.stock)).toBe(true);
      expect(product.stock).toBeGreaterThanOrEqual(0);
      expect(product.status).toBe("active");
      expect(product.isDemo).toBe(true);
    }

    expect(countBy(dataset.products, "collection")).toEqual(EXPECTED_COLLECTIONS);
    expect(countBy(dataset.products, "vendorSlug")).toEqual(EXPECTED_VENDORS);
  });

  it("maps every collection onto an existing category without inventing taxonomy", () => {
    for (const product of dataset.products) {
      expect(product.categorySlug).toBe(EXPECTED_CATEGORY[product.collection]);
      expect([
        "flowers",
        "chocolates-sweets",
        "personalized-gifts",
        "gift-boxes",
        "toys-kids",
      ]).toContain(product.categorySlug);
    }
    expect(EXPECTED_CATEGORY["Perfumes & Accessories"]).toBe("personalized-gifts");
    expect(EXPECTED_CATEGORY["Home & Lifestyle"]).toBe("gift-boxes");
  });

  it("uses only local original artwork and has a square JPEG for every product", () => {
    const files = readdirSync(IMAGE_DIR).filter((file) => file.endsWith(".jpg"));
    expect(files).toHaveLength(52);

    for (const product of dataset.products) {
      expect(product.image.path).toBe(`images/${product.demoId}.jpg`);
      expect(product.image.path).not.toMatch(/^https?:/);
      expect(product.image.alt).toMatch(/^Stylised studio illustration of /);
      expect(product.image.source).toMatch(/^Gifto original generated artwork/);
      expect(product.image.license).toMatch(/no third-party image assets/i);

      const imagePath = path.join(DATA_DIR, product.image.path);
      expect(statSync(imagePath).size).toBeGreaterThan(10_000);
      const dimensions = jpegSize(readFileSync(imagePath));
      expect(dimensions).toEqual({ width: 1024, height: 1024 });
    }

    expect(manifest.productCount).toBe(52);
    expect(manifest.actualDistribution).toEqual(EXPECTED_COLLECTIONS);
    expect(manifest.vendorDistribution).toEqual(EXPECTED_VENDORS);
    expect(manifest.imageSummary).toEqual(
      expect.objectContaining({ count: 52, thirdPartyAssets: 0 }),
    );
  });

  it("records DummyJSON metadata without using its images", () => {
    const candidates = dataset.products.filter(
      (product) => product.source.type === "dummyjson-candidate",
    );
    expect(candidates).toHaveLength(9);
    expect(manifest.candidateSource.candidateCount).toBe(9);
    for (const product of candidates) {
      expect(product.source.license).toMatch(/MIT/);
      expect(product.source.imageUsage).toMatch(/no DummyJSON image/i);
      expect(product.image.source).toMatch(/^Gifto original generated artwork/);
    }
  });

  it("keeps the occasion proposal unapplied and references only catalogue products", () => {
    expect(proposal.status).toBe("proposed-not-applied");
    expect(proposal.occasions.map((occasion) => occasion.slug)).toEqual([
      "graduation",
      "ramdan-night",
    ]);

    const productIds = new Set(dataset.products.map((product) => product.demoId));
    const slugs = new Set(dataset.products.map((product) => product.slug));

    for (const occasion of proposal.occasions) {
      expect(occasion.picks).toHaveLength(12);
      expect(new Set(occasion.picks.map((pick) => pick.demoId)).size).toBe(12);
      for (const pick of occasion.picks) {
        expect(productIds.has(pick.demoId)).toBe(true);
        expect(slugs.has(pick.slug)).toBe(true);
        expect(pick.reason.length).toBeGreaterThanOrEqual(20);
      }
    }
  });
});
