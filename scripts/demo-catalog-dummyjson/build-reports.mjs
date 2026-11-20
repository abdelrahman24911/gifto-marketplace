#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DATA_DIR = path.join(ROOT, "data/demo-catalog-dummyjson");
const SOURCE_FILE = path.join(DATA_DIR, "source/dummyjson-products.json");

const GROUP_ORDER = [
  "Fragrance",
  "Skin care",
  "Beauty",
  "Bags",
  "Jewellery",
  "Watches",
  "Executive gifts",
  "Sunglasses",
  "Home & living",
  "Kitchen & dining",
  "Gourmet gifts",
  "Coffee gifts",
];

const VENDOR_LABELS = {
  "nile-blossoms": "Nile Blossoms",
  "legacy-engraving": "Legacy Engraving",
  "cairo-cocoa": "Cairo Cocoa",
};

const CATEGORY_LABELS = {
  beauty: "Beauty",
  fragrances: "Fragrances",
  furniture: "Furniture",
  groceries: "Groceries",
  "home-decoration": "Home decoration",
  "kitchen-accessories": "Kitchen accessories",
  laptops: "Laptops",
  "mens-shirts": "Men's shirts",
  "mens-shoes": "Men's shoes",
  "mens-watches": "Men's watches",
  "mobile-accessories": "Mobile accessories",
  motorcycle: "Motorcycle",
  "skin-care": "Skin care",
  smartphones: "Smartphones",
  "sports-accessories": "Sports accessories",
  sunglasses: "Sunglasses",
  tablets: "Tablets",
  tops: "Tops",
  vehicle: "Vehicle",
  "womens-bags": "Women's bags",
  "womens-dresses": "Women's dresses",
  "womens-jewellery": "Women's jewellery",
  "womens-shoes": "Women's shoes",
  "womens-watches": "Women's watches",
};

const OUT_OF_SCOPE_REASONS = {
  groceries: "Grocery item outside the selected honey-and-coffee gift pair.",
  "sports-accessories": "Sports accessory; outside this non-food gift edit.",
  smartphones: "Smartphone; electronics sit outside this gift-focused edit.",
  "mobile-accessories": "Mobile/consumer electronics accessory; outside this gift-focused edit.",
  laptops: "Laptop; electronics sit outside this gift-focused edit.",
  tablets: "Tablet; electronics sit outside this gift-focused edit.",
  "womens-dresses": "Apparel; sizing complexity and outside this accessory-led edit.",
  tops: "Apparel; sizing complexity and outside this accessory-led edit.",
  "mens-shirts": "Apparel; sizing complexity and outside this accessory-led edit.",
  "womens-shoes": "Footwear; sizing complexity and outside this accessory-led edit.",
  "mens-shoes": "Footwear; sizing complexity and outside this accessory-led edit.",
  vehicle: "Vehicle product; outside a lightweight gift catalogue.",
  motorcycle: "Motorcycle product; outside a lightweight gift catalogue.",
  furniture: "Large furniture; unsuitable for this lightweight gift edit.",
};

const SPECIFIC_REASONS = {
  43: "Decorative swing is an oversized novelty; weaker fit for the gift edit.",
  51: "Boxed blender is a bulky appliance; outside the lightweight kitchen gift edit.",
  56: "Electric stove is a bulky appliance; outside the lightweight kitchen gift edit.",
  64: "Single kitchen knife; a less comfortable gift item than the selected kitchen pieces.",
  66: "Microwave oven is a bulky appliance; outside the lightweight kitchen gift edit.",
  71: "Large covered pot is cookware rather than a gift-led kitchen piece.",
  157: "Novelty party glasses; weaker gift presentation than the four selected sunglasses.",
  191: "Duplicate Rolex Cellini Moonphase concept; selected product 96 already covers it.",
  192: "Near-duplicate Rolex Datejust Women; selected products 97 and 193 cover the Datejust and women's watch slots.",
};

const KITCHEN_DEFAULT =
  "Ordinary single utensil; the six selected kitchen items offer stronger gift presentation and visual variety.";

function categoryLabel(slug) {
  return CATEGORY_LABELS[slug] ?? slug.replace(/-/g, " ");
}

function reasonFor(product) {
  if (SPECIFIC_REASONS[product.id]) return SPECIFIC_REASONS[product.id];
  if (OUT_OF_SCOPE_REASONS[product.category]) return OUT_OF_SCOPE_REASONS[product.category];
  if (product.category === "kitchen-accessories") return KITCHEN_DEFAULT;
  return "Outside the curated 46-product gift edit.";
}

function markdownCell(value) {
  return String(value ?? "—").replace(/\|/g, "\\|");
}

function money(value) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(value);
}

async function buildExclusions(products, raw) {
  const selectedIds = new Set(products.map((product) => product.source.productId));
  const excluded = raw.products
    .filter((product) => !selectedIds.has(product.id))
    .map((product) => ({
      id: product.id,
      title: product.title,
      brand: product.brand ?? null,
      category: product.category,
      categoryLabel: categoryLabel(product.category),
      sourcePriceUsd: product.price,
      imageCount: product.images?.length ?? 0,
      reason: reasonFor(product),
    }));

  if (excluded.length !== raw.products.length - products.length) {
    throw new Error("Exclusion list does not match the selected product count.");
  }

  const categoryRows = Object.keys(CATEGORY_LABELS)
    .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)))
    .map((slug) => {
      const all = raw.products.filter((product) => product.category === slug);
      if (all.length === 0) return null;
      const selected = all.filter((product) => selectedIds.has(product.id)).length;
      return {
        category: slug,
        categoryLabel: categoryLabel(slug),
        total: all.length,
        selected,
        excluded: all.length - selected,
      };
    })
    .filter(Boolean);

  const json = {
    datasetId: "gifto-demo-catalog-dummyjson",
    source: {
      provider: "DummyJSON",
      api: "https://dummyjson.com/products?limit=0",
      totalProducts: raw.products.length,
      selectedProducts: products.length,
      excludedProducts: excluded.length,
    },
    categorySummary: categoryRows,
    excluded,
  };

  const lines = [
    "# DummyJSON gift edit — exclusion report",
    "",
    `Source: DummyJSON (${json.source.api})`,
    "",
    `The one-time snapshot contains **${raw.products.length}** products. **${products.length}** were selected for the local gift edit and **${excluded.length}** were excluded.`,
    "",
    "This is a curation report, not a product-quality or brand judgement. The edit deliberately concentrates on gifting-friendly fragrances, beauty, personal accessories, home pieces and kitchen items with strong, clean product photography.",
    "",
    "## Coverage by category",
    "",
    "| DummyJSON category | Available | Selected | Excluded |",
    "| --- | ---: | ---: | ---: |",
    ...categoryRows.map(
      (row) =>
        `| ${row.categoryLabel} | ${row.total} | ${row.selected} | ${row.excluded} |`,
    ),
    "",
    "## Excluded products",
    "",
  ];

  for (const row of categoryRows) {
    if (row.excluded === 0) continue;
    const items = excluded.filter((item) => item.category === row.category);
    lines.push(`### ${row.categoryLabel} (${items.length} excluded)`, "");
    lines.push("| ID | Product | Brand | Reason |");
    lines.push("| ---: | --- | --- | --- |");
    for (const item of items) {
      lines.push(
        `| ${item.id} | ${markdownCell(item.title)} | ${markdownCell(item.brand)} | ${markdownCell(item.reason)} |`,
      );
    }
    lines.push("");
  }

  await writeFile(
    path.join(DATA_DIR, "exclusions.json"),
    `${JSON.stringify(json, null, 2)}\n`,
    "utf8",
  );
  await writeFile(path.join(DATA_DIR, "exclusions.md"), `${lines.join("\n")}\n`, "utf8");

  return { excluded, categoryRows };
}

function contactSheetHtml(products) {
  const ordered = [...products].sort(
    (a, b) =>
      GROUP_ORDER.indexOf(a.curationGroup) - GROUP_ORDER.indexOf(b.curationGroup) ||
      a.demoId.localeCompare(b.demoId),
  );
  const categoryCounts = products.reduce((counts, product) => {
    counts[product.categorySlug] = (counts[product.categorySlug] ?? 0) + 1;
    return counts;
  }, {});
  const categorySummary = Object.entries(categoryCounts)
    .map(([slug, count]) => `${slug} (${count})`)
    .join(", ");

  const cards = ordered
    .map((product) => {
      const image = `data:image/webp;base64,${product.imageBase64}`;
      return `
        <article class="card">
          <div class="image"><img src="${image}" alt="" /></div>
          <div class="body">
            <div class="meta"><span>${product.curationGroup}</span><span>${VENDOR_LABELS[product.vendorSlug] ?? product.vendorSlug}</span></div>
            <h2>${product.name}</h2>
            <div class="bottom"><strong>${money(product.priceEgp)}</strong><span>DJ #${product.source.productId}</span></div>
          </div>
        </article>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  @page { margin: 0; }
  body {
    margin: 0;
    background: #f2ece3;
    color: #2f2823;
    font-family: "Segoe UI", Arial, sans-serif;
  }
  .page { width: 1600px; padding: 54px; }
  header {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 40px;
    padding-bottom: 28px;
    border-bottom: 2px solid #3a3029;
  }
  h1 {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 54px;
    line-height: 0.98;
    font-weight: 500;
    letter-spacing: -0.035em;
  }
  .eyebrow {
    margin: 0 0 12px;
    font-size: 13px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #9a4f3d;
    font-weight: 700;
  }
  .lede { margin: 12px 0 0; font-size: 17px; color: #665b51; max-width: 720px; }
  .count {
    min-width: 190px;
    text-align: right;
    padding: 18px 22px;
    border: 1px solid #cbbfae;
    background: #faf7f0;
  }
  .count strong { display: block; font-family: Georgia, serif; font-size: 48px; font-weight: 500; line-height: 1; }
  .count span { display: block; margin-top: 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #76695d; }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 22px;
    margin-top: 30px;
  }
  .card {
    background: #fffdf9;
    border: 1px solid #d8cdbf;
    overflow: hidden;
  }
  .image {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fbfaf7;
    border-bottom: 1px solid #e5dcd0;
    padding: 12px;
  }
  .image img { width: 100%; height: 100%; object-fit: contain; }
  .body { padding: 14px 16px 15px; }
  .meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #9a4f3d;
    font-weight: 700;
  }
  h2 {
    margin: 7px 0 12px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 19px;
    line-height: 1.2;
    font-weight: 500;
    min-height: 46px;
  }
  .bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding-top: 9px;
    border-top: 1px solid #eee7dc;
    font-size: 12px;
    color: #7b6e62;
  }
  .bottom strong { color: #2f2823; font-size: 14px; }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 40px;
    margin-top: 28px;
    padding-top: 18px;
    border-top: 1px solid #cbbfae;
    font-size: 12px;
    color: #75695d;
    line-height: 1.5;
  }
</style>
</head>
<body>
  <main class="page">
    <header>
      <div>
        <p class="eyebrow">Gifto demo catalogue / DummyJSON gift edit</p>
        <h1>Curated sample products<br />for prospective vendors.</h1>
        <p class="lede">Actual DummyJSON product images, local WebP assets, illustrative EGP prices. Mapped to the closest existing Gifto categories: ${categorySummary}.</p>
      </div>
      <div class="count"><strong>${products.length}</strong><span>curated products</span></div>
    </header>
    <section class="grid">${cards}</section>
    <footer>
      <span><strong>Source:</strong> DummyJSON sample data. Brand names and product titles are sample metadata; no affiliation or authenticity is claimed.</span>
      <span><strong>Status:</strong> imported to the hosted preview. Categories map to existing Gifto groups; prices are illustrative and not vendor quotations.</span>
    </footer>
  </main>
</body>
</html>`;
}

async function buildContactSheet(products) {
  const withImages = [];
  for (const product of products) {
    const imageBuffer = await readFile(path.join(DATA_DIR, product.image.path));
    withImages.push({ ...product, imageBase64: imageBuffer.toString("base64") });
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
    await page.setContent(contactSheetHtml(withImages), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const output = path.join(DATA_DIR, "contact-sheet.jpg");
    await page.screenshot({ path: output, type: "jpeg", quality: 90, fullPage: true });
    return output;
  } finally {
    await browser.close();
  }
}

async function main() {
  const dataset = JSON.parse(await readFile(path.join(DATA_DIR, "products.json"), "utf8"));
  const raw = JSON.parse(await readFile(SOURCE_FILE, "utf8"));
  const { excluded, categoryRows } = await buildExclusions(dataset.products, raw);
  const contactSheet = await buildContactSheet(dataset.products);

  console.log(`Wrote ${excluded.length} exclusions across ${categoryRows.length} categories.`);
  console.log(`Wrote contact sheet to ${path.relative(ROOT, contactSheet)}.`);
}

main().catch((error) => {
  console.error(`DummyJSON demo reports failed: ${error.message}`);
  process.exit(1);
});
