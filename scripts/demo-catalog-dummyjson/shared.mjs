import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  ROOT,
  assertConfirmation,
  assertTarget,
  credentialsPath,
  loadEnv,
  parseArgs,
  readCredentials,
} from "../demo-catalog/shared.mjs";

export { ROOT, assertConfirmation, assertTarget, credentialsPath, loadEnv, parseArgs, readCredentials };

export const DATA_DIR = path.join(ROOT, "data/demo-catalog-dummyjson");
export const IMAGE_DIR = path.join(DATA_DIR, "images");
export const SOURCE_FILE = path.join(DATA_DIR, "source/dummyjson-products.json");
export const DATASET_ID = "gifto-demo-catalog-dummyjson";
export const DATASET_VERSION = 2;
export const SLUG_PREFIX = "demo-catalog-dj-";
export const IMPORT_CONFIRM = "IMPORT gifto-demo-catalog-dummyjson@2";
export const ROLLBACK_CONFIRM = "ROLLBACK gifto-demo-catalog-dummyjson@2";
export const PRODUCT_IMAGES_BUCKET = "product-images";
export const HERO_OBJECT_NAME = "demo-catalog-dj-hero.webp";
export const HERO_CONTENT_TYPE = "image/webp";

export const VENDOR_SLUGS = ["nile-blossoms", "legacy-engraving", "cairo-cocoa"];

export const GROUP_COUNTS = {
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

export const VENDOR_COUNTS = {
  "nile-blossoms": 23,
  "legacy-engraving": 21,
  "cairo-cocoa": 2,
};

export const CATEGORY_COUNTS = {
  "personalized-gifts": 31,
  "gift-boxes": 11,
  "chocolates-sweets": 1,
  "corporate-gifts": 3,
};

export const EXPECTED_PRODUCT_COUNT = 46;
export const EXPECTED_SOURCE_COUNT = 194;
export const EXPECTED_EXCLUDED_COUNT = 148;

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function readDataset() {
  return readJson(path.join(DATA_DIR, "products.json"));
}

export async function readManifest() {
  return readJson(path.join(DATA_DIR, "manifest.json"));
}

export async function readExclusions() {
  return readJson(path.join(DATA_DIR, "exclusions.json"));
}

export async function readSourceSnapshot() {
  return readJson(SOURCE_FILE);
}

export function expectedImageObjectName() {
  return HERO_OBJECT_NAME;
}

export function imageObjectPath(vendorId, productId) {
  return `${vendorId}/${productId}/${expectedImageObjectName()}`;
}

export function webpDimensions(buffer) {
  if (
    buffer.length < 30 ||
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

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function validateLocalDataset() {
  const errors = [];
  let dataset;
  let manifest;
  let exclusions;
  let raw;

  try {
    dataset = await readDataset();
  } catch (error) {
    return {
      errors: [`Could not read products.json: ${error.message}`],
      dataset: null,
      manifest: null,
      exclusions: null,
      products: [],
      groupCounts: {},
      vendorCounts: {},
      categoryCounts: {},
    };
  }
  try {
    manifest = await readManifest();
  } catch (error) {
    errors.push(`Could not read manifest.json: ${error.message}`);
  }
  try {
    exclusions = await readExclusions();
  } catch (error) {
    errors.push(`Could not read exclusions.json: ${error.message}`);
  }
  try {
    raw = await readSourceSnapshot();
  } catch (error) {
    errors.push(`Could not read source snapshot: ${error.message}`);
  }

  if (dataset.datasetId !== DATASET_ID) errors.push(`datasetId must be ${DATASET_ID}.`);
  if (dataset.version !== DATASET_VERSION) errors.push(`version must be ${DATASET_VERSION}.`);
  if (dataset.currency !== "EGP") errors.push("currency must be EGP.");
  if (!/^Illustrative demo prices/.test(dataset.priceNote ?? "")) {
    errors.push("priceNote must state that prices are illustrative.");
  }
  if (!/DummyJSON sample data/i.test(dataset.demoDisclosure ?? "")) {
    errors.push("demoDisclosure must disclose the DummyJSON sample source.");
  }
  if (dataset.categoryMapping?.status !== "mapped-existing-categories") {
    errors.push("categoryMapping.status must be mapped-existing-categories.");
  }
  if (!/closest existing Gifto categories/i.test(dataset.categoryMapping?.note ?? "")) {
    errors.push("categoryMapping.note must explain the existing-category mapping.");
  }
  if (!/Actual DummyJSON sample product images/.test(dataset.imagePolicy ?? "")) {
    errors.push("imagePolicy must state that actual DummyJSON images are used.");
  }

  const products = Array.isArray(dataset.products) ? dataset.products : [];
  if (products.length !== EXPECTED_PRODUCT_COUNT) {
    errors.push(`Expected ${EXPECTED_PRODUCT_COUNT} products, found ${products.length}.`);
  }

  const rawProducts = Array.isArray(raw?.products) ? raw.products : [];
  if (rawProducts.length !== EXPECTED_SOURCE_COUNT) {
    errors.push(`Source snapshot must contain ${EXPECTED_SOURCE_COUNT} products.`);
  }
  const rawById = new Map(rawProducts.map((product) => [product.id, product]));

  const demoIds = new Set();
  const slugs = new Set();
  const sourceIds = new Set();
  const groupCounts = {};
  const vendorCounts = {};
  const categoryCounts = {};
  const imagePaths = new Set();

  for (const [index, product] of products.entries()) {
    const label = product?.demoId ?? `products[${index}]`;
    if (!isPlainObject(product)) {
      errors.push(`${label} is not an object.`);
      continue;
    }

    if (!/^gdj-\d{3}$/.test(product.demoId ?? "")) errors.push(`${label}: invalid demoId.`);
    if (demoIds.has(product.demoId)) errors.push(`${label}: duplicate demoId.`);
    demoIds.add(product.demoId);

    if (!(product.slug ?? "").startsWith(SLUG_PREFIX)) {
      errors.push(`${label}: slug must start with ${SLUG_PREFIX}.`);
    }
    if (slugs.has(product.slug)) errors.push(`${label}: duplicate slug ${product.slug}.`);
    slugs.add(product.slug);

    if (typeof product.name !== "string" || product.name.trim().length < 2 || product.name.length > 120) {
      errors.push(`${label}: name must be 2-120 characters.`);
    }
    if (
      typeof product.description !== "string" ||
      product.description.length < 40 ||
      product.description.length > 2000
    ) {
      errors.push(`${label}: description must be 40-2000 characters.`);
    }
    if (!/Demo listing based on DummyJSON sample data; price is illustrative/i.test(product.description ?? "")) {
      errors.push(`${label}: description must include the demo/illustrative-price disclosure.`);
    }
    if (!Number.isInteger(product.priceEgp) || product.priceEgp <= 0) {
      errors.push(`${label}: priceEgp must be a positive integer.`);
    }
    if (!Number.isInteger(product.stock) || product.stock < 0) {
      errors.push(`${label}: stock must be a non-negative integer.`);
    }
    if (product.status !== "active") errors.push(`${label}: status must be active.`);
    if (product.isDemo !== true) errors.push(`${label}: isDemo must be true.`);
    if (!(product.curationGroup in GROUP_COUNTS)) {
      errors.push(`${label}: unknown curationGroup ${product.curationGroup}.`);
    }
    if (!(product.categorySlug in CATEGORY_COUNTS)) {
      errors.push(`${label}: categorySlug must be one of ${Object.keys(CATEGORY_COUNTS).join(", ")}.`);
    }
    if (!(product.vendorSlug in VENDOR_COUNTS)) {
      errors.push(`${label}: unknown vendor ${product.vendorSlug}.`);
    }

    for (const forbidden of ["rating", "reviews", "availabilityStatus", "discountPercentage"]) {
      if (Object.prototype.hasOwnProperty.call(product, forbidden)) {
        errors.push(`${label}: DummyJSON field ${forbidden} must not be presented as catalogue data.`);
      }
    }

    if (!isPlainObject(product.image)) {
      errors.push(`${label}: missing image metadata.`);
    } else {
      if (product.image.path !== `images/${product.demoId}.webp`) {
        errors.push(`${label}: image path must be images/${product.demoId}.webp.`);
      }
      if (/^https?:/i.test(product.image.path ?? "")) errors.push(`${label}: image path must not be a URL.`);
      if (typeof product.image.alt !== "string" || product.image.alt.length < 12) {
        errors.push(`${label}: image alt text is missing or too short.`);
      }
      if (product.image.format !== "webp") errors.push(`${label}: image format must be webp.`);
      if (product.image.width !== 1000 || product.image.height !== 1000) {
        errors.push(`${label}: image dimensions must be 1000x1000.`);
      }
      if (!/image-specific rights/i.test(product.image.license ?? "")) {
        errors.push(`${label}: image license caveat is missing.`);
      }
      imagePaths.add(product.image.path);
    }

    if (!isPlainObject(product.source)) {
      errors.push(`${label}: missing source metadata.`);
    } else {
      if (product.source.type !== "dummyjson") errors.push(`${label}: source type must be dummyjson.`);
      if (!Number.isInteger(product.source.productId)) errors.push(`${label}: source.productId must be an integer.`);
      if (sourceIds.has(product.source.productId)) {
        errors.push(`${label}: duplicate DummyJSON source ID ${product.source.productId}.`);
      }
      sourceIds.add(product.source.productId);
      if (product.source.sourceUrl !== `https://dummyjson.com/products/${product.source.productId}`) {
        errors.push(`${label}: source URL mismatch.`);
      }
      if (!/image-specific rights/i.test(product.source.license ?? "")) {
        errors.push(`${label}: source image-rights caveat is missing.`);
      }
      if (!/No vendor affiliation/i.test(product.source.note ?? "")) {
        errors.push(`${label}: source note must disclaim vendor affiliation.`);
      }
      for (const forbidden of ["rating", "reviews", "stock", "availabilityStatus", "discountPercentage"]) {
        if (Object.prototype.hasOwnProperty.call(product.source, forbidden)) {
          errors.push(`${label}: DummyJSON source field ${forbidden} must not be imported.`);
        }
      }

      const source = rawById.get(product.source.productId);
      if (!source) {
        errors.push(`${label}: source product ${product.source.productId} is not in the snapshot.`);
      } else {
        if (product.source.title !== source.title) errors.push(`${label}: source title mismatch.`);
        if (product.source.category !== source.category) errors.push(`${label}: source category mismatch.`);
        if ((product.source.brand ?? null) !== (source.brand ?? null)) {
          errors.push(`${label}: source brand mismatch.`);
        }
        if (product.source.sourcePriceUsd !== source.price) {
          errors.push(`${label}: source price mismatch.`);
        }
        if (JSON.stringify(product.source.images) !== JSON.stringify(source.images)) {
          errors.push(`${label}: source image list mismatch.`);
        }
        const selectedImageUrl = source.images?.[product.image?.sourceImageIndex - 1];
        if (!selectedImageUrl) {
          errors.push(`${label}: source image index is outside the DummyJSON image array.`);
        } else if (product.image?.sourceUrl !== selectedImageUrl) {
          errors.push(`${label}: selected source image URL mismatch.`);
        } else if (product.source.selectedImageUrl !== selectedImageUrl) {
          errors.push(`${label}: source.selectedImageUrl mismatch.`);
        }
      }
    }

    groupCounts[product.curationGroup] = (groupCounts[product.curationGroup] ?? 0) + 1;
    vendorCounts[product.vendorSlug] = (vendorCounts[product.vendorSlug] ?? 0) + 1;
    categoryCounts[product.categorySlug] = (categoryCounts[product.categorySlug] ?? 0) + 1;
  }

  for (const [group, expected] of Object.entries(GROUP_COUNTS)) {
    if ((groupCounts[group] ?? 0) !== expected) {
      errors.push(`Group ${group} has ${groupCounts[group] ?? 0}, expected ${expected}.`);
    }
  }
  for (const [vendorSlug, expected] of Object.entries(VENDOR_COUNTS)) {
    if ((vendorCounts[vendorSlug] ?? 0) !== expected) {
      errors.push(`Vendor ${vendorSlug} has ${vendorCounts[vendorSlug] ?? 0}, expected ${expected}.`);
    }
  }
  for (const [categorySlug, expected] of Object.entries(CATEGORY_COUNTS)) {
    if ((categoryCounts[categorySlug] ?? 0) !== expected) {
      errors.push(
        `Category ${categorySlug} has ${categoryCounts[categorySlug] ?? 0}, expected ${expected}.`,
      );
    }
  }

  const files = await readdir(IMAGE_DIR).catch(() => []);
  const webps = files.filter((file) => file.endsWith(".webp"));
  const expectedFiles = products.map((product) => `${product.demoId}.webp`);
  const missing = expectedFiles.filter((file) => !webps.includes(file));
  const extra = webps.filter((file) => !expectedFiles.includes(file));
  if (missing.length) errors.push(`Missing images: ${missing.join(", ")}.`);
  if (extra.length) errors.push(`Unexpected images: ${extra.join(", ")}.`);

  let imageBytes = 0;
  for (const product of products) {
    const imagePath = path.join(DATA_DIR, product.image?.path ?? "");
    try {
      const info = await stat(imagePath);
      imageBytes += info.size;
      if (info.size < 10_000) errors.push(`${product.demoId}: image is smaller than 10 KB.`);
      if (info.size > 5 * 1024 * 1024) errors.push(`${product.demoId}: image exceeds the bucket's 5 MB limit.`);
      if (product.image?.byteSize !== info.size) errors.push(`${product.demoId}: image byteSize mismatch.`);
      const dimensions = webpDimensions(await readFile(imagePath));
      if (!dimensions || dimensions.width !== 1000 || dimensions.height !== 1000) {
        errors.push(`${product.demoId}: expected a 1000x1000 WebP.`);
      }
    } catch {
      errors.push(`${product.demoId}: image file not found.`);
    }
  }

  if (manifest) {
    if (manifest.datasetId !== DATASET_ID) errors.push("manifest datasetId mismatch.");
    if (manifest.version !== DATASET_VERSION) errors.push("manifest version mismatch.");
    if (manifest.productCount !== products.length) errors.push("manifest productCount mismatch.");
    if (JSON.stringify(manifest.actualDistribution) !== JSON.stringify(GROUP_COUNTS)) {
      errors.push("manifest group distribution mismatch.");
    }
    if (JSON.stringify(manifest.vendorDistribution) !== JSON.stringify(VENDOR_COUNTS)) {
      errors.push("manifest vendor distribution mismatch.");
    }
    for (const [categorySlug, expected] of Object.entries(CATEGORY_COUNTS)) {
      if (manifest.categoryDistribution?.[categorySlug] !== expected) {
        errors.push(`manifest categoryDistribution ${categorySlug} mismatch.`);
      }
    }
    if (Object.keys(manifest.categoryDistribution ?? {}).length !== Object.keys(CATEGORY_COUNTS).length) {
      errors.push("manifest categoryDistribution contains unexpected categories.");
    }
    if (manifest.categoryMapping?.status !== "mapped-existing-categories") {
      errors.push("manifest categoryMapping status mismatch.");
    }
    if (manifest.source?.totalProducts !== rawProducts.length) {
      errors.push("manifest source totalProducts mismatch.");
    }
    if (manifest.source?.selectedProducts !== products.length) {
      errors.push("manifest source selectedProducts mismatch.");
    }
    if (manifest.source?.excludedProducts !== rawProducts.length - products.length) {
      errors.push("manifest source excludedProducts mismatch.");
    }
    if (manifest.imageSummary?.count !== products.length) errors.push("manifest image count mismatch.");
    if (manifest.imageSummary?.thirdPartyAssets !== products.length) {
      errors.push("manifest must declare all images as third-party assets.");
    }
    if (manifest.imageSummary?.format !== "WebP") errors.push("manifest image format mismatch.");
    if (manifest.imageSummary?.width !== 1000 || manifest.imageSummary?.height !== 1000) {
      errors.push("manifest image dimensions mismatch.");
    }
    if (manifest.imageSummary?.totalBytes !== imageBytes) {
      errors.push("manifest image totalBytes mismatch.");
    }
    if (manifest.reports?.contactSheet !== "contact-sheet.jpg") errors.push("manifest contact-sheet path mismatch.");
    if (manifest.reports?.exclusions !== "exclusions.md") errors.push("manifest exclusions path mismatch.");
  }

  if (exclusions) {
    if (exclusions.source?.totalProducts !== rawProducts.length) errors.push("exclusions totalProducts mismatch.");
    if (exclusions.source?.selectedProducts !== products.length) {
      errors.push("exclusions selectedProducts mismatch.");
    }
    if (exclusions.source?.excludedProducts !== EXPECTED_EXCLUDED_COUNT) {
      errors.push("exclusions excludedProducts mismatch.");
    }
    const excluded = Array.isArray(exclusions.excluded) ? exclusions.excluded : [];
    if (excluded.length !== EXPECTED_EXCLUDED_COUNT) {
      errors.push(`exclusions must contain ${EXPECTED_EXCLUDED_COUNT} products.`);
    }
    const excludedIds = new Set(excluded.map((product) => product.id));
    if (excludedIds.size !== excluded.length) errors.push("exclusions contain duplicate source IDs.");
    for (const id of sourceIds) {
      if (excludedIds.has(id)) errors.push(`Exclusion ${id} is also selected.`);
    }
    if (sourceIds.size + excludedIds.size !== rawProducts.length) {
      errors.push("Selected and excluded products do not cover the full snapshot.");
    }
    for (const item of excluded) {
      if (!rawById.has(item.id)) errors.push(`Exclusion ${item.id} is not in the snapshot.`);
      if (typeof item.reason !== "string" || item.reason.length < 12) {
        errors.push(`Exclusion ${item.id} is missing a reason.`);
      }
    }
  }

  const contactSheet = path.join(DATA_DIR, "contact-sheet.jpg");
  try {
    const info = await stat(contactSheet);
    if (info.size < 100_000) errors.push("contact-sheet.jpg is smaller than expected.");
    const header = (await readFile(contactSheet)).subarray(0, 3);
    if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
      errors.push("contact-sheet.jpg is not a JPEG.");
    }
  } catch {
    errors.push("contact-sheet.jpg is missing.");
  }
  try {
    await stat(path.join(DATA_DIR, "exclusions.md"));
  } catch {
    errors.push("exclusions.md is missing.");
  }

  return {
    errors,
    dataset,
    manifest,
    exclusions,
    products,
    groupCounts,
    vendorCounts,
    categoryCounts,
  };
}
