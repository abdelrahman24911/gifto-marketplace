import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, "../..");
export const DATA_DIR = path.join(ROOT, "data/demo-catalog");
export const IMAGE_DIR = path.join(DATA_DIR, "images");
export const PRODUCT_IMAGES_BUCKET = "product-images";
export const DATASET_ID = "gifto-demo-catalog";
export const DATASET_VERSION = 1;
export const SLUG_PREFIX = "demo-catalog-";
export const IMPORT_CONFIRM = "IMPORT gifto-demo-catalog@1";
export const ROLLBACK_CONFIRM = "ROLLBACK gifto-demo-catalog@1";

export const VENDOR_SLUGS = [
  "nile-blossoms",
  "cairo-cocoa",
  "legacy-engraving",
  "alex-toy-corner",
];

export const CATEGORY_FOR_COLLECTION = {
  Flowers: "flowers",
  "Chocolates & Sweets": "chocolates-sweets",
  "Personalized Gifts": "personalized-gifts",
  "Gift Boxes": "gift-boxes",
  "Perfumes & Accessories": "personalized-gifts",
  "Toys & Cute Gifts": "toys-kids",
  "Home & Lifestyle": "gift-boxes",
};

export const COLLECTION_COUNTS = {
  Flowers: 8,
  "Chocolates & Sweets": 10,
  "Personalized Gifts": 8,
  "Gift Boxes": 8,
  "Perfumes & Accessories": 6,
  "Toys & Cute Gifts": 6,
  "Home & Lifestyle": 6,
};

export const VENDOR_COUNTS = {
  "nile-blossoms": 14,
  "cairo-cocoa": 14,
  "legacy-engraving": 18,
  "alex-toy-corner": 6,
};

export function loadEnv() {
  try {
    process.loadEnvFile(path.join(ROOT, ".env.local"));
  } catch {
    return undefined;
  }
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function readDataset() {
  return readJson(path.join(DATA_DIR, "products.json"));
}

export async function readManifest() {
  return readJson(path.join(DATA_DIR, "manifest.json"));
}

export async function readOccasionProposal() {
  return readJson(path.join(DATA_DIR, "occasions.proposed.json"));
}

export function credentialsPath() {
  const configured = process.env.DEMO_CATALOG_CREDENTIALS_FILE;
  return configured
    ? path.resolve(ROOT, configured)
    : path.join(ROOT, ".demo-catalog/credentials.json");
}

export async function readCredentials() {
  const filePath = credentialsPath();
  const credentials = await readJson(filePath).catch((error) => {
    throw new Error(`Could not read demo credentials at ${filePath}: ${error.message}`);
  });
  return credentials;
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    apply: argv.includes("--apply"),
    verify: argv.includes("--verify"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

export function assertTarget() {
  const environment = process.env.DEMO_CATALOG_ENV;
  if (environment !== "local" && environment !== "preview") {
    throw new Error(
      "Set DEMO_CATALOG_ENV=local or DEMO_CATALOG_ENV=preview. Hosted execution requires an explicit preview allowlist.",
    );
  }
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("Demo catalogue scripts refuse to run in a production environment.");
  }

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!rawUrl || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const hostname = url.hostname.toLowerCase();
  let projectRef = null;

  if (environment === "local") {
    if (!localHosts.has(hostname)) {
      throw new Error(`DEMO_CATALOG_ENV=local requires a localhost Supabase URL, got ${hostname}.`);
    }
  } else {
    if (localHosts.has(hostname)) {
      throw new Error("DEMO_CATALOG_ENV=preview requires a hosted Supabase URL.");
    }
    projectRef = hostname.split(".")[0];
    const allowed = (process.env.DEMO_CATALOG_ALLOWED_PROJECT_REFS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (allowed.length === 0) {
      throw new Error(
        "Set DEMO_CATALOG_ALLOWED_PROJECT_REFS to the preview project ref(s) before running against a hosted target.",
      );
    }
    if (!allowed.includes(projectRef)) {
      throw new Error(`Project ref ${projectRef} is not in DEMO_CATALOG_ALLOWED_PROJECT_REFS.`);
    }
  }

  return { environment, url: url.toString().replace(/\/$/, ""), anonKey, projectRef, hostname };
}

export function assertConfirmation(expected) {
  const actual = process.env.DEMO_CATALOG_CONFIRM;
  if (actual !== expected) {
    throw new Error(
      `Set DEMO_CATALOG_CONFIRM exactly to "${expected}" before writing to the target.`,
    );
  }
}

export function expectedImageObjectName() {
  return "demo-catalog-hero.jpg";
}

export function imageObjectPath(vendorId, productId) {
  return `${vendorId}/${productId}/${expectedImageObjectName()}`;
}

export function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
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
    if (offset + 4 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xc3) {
      if (offset + 9 > buffer.length) return null;
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
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
  let proposal;

  try {
    dataset = await readDataset();
  } catch (error) {
    return { errors: [`Could not read products.json: ${error.message}`], dataset: null, manifest: null, proposal: null };
  }
  try {
    manifest = await readManifest();
  } catch (error) {
    errors.push(`Could not read manifest.json: ${error.message}`);
  }
  try {
    proposal = await readOccasionProposal();
  } catch (error) {
    errors.push(`Could not read occasions.proposed.json: ${error.message}`);
  }

  if (dataset.datasetId !== DATASET_ID) errors.push(`datasetId must be ${DATASET_ID}.`);
  if (dataset.version !== DATASET_VERSION) errors.push(`version must be ${DATASET_VERSION}.`);
  if (dataset.currency !== "EGP") errors.push("currency must be EGP.");
  if (!/^Illustrative demo prices/.test(dataset.priceNote ?? "")) {
    errors.push("priceNote must state that prices are illustrative.");
  }
  if (!/original local demo artwork/i.test(dataset.imagePolicy ?? "")) {
    errors.push("imagePolicy must state that all product images are original local artwork.");
  }

  const products = Array.isArray(dataset.products) ? dataset.products : [];
  if (products.length < 40 || products.length > 60) {
    errors.push(`Expected 40-60 products, found ${products.length}.`);
  }

  const demoIds = new Set();
  const slugs = new Set();
  const collectionCounts = {};
  const vendorCounts = {};
  const categoryCounts = {};
  const imageNames = new Set();

  for (const [index, product] of products.entries()) {
    const label = product?.demoId ?? `products[${index}]`;
    if (!isPlainObject(product)) {
      errors.push(`${label} is not an object.`);
      continue;
    }
    if (!/^gdc-\d{3}$/.test(product.demoId ?? "")) errors.push(`${label}: invalid demoId.`);
    if (demoIds.has(product.demoId)) errors.push(`${label}: duplicate demoId ${product.demoId}.`);
    demoIds.add(product.demoId);
    if (!(product.slug ?? "").startsWith(SLUG_PREFIX)) errors.push(`${label}: slug must start with ${SLUG_PREFIX}.`);
    if (slugs.has(product.slug)) errors.push(`${label}: duplicate slug ${product.slug}.`);
    slugs.add(product.slug);
    if (typeof product.name !== "string" || product.name.trim().length < 2 || product.name.length > 120) {
      errors.push(`${label}: name must be 2-120 characters.`);
    }
    if (typeof product.description !== "string" || product.description.length < 40 || product.description.length > 2000) {
      errors.push(`${label}: description must be 40-2000 characters.`);
    }
    if (!Number.isInteger(product.priceEgp) || product.priceEgp <= 0) {
      errors.push(`${label}: priceEgp must be a positive integer.`);
    }
    if (!Number.isInteger(product.stock) || product.stock < 0) errors.push(`${label}: stock must be a non-negative integer.`);
    if (product.status !== "active") errors.push(`${label}: status must be active.`);
    if (product.isDemo !== true) errors.push(`${label}: isDemo must be true.`);
    if (!(product.vendorSlug in VENDOR_COUNTS)) errors.push(`${label}: unknown vendor ${product.vendorSlug}.`);
    if (!(product.collection in COLLECTION_COUNTS)) errors.push(`${label}: unknown collection ${product.collection}.`);
    if (CATEGORY_FOR_COLLECTION[product.collection] !== product.categorySlug) {
      errors.push(`${label}: categorySlug does not match the documented category mapping.`);
    }
    if (!isPlainObject(product.image)) {
      errors.push(`${label}: missing image metadata.`);
    } else {
      if (product.image.path !== `images/${product.demoId}.jpg`) {
        errors.push(`${label}: image path must be images/${product.demoId}.jpg.`);
      }
      if (/^https?:/i.test(product.image.path ?? "")) errors.push(`${label}: image path must not be a URL.`);
      if (!/^Stylised studio illustration of /.test(product.image.alt ?? "")) {
        errors.push(`${label}: image alt text is missing or not descriptive.`);
      }
      if (!/^Gifto original generated artwork/.test(product.image.source ?? "")) {
        errors.push(`${label}: image source must be original generated artwork.`);
      }
      imageNames.add(product.image.path);
    }
    if (!isPlainObject(product.source)) errors.push(`${label}: missing source metadata.`);
    else if (!["gifto-original", "dummyjson-candidate"].includes(product.source.type)) {
      errors.push(`${label}: unknown source type.`);
    }
    collectionCounts[product.collection] = (collectionCounts[product.collection] ?? 0) + 1;
    vendorCounts[product.vendorSlug] = (vendorCounts[product.vendorSlug] ?? 0) + 1;
    categoryCounts[product.categorySlug] = (categoryCounts[product.categorySlug] ?? 0) + 1;
  }

  for (const [collection, expected] of Object.entries(COLLECTION_COUNTS)) {
    if ((collectionCounts[collection] ?? 0) !== expected) {
      errors.push(`Collection ${collection} has ${collectionCounts[collection] ?? 0}, expected ${expected}.`);
    }
  }
  for (const [vendorSlug, expected] of Object.entries(VENDOR_COUNTS)) {
    if ((vendorCounts[vendorSlug] ?? 0) !== expected) {
      errors.push(`Vendor ${vendorSlug} has ${vendorCounts[vendorSlug] ?? 0}, expected ${expected}.`);
    }
  }

  const files = await readdir(IMAGE_DIR).catch(() => []);
  const jpgs = files.filter((file) => file.endsWith(".jpg"));
  const expectedJpgs = products.map((product) => `${product.demoId}.jpg`);
  const missing = expectedJpgs.filter((file) => !jpgs.includes(file));
  const extra = jpgs.filter((file) => !expectedJpgs.includes(file));
  if (missing.length) errors.push(`Missing images: ${missing.join(", ")}.`);
  if (extra.length) errors.push(`Unexpected images: ${extra.join(", ")}.`);

  for (const product of products) {
    const imagePath = path.join(DATA_DIR, product.image?.path ?? "");
    try {
      const info = await stat(imagePath);
      if (info.size < 10_000) errors.push(`${product.demoId}: image is smaller than 10 KB.`);
      if (info.size > 5 * 1024 * 1024) errors.push(`${product.demoId}: image exceeds the bucket's 5 MB limit.`);
      const buffer = await readFile(imagePath);
      const dimensions = jpegDimensions(buffer);
      if (!dimensions || dimensions.width !== 1024 || dimensions.height !== 1024) {
        errors.push(`${product.demoId}: expected a 1024x1024 JPEG.`);
      }
    } catch {
      errors.push(`${product.demoId}: image file not found.`);
    }
  }

  if (manifest) {
    if (manifest.datasetId !== DATASET_ID) errors.push("manifest datasetId mismatch.");
    if (manifest.version !== DATASET_VERSION) errors.push("manifest version mismatch.");
    if (manifest.productCount !== products.length) errors.push("manifest productCount mismatch.");
    for (const [collection, expected] of Object.entries(COLLECTION_COUNTS)) {
      if (manifest.actualDistribution?.[collection] !== expected) {
        errors.push(`manifest count mismatch for ${collection}.`);
      }
      if (manifest.targetDistribution?.[collection] !== expected) {
        errors.push(`manifest target count mismatch for ${collection}.`);
      }
    }
    for (const [vendorSlug, expected] of Object.entries(VENDOR_COUNTS)) {
      if (manifest.vendorDistribution?.[vendorSlug] !== expected) {
        errors.push(`manifest vendor count mismatch for ${vendorSlug}.`);
      }
    }
    if (manifest.imageSummary?.count !== products.length) errors.push("manifest image count mismatch.");
    if (manifest.imageSummary?.thirdPartyAssets !== 0) errors.push("manifest must declare zero third-party image assets.");
    if (manifest.candidateSource?.candidateCount !== products.filter((p) => p.source?.type === "dummyjson-candidate").length) {
      errors.push("manifest candidate count mismatch.");
    }
  }

  if (proposal) {
    if (proposal.status !== "proposed-not-applied") errors.push("occasion proposal must be marked proposed-not-applied.");
    if (!Array.isArray(proposal.occasions)) errors.push("occasion proposal has no occasions array.");
    const seenOccasions = new Set();
    for (const occasion of proposal.occasions ?? []) {
      if (seenOccasions.has(occasion.slug)) errors.push(`duplicate occasion proposal ${occasion.slug}.`);
      seenOccasions.add(occasion.slug);
      if (!["graduation", "ramdan-night"].includes(occasion.slug)) {
        errors.push(`unexpected occasion proposal slug ${occasion.slug}.`);
      }
      if (!Array.isArray(occasion.picks) || occasion.picks.length < 6 || occasion.picks.length > 16) {
        errors.push(`${occasion.slug}: expected 6-16 picks.`);
      }
      const seenPicks = new Set();
      for (const pick of occasion.picks ?? []) {
        if (!demoIds.has(pick.demoId)) errors.push(`${occasion.slug}: unknown pick ${pick.demoId}.`);
        if (!slugs.has(pick.slug)) errors.push(`${occasion.slug}: unknown pick slug ${pick.slug}.`);
        if (seenPicks.has(pick.demoId)) errors.push(`${occasion.slug}: duplicate pick ${pick.demoId}.`);
        seenPicks.add(pick.demoId);
        if (typeof pick.reason !== "string" || pick.reason.length < 20) {
          errors.push(`${occasion.slug}/${pick.demoId}: reason is missing.`);
        }
      }
    }
    if (!seenOccasions.has("graduation")) errors.push("occasion proposal is missing graduation.");
    if (!seenOccasions.has("ramdan-night")) errors.push("occasion proposal is missing ramdan-night.");
  }

  return {
    errors,
    dataset,
    manifest,
    proposal,
    products,
    collectionCounts,
    vendorCounts,
    categoryCounts,
    imageNames,
  };
}
