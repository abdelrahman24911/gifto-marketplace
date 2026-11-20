#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT_DIR = path.join(ROOT, "data/demo-catalog");
const DATASET_ID = "gifto-demo-catalog";
const DATASET_VERSION = 1;
const PREFIX = "demo-catalog-";
const DUMMYJSON_URL = "https://dummyjson.com/products?limit=200&select=id,title,category,description";

const CANDIDATE_IDS = new Set([44, 45, 46, 47, 67, 75, 155, 172, 182]);

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function product({
  name,
  description,
  priceEgp,
  stock,
  collection,
  categorySlug,
  vendorSlug,
  motif,
  variant,
  candidateId = null,
}) {
  return {
    name,
    description,
    priceEgp,
    stock,
    collection,
    categorySlug,
    vendorSlug,
    motif,
    variant,
    candidateId,
  };
}

const PRODUCTS = [
  product({
    name: "Amber Rose & Eucalyptus Bouquet",
    description: "A hand-tied bouquet of amber roses, eucalyptus and dried grasses, wrapped in warm kraft paper for a soft, lasting gift.",
    priceEgp: 780,
    stock: 18,
    collection: "Flowers",
    categorySlug: "flowers",
    vendorSlug: "nile-blossoms",
    motif: "bouquet",
    variant: 0,
  }),
  product({
    name: "Apricot Peony Posy",
    description: "A compact posy of apricot peonies and cream filler flowers, tied by hand for birthdays, thank-yous and new beginnings.",
    priceEgp: 850,
    stock: 14,
    collection: "Flowers",
    categorySlug: "flowers",
    vendorSlug: "nile-blossoms",
    motif: "bouquet",
    variant: 1,
  }),
  product({
    name: "Ivory Calla Lily Vase",
    description: "Sculptural ivory calla lilies arranged in a low ceramic vase, ready to place on a console or dining table.",
    priceEgp: 920,
    stock: 12,
    collection: "Flowers",
    categorySlug: "flowers",
    vendorSlug: "nile-blossoms",
    motif: "bouquet",
    variant: 2,
  }),
  product({
    name: "Golden Sunflower Market Wrap",
    description: "A generous market bunch of golden sunflowers with seasonal greenery, wrapped in recycled paper and tied with twine.",
    priceEgp: 540,
    stock: 26,
    collection: "Flowers",
    categorySlug: "flowers",
    vendorSlug: "nile-blossoms",
    motif: "bouquet",
    variant: 3,
  }),
  product({
    name: "Terracotta Rose Bowl",
    description: "Garden roses in peach and terracotta tones, arranged in a reusable stoneware bowl with moss and trailing greenery.",
    priceEgp: 740,
    stock: 15,
    collection: "Flowers",
    categorySlug: "flowers",
    vendorSlug: "nile-blossoms",
    motif: "bouquet",
    variant: 4,
  }),
  product({
    name: "Gardenia & Jasmine Hand-Tied",
    description: "Fragrant gardenias and jasmine stems gathered into a delicate hand-tied bouquet with soft white ribbon.",
    priceEgp: 620,
    stock: 20,
    collection: "Flowers",
    categorySlug: "flowers",
    vendorSlug: "nile-blossoms",
    motif: "bouquet",
    variant: 5,
  }),
  product({
    name: "Coral Tulip Medley",
    description: "A bright mix of coral and cream tulips with sculptural foliage, wrapped simply so the flowers stay the focus.",
    priceEgp: 560,
    stock: 24,
    collection: "Flowers",
    categorySlug: "flowers",
    vendorSlug: "nile-blossoms",
    motif: "bouquet",
    variant: 6,
  }),
  product({
    name: "Midnight Orchid Arrangement",
    description: "Deep plum orchids and dark foliage arranged in a tall ceramic vessel for an elegant, dramatic gift.",
    priceEgp: 1150,
    stock: 10,
    collection: "Flowers",
    categorySlug: "flowers",
    vendorSlug: "nile-blossoms",
    motif: "bouquet",
    variant: 7,
  }),
  product({
    name: "Pistachio & Rose Chocolate Box",
    description: "Pistachio pralines and rose-cream bonbons arranged in a slim gift box with a dusty-pink sleeve.",
    priceEgp: 420,
    stock: 30,
    collection: "Chocolates & Sweets",
    categorySlug: "chocolates-sweets",
    vendorSlug: "cairo-cocoa",
    motif: "chocolate",
    variant: 0,
  }),
  product({
    name: "Sea Salt Caramel Truffles",
    description: "A box of smooth caramel truffles finished with sea salt and dark chocolate curls, made for sharing.",
    priceEgp: 360,
    stock: 40,
    collection: "Chocolates & Sweets",
    categorySlug: "chocolates-sweets",
    vendorSlug: "cairo-cocoa",
    motif: "chocolate",
    variant: 1,
  }),
  product({
    name: "Dark Chocolate Date Bites",
    description: "Soft medjool dates filled with almond butter and coated in dark chocolate, packed in a reusable tin.",
    priceEgp: 310,
    stock: 36,
    collection: "Chocolates & Sweets",
    categorySlug: "chocolates-sweets",
    vendorSlug: "cairo-cocoa",
    motif: "chocolate",
    variant: 2,
  }),
  product({
    name: "Hazelnut Praline Selection",
    description: "Crunchy hazelnut pralines and silky gianduja squares in an assortment box tied with a copper ribbon.",
    priceEgp: 480,
    stock: 24,
    collection: "Chocolates & Sweets",
    categorySlug: "chocolates-sweets",
    vendorSlug: "cairo-cocoa",
    motif: "chocolate",
    variant: 3,
  }),
  product({
    name: "Milk Chocolate Covered Dates",
    description: "Plump dates dipped in milk chocolate and finished with a little orange zest, a familiar Egyptian flavour in a giftable box.",
    priceEgp: 330,
    stock: 32,
    collection: "Chocolates & Sweets",
    categorySlug: "chocolates-sweets",
    vendorSlug: "cairo-cocoa",
    motif: "chocolate",
    variant: 4,
  }),
  product({
    name: "Orange Blossom Chocolate Bark",
    description: "Thin shards of dark chocolate studded with orange blossom, pistachio and toasted sesame in a kraft pouch.",
    priceEgp: 280,
    stock: 45,
    collection: "Chocolates & Sweets",
    categorySlug: "chocolates-sweets",
    vendorSlug: "cairo-cocoa",
    motif: "chocolate",
    variant: 5,
  }),
  product({
    name: "Mini Macaron Gift Box (12)",
    description: "Twelve bite-size macarons in pistachio, rose, chocolate and vanilla, arranged in a windowed gift box.",
    priceEgp: 390,
    stock: 25,
    collection: "Chocolates & Sweets",
    categorySlug: "chocolates-sweets",
    vendorSlug: "cairo-cocoa",
    motif: "chocolate",
    variant: 6,
  }),
  product({
    name: "Saffron & Almond Chocolate Bar",
    description: "A thick dark chocolate bar with toasted almonds and a warm saffron finish, wrapped in gold foil.",
    priceEgp: 240,
    stock: 50,
    collection: "Chocolates & Sweets",
    categorySlug: "chocolates-sweets",
    vendorSlug: "cairo-cocoa",
    motif: "chocolate",
    variant: 7,
  }),
  product({
    name: "Chocolate-Dipped Strawberries (9)",
    description: "Nine fresh strawberries dipped in dark and white chocolate, packed in a chilled gift box for same-day gifting.",
    priceEgp: 450,
    stock: 18,
    collection: "Chocolates & Sweets",
    categorySlug: "chocolates-sweets",
    vendorSlug: "cairo-cocoa",
    motif: "chocolate",
    variant: 8,
  }),
  product({
    name: "Celebration Chocolate Stack",
    description: "A three-tier stack of truffles, pralines and chocolate-covered nuts, tied with ribbon for a centrepiece gift.",
    priceEgp: 950,
    stock: 12,
    collection: "Chocolates & Sweets",
    categorySlug: "chocolates-sweets",
    vendorSlug: "cairo-cocoa",
    motif: "chocolate",
    variant: 9,
  }),
  product({
    name: "Family Tree Photo Frame",
    description: "A multi-opening oak frame for family photos, with a clean engraved border and a stand for shelf display.",
    priceEgp: 390,
    stock: 20,
    collection: "Personalized Gifts",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "keepsake",
    variant: 0,
    candidateId: 44,
  }),
  product({
    name: "Initial-Stamped Travel Journal",
    description: "A refillable leather journal with a single initial stamped on the cover, a ribbon marker and a pocket for tickets.",
    priceEgp: 460,
    stock: 18,
    collection: "Personalized Gifts",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "keepsake",
    variant: 1,
  }),
  product({
    name: "Personalized Star Map Print",
    description: "A framed star map for a meaningful date and place, printed on textured paper with a short dedication beneath.",
    priceEgp: 520,
    stock: 15,
    collection: "Personalized Gifts",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "keepsake",
    variant: 2,
  }),
  product({
    name: "Custom Name Necklace Card",
    description: "A delicate name necklace mounted on a printed card, ready to give for birthdays, graduations and new chapters.",
    priceEgp: 580,
    stock: 14,
    collection: "Personalized Gifts",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "jewelry",
    variant: 1,
  }),
  product({
    name: "Engraved Brass Keyring",
    description: "A solid brass keyring with a short engraved message or set of initials, presented in a cotton pouch.",
    priceEgp: 220,
    stock: 40,
    collection: "Personalized Gifts",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "keepsake",
    variant: 3,
  }),
  product({
    name: "Walnut Recipe Box",
    description: "A walnut recipe box with tabbed cards and a personalised lid, made for family recipes and kitchen keepsakes.",
    priceEgp: 650,
    stock: 12,
    collection: "Personalized Gifts",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "keepsake",
    variant: 4,
  }),
  product({
    name: "Monogrammed Card Case",
    description: "A slim leather card case with a blind-debossed monogram, packed in a small gift box.",
    priceEgp: 340,
    stock: 28,
    collection: "Personalized Gifts",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "keepsake",
    variant: 5,
  }),
  product({
    name: "Our Story Photo Album",
    description: "A linen-covered photo album with a personalised cover title and thick pages for marking anniversaries and family milestones.",
    priceEgp: 720,
    stock: 10,
    collection: "Personalized Gifts",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "keepsake",
    variant: 6,
  }),
  product({
    name: "Golden Celebration Gift Box",
    description: "A ready-wrapped celebration box with chocolate, a small candle and a handwritten-style card, finished with gold ribbon.",
    priceEgp: 780,
    stock: 16,
    collection: "Gift Boxes",
    categorySlug: "gift-boxes",
    vendorSlug: "cairo-cocoa",
    motif: "giftbox",
    variant: 0,
  }),
  product({
    name: "Coffee & Date Hamper",
    description: "A morning-gift hamper with ground coffee, stuffed dates and a small ceramic cup, packed in a reusable tray.",
    priceEgp: 640,
    stock: 20,
    collection: "Gift Boxes",
    categorySlug: "gift-boxes",
    vendorSlug: "cairo-cocoa",
    motif: "giftbox",
    variant: 1,
  }),
  product({
    name: "Petit Four Tea Box",
    description: "A tea-time box of petit fours, shortbread and a pouch of loose-leaf tea, arranged in a compartmented gift tray.",
    priceEgp: 520,
    stock: 22,
    collection: "Gift Boxes",
    categorySlug: "gift-boxes",
    vendorSlug: "cairo-cocoa",
    motif: "giftbox",
    variant: 2,
  }),
  product({
    name: "Ramadan Sharing Box",
    description: "A generous sharing box of dates, nuts, halva bites and chocolate, designed for iftar tables and family visits.",
    priceEgp: 890,
    stock: 14,
    collection: "Gift Boxes",
    categorySlug: "gift-boxes",
    vendorSlug: "cairo-cocoa",
    motif: "giftbox",
    variant: 3,
  }),
  product({
    name: "Keepsake & Candle Gift Set",
    description: "A small engraved keepsake dish paired with a cedar-scented candle, boxed with tissue and a ribbon.",
    priceEgp: 850,
    stock: 12,
    collection: "Gift Boxes",
    categorySlug: "gift-boxes",
    vendorSlug: "legacy-engraving",
    motif: "giftbox",
    variant: 4,
  }),
  product({
    name: "New Home Wrapped Gift Box",
    description: "A housewarming box with a ceramic vase, tea towel and a small brass keyring, wrapped in warm neutral paper.",
    priceEgp: 690,
    stock: 18,
    collection: "Gift Boxes",
    categorySlug: "gift-boxes",
    vendorSlug: "legacy-engraving",
    motif: "giftbox",
    variant: 5,
  }),
  product({
    name: "Botanical Bath & Bloom Box",
    description: "A calm-at-home box with botanical bath salts, a beeswax candle and a small dried-flower posy.",
    priceEgp: 760,
    stock: 15,
    collection: "Gift Boxes",
    categorySlug: "gift-boxes",
    vendorSlug: "legacy-engraving",
    motif: "giftbox",
    variant: 6,
  }),
  product({
    name: "Thank You Kraft Gift Box",
    description: "A simple kraft gift box filled with chocolate bites and a blank thank-you card, ready to personalise by hand.",
    priceEgp: 430,
    stock: 30,
    collection: "Gift Boxes",
    categorySlug: "gift-boxes",
    vendorSlug: "legacy-engraving",
    motif: "giftbox",
    variant: 7,
  }),
  product({
    name: "Amber Oud Eau de Parfum 50 ml",
    description: "A warm amber and oud fragrance with a soft woody finish, presented in a simple glass bottle with a gold cap.",
    priceEgp: 1250,
    stock: 12,
    collection: "Perfumes & Accessories",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "perfume",
    variant: 0,
  }),
  product({
    name: "Jasmine Musk Eau de Parfum 50 ml",
    description: "A light jasmine and white musk fragrance with a clean floral trail, suited to everyday gifting.",
    priceEgp: 1150,
    stock: 14,
    collection: "Perfumes & Accessories",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "perfume",
    variant: 1,
  }),
  product({
    name: "Citrus Neroli Eau de Toilette 75 ml",
    description: "A bright citrus and neroli scent with a soft green finish, bottled in a tall clear flacon.",
    priceEgp: 980,
    stock: 16,
    collection: "Perfumes & Accessories",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "perfume",
    variant: 2,
  }),
  product({
    name: "Crystal Drop Earrings",
    description: "Faceted green crystal drops on slim gold-tone hooks, presented on a small jewellery card.",
    priceEgp: 420,
    stock: 22,
    collection: "Perfumes & Accessories",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "jewelry",
    variant: 0,
    candidateId: 182,
  }),
  product({
    name: "Woven Leather Mini Bag",
    description: "A compact woven leather bag with a short handle and a removable crossbody strap, wrapped in a cotton dust bag.",
    priceEgp: 890,
    stock: 10,
    collection: "Perfumes & Accessories",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "bag",
    variant: 0,
    candidateId: 172,
  }),
  product({
    name: "Tortoise-Shell Sunglasses",
    description: "Classic tortoise-shell frames with UV-protective lenses, packed in a soft folding case.",
    priceEgp: 540,
    stock: 20,
    collection: "Perfumes & Accessories",
    categorySlug: "personalized-gifts",
    vendorSlug: "legacy-engraving",
    motif: "sunglasses",
    variant: 0,
    candidateId: 155,
  }),
  product({
    name: "Cuddle Bear with Bow",
    description: "A soft caramel bear with a stitched paw pad and a removable linen bow, sized for a first birthday or nursery gift.",
    priceEgp: 480,
    stock: 20,
    collection: "Toys & Cute Gifts",
    categorySlug: "toys-kids",
    vendorSlug: "alex-toy-corner",
    motif: "toy",
    variant: 0,
  }),
  product({
    name: "Sleepy Sloth Plush",
    description: "A long-limbed sloth plush in soft grey fleece, designed for hugging and quiet-time play.",
    priceEgp: 360,
    stock: 30,
    collection: "Toys & Cute Gifts",
    categorySlug: "toys-kids",
    vendorSlug: "alex-toy-corner",
    motif: "toy",
    variant: 1,
  }),
  product({
    name: "Wooden Rainbow Stacker",
    description: "A pastel wooden stacking toy with graduated arches, sanded smooth for small hands and open-ended play.",
    priceEgp: 420,
    stock: 22,
    collection: "Toys & Cute Gifts",
    categorySlug: "toys-kids",
    vendorSlug: "alex-toy-corner",
    motif: "toy",
    variant: 2,
  }),
  product({
    name: "Space Explorer Play Set",
    description: "A small wooden rocket, astronaut figure and planet puzzle in a carry box for imaginative play.",
    priceEgp: 650,
    stock: 14,
    collection: "Toys & Cute Gifts",
    categorySlug: "toys-kids",
    vendorSlug: "alex-toy-corner",
    motif: "toy",
    variant: 3,
  }),
  product({
    name: "Bunny Night-Light",
    description: "A soft bunny-shaped night-light with a warm low glow and a simple tap control, boxed for gifting.",
    priceEgp: 390,
    stock: 18,
    collection: "Toys & Cute Gifts",
    categorySlug: "toys-kids",
    vendorSlug: "alex-toy-corner",
    motif: "toy",
    variant: 4,
  }),
  product({
    name: "Puzzle Cube Gift Box",
    description: "A colourful twist puzzle packed in a small gift box with a card of beginner patterns.",
    priceEgp: 280,
    stock: 35,
    collection: "Toys & Cute Gifts",
    categorySlug: "toys-kids",
    vendorSlug: "alex-toy-corner",
    motif: "toy",
    variant: 5,
  }),
  product({
    name: "Cedar & Fig Candle",
    description: "A soy-wax candle in a reusable amber glass, scented with cedar, fig leaf and a little warm spice.",
    priceEgp: 380,
    stock: 24,
    collection: "Home & Lifestyle",
    categorySlug: "gift-boxes",
    vendorSlug: "nile-blossoms",
    motif: "home",
    variant: 0,
  }),
  product({
    name: "Ceramic Bud Vase Duo",
    description: "Two small matte ceramic vases in sand and cream, boxed as a pair for a windowsill or bedside table.",
    priceEgp: 450,
    stock: 18,
    collection: "Home & Lifestyle",
    categorySlug: "gift-boxes",
    vendorSlug: "nile-blossoms",
    motif: "home",
    variant: 1,
    candidateId: 46,
  }),
  product({
    name: "Ribbed Ceramic Table Lamp",
    description: "A compact ribbed ceramic lamp with a linen shade, sized for a bedside table or reading corner.",
    priceEgp: 780,
    stock: 12,
    collection: "Home & Lifestyle",
    categorySlug: "gift-boxes",
    vendorSlug: "nile-blossoms",
    motif: "home",
    variant: 2,
    candidateId: 47,
  }),
  product({
    name: "Faux Olive Tree in Pot",
    description: "A softly leafed faux olive tree in a weighted stone pot, ready to style a hallway or bright corner.",
    priceEgp: 560,
    stock: 16,
    collection: "Home & Lifestyle",
    categorySlug: "gift-boxes",
    vendorSlug: "nile-blossoms",
    motif: "home",
    variant: 3,
    candidateId: 45,
  }),
  product({
    name: "Mug Tree & Tea Set",
    description: "A wooden mug tree paired with two stoneware cups and a small tin of tea, boxed as a housewarming set.",
    priceEgp: 340,
    stock: 25,
    collection: "Home & Lifestyle",
    categorySlug: "gift-boxes",
    vendorSlug: "nile-blossoms",
    motif: "home",
    variant: 4,
    candidateId: 67,
  }),
  product({
    name: "Marble Effect Serving Tray",
    description: "A lightweight marble-effect tray with brass handles, useful for coffee, candles or a small arrangement.",
    priceEgp: 490,
    stock: 20,
    collection: "Home & Lifestyle",
    categorySlug: "gift-boxes",
    vendorSlug: "nile-blossoms",
    motif: "home",
    variant: 5,
    candidateId: 75,
  }),
];

function normalizeProducts(candidates) {
  const ids = new Set();
  const slugs = new Set();

  return PRODUCTS.map((item, index) => {
    const demoId = `gdc-${String(index + 1).padStart(3, "0")}`;
    const slug = `${PREFIX}${slugify(item.name)}`;
    if (ids.has(demoId)) throw new Error(`Duplicate demo id: ${demoId}`);
    if (slugs.has(slug)) throw new Error(`Duplicate slug: ${slug}`);
    ids.add(demoId);
    slugs.add(slug);

    const candidate = item.candidateId ? candidates.get(item.candidateId) : null;
    if (item.candidateId && !candidate) {
      throw new Error(`DummyJSON candidate ${item.candidateId} was not found`);
    }

    return {
      demoId,
      slug,
      name: item.name,
      description: item.description,
      priceEgp: item.priceEgp,
      stock: item.stock,
      status: "active",
      isDemo: true,
      collection: item.collection,
      categorySlug: item.categorySlug,
      vendorSlug: item.vendorSlug,
      image: {
        path: `images/${demoId}.jpg`,
        alt: `Stylised studio illustration of ${item.name} for the Gifto demo catalogue.`,
        motif: item.motif,
        variant: item.variant,
        source: "Gifto original generated artwork",
        license: "Original artwork generated for this repository; no third-party image assets.",
      },
      source: candidate
        ? {
            type: "dummyjson-candidate",
            dataset: "DummyJSON",
            productId: candidate.id,
            title: candidate.title,
            category: candidate.category,
            url: `https://dummyjson.com/products/${candidate.id}`,
            license: "MIT (DummyJSON repository)",
            imageUsage: "Candidate metadata only; no DummyJSON image was downloaded or used.",
          }
        : {
            type: "gifto-original",
            dataset: "Gifto demo catalogue brief",
            license: "Original demo content",
            note: "Product name and description written for this demo catalogue; no brand or vendor claim.",
          },
    };
  });
}

const OCCASION_PROPOSALS = [
  {
    slug: "graduation",
    name: "Graduation",
    rationale:
      "A milestone assortment mixing keepsakes, flowers, a celebration box and a scent for the next chapter.",
    picks: [
      ["gdc-020", "A practical keepsake for a graduate's next trip and a natural place for an initial."],
      ["gdc-021", "A date-and-place print that makes the milestone personal without requiring a specific school."],
      ["gdc-022", "A small piece of jewellery with the graduate's name, easy to give alongside a card."],
      ["gdc-023", "A lower-price engraved keepsake for a group gift or a meaningful small token."],
      ["gdc-026", "A photo album for family celebrations and the years leading to graduation."],
      ["gdc-025", "A useful monogrammed accessory for a first job, internship or university placement."],
      ["gdc-027", "A ready-wrapped celebration box for a family or group contribution."],
      ["gdc-018", "A shareable chocolate centrepiece for a graduation gathering."],
      ["gdc-004", "A bright, celebratory flower option at a mid-range price."],
      ["gdc-007", "A softer flower alternative for graduates who prefer coral and cream tones."],
      ["gdc-037", "A light citrus scent that works as a unisex milestone gift."],
      ["gdc-050", "A new-home gift for graduates moving into their first place."],
    ],
  },
  {
    slug: "ramdan-night",
    name: "Ramadan Night",
    rationale:
      "A hosting-led assortment centred on dates, chocolate, coffee, table styling and a quiet evening at home.",
    picks: [
      ["gdc-030", "The anchor sharing box, designed for iftar tables and family visits."],
      ["gdc-028", "A morning-to-evening hamper with coffee, dates and a cup for hosting."],
      ["gdc-009", "A rose-and-pistachio chocolate box that suits the seasonal flavour palette."],
      ["gdc-011", "Date bites in a reusable tin, a familiar Ramadan sweet with a modern finish."],
      ["gdc-013", "Milk-chocolate dates at an accessible price for larger family groups."],
      ["gdc-016", "A saffron-and-almond bar for a smaller, considered food gift."],
      ["gdc-014", "A light chocolate bark with orange blossom and pistachio for sharing."],
      ["gdc-012", "A praline selection for a more classic chocolate gift."],
      ["gdc-047", "A cedar-and-fig candle for the evening table after iftar."],
      ["gdc-051", "A tea set for the quiet part of the evening and a reusable household gift."],
      ["gdc-048", "A pair of bud vases for a simple iftar table centrepiece."],
      ["gdc-035", "A warm amber-oud fragrance for an Eid-adjacent or hosting gift."],
    ],
  },
];

function buildOccasionProposal(products) {
  const byDemoId = new Map(products.map((product) => [product.demoId, product]));
  return {
    status: "proposed-not-applied",
    datasetId: DATASET_ID,
    datasetVersion: DATASET_VERSION,
    generatedAt: new Date().toISOString(),
    hostedPreState:
      "Read-only snapshot recorded on 2026-11-16: both occasions active, match_mode=hybrid, 0 manual products, 0 category rules, 0 tag rules.",
    applyPolicy:
      "Do not apply without owner approval. This file is a proposal only; no hosted occasion_products row was inserted or changed.",
    occasions: OCCASION_PROPOSALS.map((occasion) => ({
      slug: occasion.slug,
      name: occasion.name,
      rationale: occasion.rationale,
      picks: occasion.picks.map(([demoId, reason], index) => {
        const product = byDemoId.get(demoId);
        if (!product) throw new Error(`Occasion proposal references missing product: ${demoId}`);
        return {
          sortOrder: index + 1,
          demoId: product.demoId,
          slug: product.slug,
          name: product.name,
          vendorSlug: product.vendorSlug,
          priceEgp: product.priceEgp,
          reason,
        };
      }),
    })),
  };
}

function countBy(products, key) {
  return products.reduce((counts, product) => {
    counts[product[key]] = (counts[product[key]] ?? 0) + 1;
    return counts;
  }, {});
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const response = await fetch(DUMMYJSON_URL, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`DummyJSON fetch failed: HTTP ${response.status}`);
  const payload = await response.json();
  const candidates = new Map(
    (payload.products ?? [])
      .filter((item) => CANDIDATE_IDS.has(item.id))
      .map((item) => [item.id, item]),
  );

  const products = normalizeProducts(candidates);
  const dataset = {
    datasetId: DATASET_ID,
    version: DATASET_VERSION,
    generatedAt: new Date().toISOString(),
    currency: "EGP",
    priceNote: "Illustrative demo prices only; not vendor quotations or verified Egyptian market prices.",
    imagePolicy: "All product images are original local demo artwork; third-party product images are not used.",
    importer: {
      slugPrefix: PREFIX,
      demoFlag: true,
    },
    products,
  };

  const manifest = {
    datasetId: DATASET_ID,
    version: DATASET_VERSION,
    productCount: products.length,
    targetDistribution: {
      Flowers: 8,
      "Chocolates & Sweets": 10,
      "Personalized Gifts": 8,
      "Gift Boxes": 8,
      "Perfumes & Accessories": 6,
      "Toys & Cute Gifts": 6,
      "Home & Lifestyle": 6,
    },
    actualDistribution: countBy(products, "collection"),
    categoryDistribution: countBy(products, "categorySlug"),
    vendorDistribution: countBy(products, "vendorSlug"),
    candidateSource: {
      provider: "DummyJSON",
      api: "https://dummyjson.com/products",
      license: "MIT",
      candidateCount: products.filter((product) => product.source.type === "dummyjson-candidate").length,
      note: "DummyJSON was used to shortlist generic gift concepts. Its product images were excluded because image-specific licensing is not separately stated; all images are original local artwork.",
    },
    imageSummary: {
      count: products.length,
      format: "JPEG",
      localOnly: true,
      thirdPartyAssets: 0,
    },
    occasionProposal: "occasions.proposed.json",
  };

  const occasionProposal = buildOccasionProposal(products);

  await writeFile(path.join(OUT_DIR, "products.json"), `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  await writeFile(path.join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(OUT_DIR, "occasions.proposed.json"),
    `${JSON.stringify(occasionProposal, null, 2)}\n`,
    "utf8",
  );
  console.log(`Wrote ${products.length} products to ${path.relative(ROOT, OUT_DIR)}`);
  console.log("Distribution:", manifest.actualDistribution);
  console.log(
    "Occasion proposal:",
    occasionProposal.occasions.map((occasion) => `${occasion.slug}=${occasion.picks.length}`).join(", "),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
