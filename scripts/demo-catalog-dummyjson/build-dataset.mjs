#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DATA_DIR = path.join(ROOT, "data/demo-catalog-dummyjson");
const IMAGE_DIR = path.join(DATA_DIR, "images");
const SOURCE_FILE = path.join(DATA_DIR, "source/dummyjson-products.json");

const DATASET_ID = "gifto-demo-catalog-dummyjson";
const DATASET_VERSION = 2;
const SLUG_PREFIX = "demo-catalog-dj-";
const DEMO_DISCLOSURE =
  "Demo listing based on DummyJSON sample data; price is illustrative and not a vendor offer.";
const IMAGE_POLICY =
  "Actual DummyJSON sample product images are stored locally for demo use. No hotlinks and no runtime API calls are used. DummyJSON does not separately state image-specific licensing.";
const CATEGORY_FOR_GROUP = {
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
const CATEGORY_NOTE =
  "Mapped to the closest existing Gifto categories without adding taxonomy. The original 40 products keep 31 in personalized-gifts and 9 in gift-boxes; the six extension SKUs use underused existing categories: three executive watches in corporate-gifts, honey in chocolates-sweets, and coffee plus the table lamp in gift-boxes.";

const CURATION = [
  {
    sourceId: 6,
    slug: "calvin-klein-ck-one-eau-de-toilette",
    name: "Calvin Klein CK One Eau de Toilette",
    description:
      "A fresh, clean unisex fragrance in a frosted glass bottle, presented with its matching box. A versatile everyday scent for sharing.",
    priceEgp: 2450,
    stock: 14,
    group: "Fragrance",
    vendorSlug: "nile-blossoms",
    imageIndex: 2,
    alt: "Calvin Klein CK One bottle and box on a pale background.",
  },
  {
    sourceId: 7,
    slug: "chanel-coco-noir-eau-de-parfum",
    name: "Chanel Coco Noir Eau de Parfum",
    description:
      "An evening fragrance with grapefruit, rose and sandalwood notes, presented in a black bottle with a gold-lined box.",
    priceEgp: 4950,
    stock: 10,
    group: "Fragrance",
    vendorSlug: "nile-blossoms",
    imageIndex: 2,
    alt: "Chanel Coco Noir bottle beside its gold-lined box on a pale background.",
  },
  {
    sourceId: 8,
    slug: "dior-jadore-eau-de-parfum",
    name: "Dior J'adore Eau de Parfum",
    description:
      "A floral fragrance with ylang-ylang, rose and jasmine notes in a golden pear-shaped bottle, shown with its white gift box.",
    priceEgp: 4150,
    stock: 12,
    group: "Fragrance",
    vendorSlug: "nile-blossoms",
    imageIndex: 2,
    alt: "Dior J'adore bottle and white gift box on a pale background.",
  },
  {
    sourceId: 9,
    slug: "dolce-gabbana-dolce-shine-eau-de-parfum",
    name: "Dolce & Gabbana Dolce Shine Eau de Parfum",
    description:
      "A fruity floral fragrance with mango, jasmine and blonde woods notes in a yellow bottle, paired with its presentation box.",
    priceEgp: 3250,
    stock: 16,
    group: "Fragrance",
    vendorSlug: "nile-blossoms",
    imageIndex: 2,
    alt: "Dolce Shine yellow bottle and presentation box on a pale background.",
  },
  {
    sourceId: 10,
    slug: "gucci-bloom-eau-de-parfum",
    name: "Gucci Bloom Eau de Parfum",
    description:
      "A white floral fragrance with tuberose, jasmine and Rangoon creeper notes in a pink bottle with a floral box.",
    priceEgp: 3750,
    stock: 12,
    group: "Fragrance",
    vendorSlug: "nile-blossoms",
    imageIndex: 2,
    alt: "Gucci Bloom pink bottle and floral box on a pale background.",
  },
  {
    sourceId: 118,
    slug: "attitude-super-leaves-hand-soap",
    name: "Attitude Super Leaves Hand Soap",
    description:
      "A liquid hand soap in a white pump bottle with lemon and leaf illustrations, sized for a kitchen or guest bathroom.",
    priceEgp: 450,
    stock: 20,
    group: "Skin care",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Attitude Super Leaves hand soap pump bottle on a pale background.",
  },
  {
    sourceId: 119,
    slug: "olay-ultra-moisture-shea-butter-body-wash",
    name: "Olay Ultra Moisture Shea Butter Body Wash",
    description:
      "A shea butter body wash in a large pump bottle with a warm amber label, suited to a daily body-care gift set.",
    priceEgp: 650,
    stock: 18,
    group: "Skin care",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Olay Ultra Moisture shea butter body wash pump bottle on a pale background.",
  },
  {
    sourceId: 120,
    slug: "vaseline-men-body-and-face-lotion",
    name: "Vaseline Men Body and Face Lotion",
    description:
      "A body and face lotion in a black pump bottle with a clean, utilitarian label for everyday skincare.",
    priceEgp: 550,
    stock: 16,
    group: "Skin care",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Vaseline Men body and face lotion pump bottle on a pale background.",
  },
  {
    sourceId: 1,
    slug: "essence-mascara-lash-princess",
    name: "Essence Mascara Lash Princess",
    description:
      "A mascara with a slim black-and-green tube and a bristled wand designed to separate and define lashes.",
    priceEgp: 450,
    stock: 20,
    group: "Beauty",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Essence Lash Princess mascara tube and wand on a pale background.",
  },
  {
    sourceId: 2,
    slug: "eyeshadow-palette-with-mirror",
    name: "Eyeshadow Palette with Mirror",
    description:
      "An open eyeshadow palette with a built-in mirror and a mix of warm, berry and neutral powder shades.",
    priceEgp: 950,
    stock: 14,
    group: "Beauty",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Open eyeshadow palette with mirror and warm-toned shades on a pale background.",
  },
  {
    sourceId: 3,
    slug: "powder-canister",
    name: "Powder Canister",
    description:
      "A round compact powder in a black case with a hinged lid and a soft neutral shade.",
    priceEgp: 650,
    stock: 18,
    group: "Beauty",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Open round powder compact with a soft neutral shade on a pale background.",
  },
  {
    sourceId: 4,
    slug: "red-lipstick",
    name: "Red Lipstick",
    description:
      "A classic red lipstick in a black and gold-tone tube, shown with the cap removed.",
    priceEgp: 550,
    stock: 22,
    group: "Beauty",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Open red lipstick in a black and gold-tone tube on a pale background.",
  },
  {
    sourceId: 5,
    slug: "red-nail-polish",
    name: "Red Nail Polish",
    description:
      "A glossy red nail polish in a clear glass bottle with a black cap, shown beside its brush.",
    priceEgp: 350,
    stock: 24,
    group: "Beauty",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Red nail polish bottle with black cap and brush on a pale background.",
  },
  {
    sourceId: 172,
    slug: "blue-womens-handbag",
    name: "Blue Women's Handbag",
    description:
      "A structured deep-blue handbag with two top handles and a clean, uncluttered front.",
    priceEgp: 2450,
    stock: 10,
    group: "Bags",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Structured deep-blue handbag with two top handles on a pale background.",
  },
  {
    sourceId: 173,
    slug: "heshe-womens-leather-bag",
    name: "Heshe Women's Leather Bag",
    description:
      "A tan leather shoulder bag with a rounded top handle, a front zip pocket and soft slouchy sides.",
    priceEgp: 5950,
    stock: 8,
    group: "Bags",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Tan leather shoulder bag with front zip pocket on a pale background.",
  },
  {
    sourceId: 174,
    slug: "prada-women-bag",
    name: "Prada Women Bag",
    description:
      "A pale blue structured tote with two top handles, a triangular front plaque and a flat base.",
    priceEgp: 12500,
    stock: 6,
    group: "Bags",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Pale blue structured tote bag with two top handles on a pale background.",
  },
  {
    sourceId: 175,
    slug: "white-faux-leather-backpack",
    name: "White Faux Leather Backpack",
    description:
      "A white faux-leather backpack with a flap closure, drawstring details and adjustable shoulder straps.",
    priceEgp: 2950,
    stock: 12,
    group: "Bags",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "White faux-leather backpack with flap and drawstring closure on a pale background.",
  },
  {
    sourceId: 176,
    slug: "women-handbag-black",
    name: "Women Handbag Black",
    description:
      "A black structured handbag with two top handles, a front strap detail and a boxy silhouette.",
    priceEgp: 4450,
    stock: 10,
    group: "Bags",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Black structured handbag with two top handles on a pale background.",
  },
  {
    sourceId: 182,
    slug: "green-crystal-earring",
    name: "Green Crystal Earring",
    description:
      "A single green crystal drop earring with a gold-tone cap and hook, shown against a pale background.",
    priceEgp: 1250,
    stock: 14,
    group: "Jewellery",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Single green crystal drop earring with gold-tone hook on a pale background.",
  },
  {
    sourceId: 183,
    slug: "green-oval-earring",
    name: "Green Oval Earring",
    description:
      "A green and cream checkerboard oval earring with a matching stud and gold-tone hook.",
    priceEgp: 1450,
    stock: 12,
    group: "Jewellery",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Green and cream checkerboard oval earring on a pale background.",
  },
  {
    sourceId: 184,
    slug: "tropical-earring",
    name: "Tropical Earring",
    description:
      "A gold-tone leaf-shaped drop earring with a polished finish and a simple hook fastening.",
    priceEgp: 950,
    stock: 16,
    group: "Jewellery",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Gold-tone leaf-shaped drop earring on a pale background.",
  },
  {
    sourceId: 93,
    slug: "brown-leather-belt-watch",
    name: "Brown Leather Belt Watch",
    description:
      "A brown leather strap watch with a light dial, rose-gold-tone case and slim hands.",
    priceEgp: 4950,
    stock: 10,
    group: "Watches",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Brown leather strap watch with light dial on a pale background.",
  },
  {
    sourceId: 94,
    slug: "longines-master-collection-watch",
    name: "Longines Master Collection Watch",
    description:
      "A silver-tone bracelet watch with a black dial, three subdials and a polished link strap.",
    priceEgp: 18500,
    stock: 6,
    group: "Watches",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Longines Master Collection silver bracelet watch with black dial on a pale background.",
  },
  {
    sourceId: 95,
    slug: "rolex-cellini-date-black-dial-watch",
    name: "Rolex Cellini Date Black Dial Watch",
    description:
      "A rose-gold-tone case watch with a black dial, Roman numerals and a black leather strap.",
    priceEgp: 28500,
    stock: 5,
    group: "Watches",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Rolex Cellini Date black dial watch with black leather strap on a pale background.",
  },
  {
    sourceId: 96,
    slug: "rolex-cellini-moonphase-watch",
    name: "Rolex Cellini Moonphase Watch",
    description:
      "A rose-gold-tone moonphase watch with a white dial, blue moonphase display and brown leather strap.",
    priceEgp: 34500,
    stock: 5,
    group: "Watches",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Rolex Cellini Moonphase white dial watch with brown leather strap on a pale background.",
  },
  {
    sourceId: 193,
    slug: "watch-gold-for-women",
    name: "Watch Gold for Women",
    description:
      "A gold-tone bracelet watch with a deep blue dial and a slim link strap.",
    priceEgp: 12500,
    stock: 6,
    group: "Watches",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Gold-tone bracelet watch with deep blue dial on a pale background.",
  },
  {
    sourceId: 194,
    slug: "womens-wrist-watch",
    name: "Women's Wrist Watch",
    description:
      "A slim silver-tone bracelet watch with a black dial and a minimalist link strap.",
    priceEgp: 5950,
    stock: 8,
    group: "Watches",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Slim silver-tone bracelet watch with black dial on a pale background.",
  },
  {
    sourceId: 154,
    slug: "black-sun-glasses",
    name: "Black Sun Glasses",
    description:
      "Black round sunglasses with dark lenses and a thin metal bridge.",
    priceEgp: 1250,
    stock: 16,
    group: "Sunglasses",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Black round sunglasses with dark lenses on a pale background.",
  },
  {
    sourceId: 155,
    slug: "classic-sun-glasses",
    name: "Classic Sun Glasses",
    description:
      "Gold-tone aviator sunglasses with gradient blue-grey lenses and a double bridge.",
    priceEgp: 1450,
    stock: 14,
    group: "Sunglasses",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Gold-tone aviator sunglasses with gradient lenses on a pale background.",
  },
  {
    sourceId: 156,
    slug: "green-and-black-glasses",
    name: "Green and Black Glasses",
    description:
      "Round sunglasses with green lenses, a thin black frame and a keyhole bridge.",
    priceEgp: 1650,
    stock: 12,
    group: "Sunglasses",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Round green-lens sunglasses with thin black frame on a pale background.",
  },
  {
    sourceId: 158,
    slug: "clear-frame-star-sunglasses",
    name: "Clear Frame Star Sunglasses",
    description:
      "Clear geometric sunglasses with gold star details at the temples and lightly tinted lenses.",
    priceEgp: 1150,
    stock: 16,
    group: "Sunglasses",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Clear geometric sunglasses with gold star details on a pale background.",
  },
  {
    sourceId: 44,
    slug: "family-tree-photo-frame",
    name: "Family Tree Photo Frame",
    description:
      "A family-tree photo frame with small picture slots, leaf-shaped accents and a central Family plaque.",
    priceEgp: 2450,
    stock: 12,
    group: "Home & living",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Family-tree photo frame with small picture slots on a pale background.",
  },
  {
    sourceId: 45,
    slug: "house-showpiece-plant",
    name: "House Showpiece Plant",
    description:
      "An artificial house plant with dense green leaves in a black cup planter on a slim metal stand.",
    priceEgp: 3250,
    stock: 10,
    group: "Home & living",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Artificial house plant in a black cup planter on a slim metal stand.",
  },
  {
    sourceId: 46,
    slug: "plant-pot",
    name: "Plant Pot",
    description:
      "A rounded black plant pot filled with a leafy green plant, sized for a desk or shelf.",
    priceEgp: 1450,
    stock: 18,
    group: "Home & living",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Rounded black plant pot with a leafy green plant on a pale background.",
  },
  {
    sourceId: 49,
    slug: "black-aluminium-cup",
    name: "Black Aluminium Cup",
    description:
      "A black aluminium cup with a side handle and a matte finish, suited to coffee or tea.",
    priceEgp: 650,
    stock: 20,
    group: "Kitchen & dining",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Black aluminium cup with side handle on a pale background.",
  },
  {
    sourceId: 53,
    slug: "chopping-board",
    name: "Chopping Board",
    description:
      "A rectangular wooden chopping board with a rounded handle and a warm natural grain.",
    priceEgp: 1150,
    stock: 14,
    group: "Kitchen & dining",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Rectangular wooden chopping board with rounded handle on a pale background.",
  },
  {
    sourceId: 65,
    slug: "lunch-box",
    name: "Lunch Box",
    description:
      "A stacked stainless-steel lunch box with three tiers, side clips and a folding carry handle.",
    priceEgp: 1450,
    stock: 16,
    group: "Kitchen & dining",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Stacked stainless-steel lunch box with three tiers and carry handle.",
  },
  {
    sourceId: 67,
    slug: "mug-tree-stand",
    name: "Mug Tree Stand",
    description:
      "A wire mug tree stand with six branches, shown holding a set of red mugs.",
    priceEgp: 1250,
    stock: 14,
    group: "Kitchen & dining",
    vendorSlug: "nile-blossoms",
    imageIndex: 2,
    alt: "Wire mug tree stand holding red mugs on a pale background.",
  },
  {
    sourceId: 73,
    slug: "spice-rack",
    name: "Spice Rack",
    description:
      "A rotating spice rack with a dark metal frame and three filled glass jars.",
    priceEgp: 1350,
    stock: 12,
    group: "Kitchen & dining",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Rotating spice rack with three filled glass jars on a pale background.",
  },
  {
    sourceId: 75,
    slug: "tray",
    name: "Tray",
    description:
      "A rectangular serving tray with a warm wood-look finish and cut-out side handles.",
    priceEgp: 1650,
    stock: 16,
    group: "Kitchen & dining",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Rectangular serving tray with cut-out side handles on a pale background.",
  },
  {
    sourceId: 27,
    slug: "organic-wildflower-honey-jar",
    name: "Organic Wildflower Honey Jar",
    description:
      "A 250 ml jar of golden organic honey with a dark label and a simple paper seal, suited to a breakfast or housewarming gift.",
    priceEgp: 650,
    stock: 14,
    group: "Gourmet gifts",
    vendorSlug: "cairo-cocoa",
    imageIndex: 1,
    alt: "Glass jar of golden organic honey with a dark brown label.",
  },
  {
    sourceId: 34,
    slug: "nescafe-clasico-coffee-jar",
    name: "Nescafe Clasico Coffee Jar",
    description:
      "A jar of dark-roast instant coffee with a gold lid, presented as a simple gift for a coffee lover's pantry.",
    priceEgp: 850,
    stock: 12,
    group: "Coffee gifts",
    vendorSlug: "cairo-cocoa",
    imageIndex: 1,
    alt: "Nescafe Clasico dark roast instant coffee jar with a gold lid.",
  },
  {
    sourceId: 47,
    slug: "palm-tree-table-lamp",
    name: "Palm Tree Table Lamp",
    description:
      "A sculptural table lamp with a textured palm-trunk base, green leaf details and a warm fabric shade for a bedside or reading nook.",
    priceEgp: 3450,
    stock: 8,
    group: "Home & living",
    vendorSlug: "nile-blossoms",
    imageIndex: 1,
    alt: "Palm tree table lamp with a warm fabric shade and textured base.",
  },
  {
    sourceId: 190,
    slug: "iwc-ingenieur-automatic-steel-watch",
    name: "IWC Ingenieur Automatic Steel Watch",
    description:
      "A brushed steel bracelet watch with a black dial, applied baton markers and a round case, presented as a milestone or retirement gift.",
    priceEgp: 42500,
    stock: 5,
    group: "Executive gifts",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "IWC Ingenieur steel bracelet watch with a black dial.",
  },
  {
    sourceId: 97,
    slug: "rolex-datejust-two-tone-watch",
    name: "Rolex Datejust Two-Tone Watch",
    description:
      "A two-tone steel and gold-tone bracelet watch with a dark dial, Roman numerals and a fluted bezel for a classic executive gift.",
    priceEgp: 32500,
    stock: 5,
    group: "Executive gifts",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Rolex Datejust two-tone bracelet watch with a dark dial and Roman numerals.",
  },
  {
    sourceId: 98,
    slug: "rolex-submariner-diver-watch",
    name: "Rolex Submariner Diver Watch",
    description:
      "A steel diver-style watch with a black bezel, luminous hour markers and a date window, suited to a landmark corporate gift.",
    priceEgp: 39500,
    stock: 4,
    group: "Executive gifts",
    vendorSlug: "legacy-engraving",
    imageIndex: 1,
    alt: "Rolex Submariner steel diver watch with a black bezel and date window.",
  },
];

function webpDimensions(buffer) {
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

function countBy(products, key) {
  return products.reduce((counts, product) => {
    const value = product[key];
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function sameCounts(actual, expected) {
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => actual[key] === expected[key])
  );
}

async function main() {
  const raw = JSON.parse(await readFile(SOURCE_FILE, "utf8"));
  const sourceProducts = new Map(
    (raw.products ?? []).map((product) => [product.id, product]),
  );
  const snapshotStat = await stat(SOURCE_FILE);

  if (sourceProducts.size !== 194) {
    throw new Error(`Expected 194 DummyJSON snapshot products, found ${sourceProducts.size}.`);
  }
  if (new Set(CURATION.map((item) => item.sourceId)).size !== CURATION.length) {
    throw new Error("Curation contains a duplicate DummyJSON source ID.");
  }

  await mkdir(IMAGE_DIR, { recursive: true });

  const products = [];
  for (const [index, item] of CURATION.entries()) {
    const source = sourceProducts.get(item.sourceId);
    const categorySlug = CATEGORY_FOR_GROUP[item.group];
    if (!source) throw new Error(`DummyJSON product ${item.sourceId} is not in the snapshot.`);
    if (!categorySlug) throw new Error(`No category mapping for curation group ${item.group}.`);
    if (!source.images?.[item.imageIndex - 1]) {
      throw new Error(
        `${item.sourceId}: image index ${item.imageIndex} is outside ${source.images?.length ?? 0} image(s).`,
      );
    }

    const demoId = `gdj-${String(index + 1).padStart(3, "0")}`;
    const imagePath = `images/${demoId}.webp`;
    const absoluteImage = path.join(DATA_DIR, imagePath);
    const imageBuffer = await readFile(absoluteImage);
    const dimensions = webpDimensions(imageBuffer);
    if (!dimensions) throw new Error(`${imagePath}: not a readable WebP image.`);
    if (dimensions.width !== 1000 || dimensions.height !== 1000) {
      throw new Error(
        `${imagePath}: expected 1000x1000, got ${dimensions.width}x${dimensions.height}.`,
      );
    }
    if (imageBuffer.length < 10_000 || imageBuffer.length > 5 * 1024 * 1024) {
      throw new Error(`${imagePath}: image size is outside the 10 KB-5 MB range.`);
    }

    const imageUrl = source.images[item.imageIndex - 1];
    products.push({
      demoId,
      slug: `${SLUG_PREFIX}${item.slug}`,
      name: item.name,
      description: `${item.description} ${DEMO_DISCLOSURE}`,
      priceEgp: item.priceEgp,
      stock: item.stock,
      status: "active",
      isDemo: true,
      curationGroup: item.group,
      categorySlug,
      vendorSlug: item.vendorSlug,
      image: {
        path: imagePath,
        alt: item.alt,
        format: "webp",
        width: dimensions.width,
        height: dimensions.height,
        byteSize: imageBuffer.length,
        sourceImageIndex: item.imageIndex,
        sourceUrl: imageUrl,
        license: "DummyJSON sample image; image-specific rights are not separately stated.",
      },
      source: {
        type: "dummyjson",
        provider: "DummyJSON",
        productId: source.id,
        title: source.title,
        category: source.category,
        brand: source.brand ?? null,
        sourcePriceUsd: source.price,
        sourceUrl: `https://dummyjson.com/products/${source.id}`,
        thumbnailUrl: source.thumbnail,
        images: source.images,
        selectedImageUrl: imageUrl,
        license:
          "DummyJSON sample data; repository is MIT-licensed but image-specific rights are not separately stated.",
        note: "Brand, title and image are DummyJSON sample metadata. No vendor affiliation, authenticity or availability claim is made. Source stock, ratings and reviews were not imported.",
      },
    });
  }

  const generatedAt = new Date().toISOString();
  const groupDistribution = countBy(products, "curationGroup");
  const vendorDistribution = countBy(products, "vendorSlug");
  const expectedGroups = {
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
  const expectedVendors = {
    "nile-blossoms": 23,
    "legacy-engraving": 21,
    "cairo-cocoa": 2,
  };
  const expectedCategories = {
    "personalized-gifts": 31,
    "gift-boxes": 11,
    "chocolates-sweets": 1,
    "corporate-gifts": 3,
  };
  const categoryDistribution = countBy(products, "categorySlug");
  if (!sameCounts(groupDistribution, expectedGroups)) {
    throw new Error(`Unexpected group distribution: ${JSON.stringify(groupDistribution)}`);
  }
  if (!sameCounts(vendorDistribution, expectedVendors)) {
    throw new Error(`Unexpected vendor distribution: ${JSON.stringify(vendorDistribution)}`);
  }
  if (!sameCounts(categoryDistribution, expectedCategories)) {
    throw new Error(`Unexpected category distribution: ${JSON.stringify(categoryDistribution)}`);
  }

  const dataset = {
    datasetId: DATASET_ID,
    version: DATASET_VERSION,
    generatedAt,
    currency: "EGP",
    priceNote:
      "Illustrative demo prices only; not vendor quotations or verified Egyptian market prices.",
    demoDisclosure:
      "DummyJSON sample data is used for layout and visual demos only. Brand names, product titles and images are not vendor-owned listings, and no affiliation or authenticity is claimed.",
    categoryMapping: {
      status: "mapped-existing-categories",
      note: CATEGORY_NOTE,
      groupMapping: CATEGORY_FOR_GROUP,
    },
    imagePolicy: IMAGE_POLICY,
    products,
  };

  const manifest = {
    datasetId: DATASET_ID,
    version: DATASET_VERSION,
    generatedAt,
    productCount: products.length,
    targetDistribution: expectedGroups,
    actualDistribution: groupDistribution,
    vendorDistribution,
    categoryDistribution,
    categoryMapping: dataset.categoryMapping,
    source: {
      provider: "DummyJSON",
      api: "https://dummyjson.com/products?limit=0",
      docs: "https://dummyjson.com/docs/products",
      snapshot: "source/dummyjson-products.json",
      snapshotCapturedAt: snapshotStat.mtime.toISOString(),
      totalProducts: sourceProducts.size,
      selectedProducts: products.length,
      excludedProducts: sourceProducts.size - products.length,
      license:
        "DummyJSON sample data; repository is MIT-licensed but image-specific rights are not separately stated.",
    },
    imageSummary: {
      count: products.length,
      format: "WebP",
      width: 1000,
      height: 1000,
      localOnly: true,
      thirdPartyAssets: products.length,
      totalBytes: products.reduce((total, product) => total + product.image.byteSize, 0),
    },
    reports: {
      contactSheet: "contact-sheet.jpg",
      exclusions: "exclusions.md",
      exclusionsJson: "exclusions.json",
    },
    importer: {
      slugPrefix: SLUG_PREFIX,
      demoFlag: true,
      categorySlugs: Object.keys(expectedCategories),
    },
  };

  await writeFile(
    path.join(DATA_DIR, "products.json"),
    `${JSON.stringify(dataset, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(DATA_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `Wrote ${products.length} products to data/demo-catalog-dummyjson (${manifest.imageSummary.totalBytes} image bytes).`,
  );
  console.log("Groups:", groupDistribution);
  console.log("Vendors:", vendorDistribution);
  console.log("Categories:", categoryDistribution);
}

main().catch((error) => {
  console.error(`DummyJSON demo dataset build failed: ${error.message}`);
  process.exit(1);
});
