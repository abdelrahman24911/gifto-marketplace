#!/usr/bin/env node
// Gifto Marketplace — demo catalog seeder (idempotent).
//
// Seeds clearly-marked demo data into the linked Supabase project:
//   * the 8 platform categories (same values as supabase/seed.sql)
//   * 6 demo vendors (5 active + 1 pending review), all flagged is_demo
//   * one owner auth account per vendor (@demo.gifto.example — reserved TLD,
//     can never receive real mail). New accounts get a random password that is
//     never printed; run `npm run demo:passwords` locally to rotate and reveal
//     fresh credentials in your own terminal when you need to sign in.
//   * 36 products across the vendors with EGP prices and realistic stock
//   * one generated gradient hero image per product in the product-images
//     bucket (placeholder art — replace with real photos via the vendor UI)
//
// Safety: service-role only; never touches status/commission on re-run (the
// vendors_guard_finance_fields trigger rejects those UPDATEs even for service
// role); only writes rows flagged is_demo or the shared platform categories.
// Cleanup: scripts/cleanup-demo.mjs targets is_demo rows + the demo email
// domain only. See docs/DEMO_DATA_GUIDE.md.

import crypto from "node:crypto";
import zlib from "node:zlib";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

try {
  process.loadEnvFile(".env.local");
} catch {
  // fall back to whatever is already in the environment
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const storage = db.storage.from("product-images");
const DEMO_EMAIL_DOMAIN = "@demo.gifto.example";

// ---------------------------------------------------------------------------
// Minimal PNG encoder (solid diagonal gradient placeholders — no external
// assets, no network fetches; deflate keeps an 800x800 image well under the
// bucket's 5 MB limit).
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function gradientPng(size, [r1, g1, b1], [r2, g2, b2]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    const ty = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const t = (x / (size - 1) + ty) / 2;
      raw[o++] = Math.round(r1 + (r2 - r1) * t);
      raw[o++] = Math.round(g1 + (g2 - g1) * t);
      raw[o++] = Math.round(b1 + (b2 - b1) * t);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

// Per-category placeholder palettes (brand-adjacent berry/gold/ink family).
const CATEGORY_COLORS = {
  flowers: ["#f43f5e", "#7f1d3a"],
  "chocolates-sweets": ["#8b5e3c", "#3e2723"],
  "cakes-baked-goods": ["#d9a066", "#8a5a2b"],
  "gift-boxes": ["#b91c4a", "#c9922e"],
  "personalized-gifts": ["#64748b", "#334155"],
  "toys-kids": ["#fbbf24", "#d97706"],
  occasions: ["#d4a017", "#9f1239"],
  "corporate-gifts": ["#475569", "#1e293b"],
};

// ---------------------------------------------------------------------------
// Dataset (all fictional; EGP prices in piastres; phones are placeholders)
// ---------------------------------------------------------------------------

const CATEGORIES = [
  ["Gift Boxes", "gift-boxes", "Ready-made boxes for any occasion.", 10],
  ["Flowers", "flowers", "Bouquets and arrangements.", 20],
  ["Chocolates & Sweets", "chocolates-sweets", "Confectionery and dessert gifts.", 30],
  ["Cakes & Baked Goods", "cakes-baked-goods", "Cakes, cookies and dessert trays.", 40],
  ["Personalized Gifts", "personalized-gifts", "Custom names, photos and messages.", 50],
  ["Toys & Kids", "toys-kids", "Gifts for children.", 60],
  ["Occasions", "occasions", "Birthdays, weddings, graduations and holidays.", 70],
  ["Corporate Gifts", "corporate-gifts", "Bulk and branded gifting for businesses.", 80],
];

const VENDORS = [
  {
    slug: "nile-blossoms",
    name: "Nile Blossoms",
    status: "active",
    commission_rate: 0.12,
    city: "Alexandria",
    governorate: "Alexandria",
    delivery_coverage: { governorates: ["alexandria"], areas: [] },
    contact_phone: "+20 100 000 0001",
    owner_email: `nile-blossoms${DEMO_EMAIL_DOMAIN}`,
    description:
      "A neighbourhood florist on the Alexandria corniche crafting hand-tied bouquets, vase arrangements and dried-flower pieces for birthdays, graduations and just-because moments. Same-day delivery across Alexandria.",
    products: [
      { slug: "classic-red-rose-bouquet", name: "Classic Red Rose Bouquet", category: "flowers", price_egp: 450, stock: 24, description: "A dozen long-stem red roses hand-tied with eucalyptus and kraft wrap. Our signature birthday and anniversary bouquet." },
      { slug: "white-lily-arrangement", name: "White Lily & Gypsophila Arrangement", category: "flowers", price_egp: 520, stock: 15, description: "Serene white lilies balanced with clouds of gypsophila in a glass vase. A graceful choice for congratulations and new homes." },
      { slug: "sunflower-bright-bunch", name: "Sunflower Bright Bunch", category: "flowers", price_egp: 320, stock: 30, description: "A cheerful bunch of sunflowers wrapped in recycled paper. Simple, sunny and always well received." },
      { slug: "pastel-peony-bouquet", name: "Pastel Peony Bouquet", category: "flowers", price_egp: 680, stock: 12, description: "Soft pink and cream peonies in a loose garden-style tie. Seasonal blooms, limited availability." },
      { slug: "dried-pampas-vase", name: "Dried Pampas Vase Arrangement", category: "flowers", price_egp: 750, stock: 10, description: "Pampas grass, bunny tails and preserved palm in a ceramic vase. Long-lasting decor that needs no water." },
      { slug: "graduation-flower-box", name: "Graduation Flower Box", category: "occasions", price_egp: 560, stock: 18, description: "Roses and chrysanthemums arranged in a tall hat-box with a congratulations ribbon. Ready to gift." },
      { slug: "rose-chocolate-gift-box", name: "Rose & Chocolate Gift Box", category: "gift-boxes", price_egp: 780, stock: 10, description: "Six red roses paired with a box of milk-chocolate pralines in a keepsake rigid box. Our most-requested ready-made gift." },
      { slug: "eid-celebration-bouquet", name: "Eid Celebration Bouquet", category: "occasions", price_egp: 480, stock: 20, description: "White roses, carnations and gold accents wrapped for Eid visits. Add a handwritten card at checkout." },
    ],
  },
  {
    slug: "cairo-cocoa",
    name: "Cairo Cocoa & Confections",
    status: "active",
    commission_rate: 0.15,
    city: "Cairo",
    governorate: "Cairo",
    delivery_coverage: { governorates: ["cairo", "giza"], areas: [] },
    contact_phone: "+20 100 000 0002",
    owner_email: `cairo-cocoa${DEMO_EMAIL_DOMAIN}`,
    description:
      "A maadi chocolate kitchen specialising in Belgian couverture, Egyptian date-and-nut confections and fresh-baked dessert trays. Corporate gift towers wrapped and branded on request.",
    products: [
      { slug: "belgian-dark-truffle-box", name: "Belgian Dark Truffle Box (16 pc)", category: "chocolates-sweets", price_egp: 380, stock: 40, description: "Sixteen single-origin dark truffles in a rigid gift box. Cocoa-forward, lightly salted finish." },
      { slug: "date-chocolate-gift-box", name: "Egyptian Date & Chocolate Gift Box", category: "chocolates-sweets", price_egp: 290, stock: 35, description: "Medjool dates stuffed with orange peel and dipped in milk chocolate — a local favourite for Eid and Christmas." },
      { slug: "pistachio-baklava-tray", name: "Pistachio Baklava Tray (1 kg)", category: "cakes-baked-goods", price_egp: 420, stock: 20, description: "One kilogram of fresh pistachio baklava, cut mixed (fingers and diamonds), syruped the morning of delivery." },
      { slug: "molten-cake-dessert-kit", name: "Molten Cake Dessert Kit", category: "cakes-baked-goods", price_egp: 260, stock: 25, description: "Two bake-at-home chocolate lava cakes with caramel pots. Instructions and a serving tray included." },
      { slug: "luxury-chocolate-tower", name: "Luxury Chocolate Tower (3 tiers)", category: "gift-boxes", price_egp: 1450, stock: 8, description: "Three stacked boxes of assorted pralines, truffles and hazelnut squares — our show-piece corporate gift." },
      { slug: "assorted-bonbon-bag", name: "Assorted Bonbon Bag (24 pc)", category: "chocolates-sweets", price_egp: 340, stock: 30, description: "Twenty-four assorted bonbons in a resealable stand-up bag. A casual sweet treat or party favour." },
      { slug: "honey-cake-cookies-tray", name: "Honey Cake & Cookies Tray", category: "cakes-baked-goods", price_egp: 380, stock: 22, description: "Slices of honey cake with butter cookies and a honey dip pot, arranged on a sharing tray. Serves six." },
      { slug: "kunafa-gift-tray", name: "Kunafa Gift Tray (1 kg)", category: "cakes-baked-goods", price_egp: 460, stock: 16, description: "One kilogram of fresh kunafa with cream and pistachio, baked the morning of delivery and boxed for gifting." },
      { slug: "corporate-chocolate-gift-hamper", name: "Corporate Chocolate Gift Hamper", category: "corporate-gifts", price_egp: 890, stock: 12, description: "A branded hamper of truffles, pralines and date confections with a company card. Volume pricing on ten or more." },
    ],
  },
  {
    slug: "legacy-engraving",
    name: "Legacy Engraving Studio",
    status: "active",
    commission_rate: 0.10,
    city: "Luxor",
    governorate: "Luxor",
    delivery_coverage: { governorates: ["luxor", "qena", "aswan"], areas: [] },
    contact_phone: "+20 100 000 0003",
    owner_email: `legacy-engraving${DEMO_EMAIL_DOMAIN}`,
    description:
      "A family workshop engraving names, dates and monograms into walnut, leather and brass. Personal keepsakes for weddings and graduations, plus small-batch corporate sets for Egyptian businesses.",
    products: [
      { slug: "engraved-walnut-keepsake-box", name: "Engraved Walnut Keepsake Box", category: "personalized-gifts", price_egp: 480, stock: 16, description: "Solid walnut box with a brass hinge, engraved with a name and date of your choice. Lined in felt." },
      { slug: "monogram-leather-journal", name: "Monogram Leather Journal", category: "personalized-gifts", price_egp: 320, stock: 22, description: "Refillable leather journal with a blind-debossed monogram on the cover. 200 pages of cream paper." },
      { slug: "personalized-photo-frame", name: "Personalized Photo Frame (Oak)", category: "personalized-gifts", price_egp: 270, stock: 28, description: "Oak frame for a 4x6 photo with a short engraved line beneath the image. Stand and wall mount." },
      { slug: "corporate-pen-card-set", name: "Corporate Pen & Card Set", category: "corporate-gifts", price_egp: 210, stock: 50, description: "Ballpoint pen and card case engraved with a company name. Minimum order of ten sets for bulk pricing." },
      { slug: "custom-name-wooden-toy", name: "Custom Name Wooden Toy", category: "toys-kids", price_egp: 240, stock: 20, description: "A name-train or name-letters toy in sanded beech with child-safe paint. A nursery keepsake." },
      { slug: "engraved-brass-compass", name: "Engraved Brass Compass", category: "personalized-gifts", price_egp: 390, stock: 14, description: "Working brass compass in a walnut case, engraved with coordinates or a short message. A graduation favourite." },
      { slug: "graduation-keepsake-gift-set", name: "Graduation Keepsake Gift Set", category: "occasions", price_egp: 620, stock: 14, description: "Engraved walnut pen, brass bookmark and a congratulations card in a gift box. Made for graduation day." },
      { slug: "branded-notebook-pen-corporate-set", name: "Branded Notebook & Pen Corporate Set", category: "corporate-gifts", price_egp: 260, stock: 50, description: "Hardcover notebook and ballpoint pen debossed with a company logo. Minimum order of ten sets for bulk pricing." },
      { slug: "personalized-family-name-sign", name: "Personalized Family Name Sign", category: "personalized-gifts", price_egp: 410, stock: 18, description: "Laser-cut wooden family name sign in walnut finish, sized for an entryway. Add the family name and year at checkout." },
    ],
  },
  {
    slug: "alex-toy-corner",
    name: "Alexandria Toy Corner",
    status: "active",
    commission_rate: 0.12,
    city: "Alexandria",
    governorate: "Alexandria",
    delivery_coverage: { governorates: ["alexandria", "beheira"], areas: [] },
    contact_phone: "+20 100 000 0004",
    owner_email: `alex-toy-corner${DEMO_EMAIL_DOMAIN}`,
    description:
      "A Smouha toy shop stocking plush animals, wooden puzzles, art kits and radio-control favourites. Gift wrapping included on every order, with age guidance from our shop team.",
    products: [
      { slug: "giant-teddy-bear-90cm", name: "Giant Teddy Bear (90 cm)", category: "toys-kids", price_egp: 720, stock: 12, description: "A 90 cm plush bear in caramel fur with a stitched paw pad. The big-reaction gift for first birthdays." },
      { slug: "wooden-building-blocks", name: "Wooden Building Blocks Set", category: "toys-kids", price_egp: 350, stock: 26, description: "Sixty natural beech blocks in a canvas carry bag. Ages 2+, meets EN71 safety standards." },
      { slug: "plush-dinosaur-duo", name: "Plush Dinosaur Duo", category: "toys-kids", price_egp: 280, stock: 30, description: "Two matching plush dinos — a green brachiosaurus and a friendly t-rex — boxed as a pair." },
      { slug: "kids-art-craft-kit", name: "Kids Art & Craft Kit", category: "toys-kids", price_egp: 190, stock: 40, description: "Forty-piece craft kit: crayons, stickers, coloured paper and simple project cards. Ages 4+." },
      { slug: "rc-off-road-buggy", name: "RC Off-Road Buggy", category: "toys-kids", price_egp: 580, stock: 15, description: "Rechargeable 1:16 scale buggy with all-terrain tyres and a 30-minute battery. Controller included." },
      { slug: "interactive-globe-puzzle", name: "Interactive Globe Puzzle", category: "toys-kids", price_egp: 440, stock: 18, description: "A 300-piece puzzle of a world globe that lights up with fun facts when finished. Ages 6+." },
    ],
  },
  {
    slug: "alex-gift-atelier",
    name: "Alexandria Gift Atelier",
    status: "active",
    commission_rate: 0.12,
    city: "Alexandria",
    governorate: "Alexandria",
    delivery_coverage: { governorates: ["alexandria"], areas: [] },
    contact_phone: "+20 100 000 0006",
    owner_email: `alex-gift-atelier${DEMO_EMAIL_DOMAIN}`,
    description:
      "A Stanley gift-box atelier curating ready-made boxes for birthdays, weddings and Ramadan — local blooms, sweets and engraved keepsakes assembled to order. Same-day delivery across Alexandria.",
    products: [
      { slug: "alex-corniche-gift-box", name: "Alexandria Corniche Gift Box", category: "gift-boxes", price_egp: 650, stock: 15, description: "A seaside-inspired box: dried blooms, sea-salt caramels and a mini candle, packed in our signature navy keepsake box." },
      { slug: "alex-ramadan-lantern-box", name: "Ramadan Lantern Gift Box", category: "gift-boxes", price_egp: 590, stock: 18, description: "A brass-effect lantern, dates and Arabic coffee in a crescent-stamped box. The ready-made Ramadan gift." },
      { slug: "alex-wedding-congratulations-box", name: "Wedding Congratulations Gift Box", category: "occasions", price_egp: 720, stock: 12, description: "White roses, gold-dipped chocolates and a congratulations card in an ivory box. Sent with a hand-tied ribbon." },
      { slug: "alex-engraved-name-plaque", name: "Engraved Name Plaque", category: "personalized-gifts", price_egp: 340, stock: 20, description: "A walnut name plaque engraved with a name and short message. A housewarming or newborn favourite." },
    ],
  },
  {
    slug: "delta-dried-flowers",
    name: "Delta Dried Flowers",
    status: "pending",
    commission_rate: 0.10,
    city: "Damietta",
    governorate: "Damietta",
    delivery_coverage: { governorates: ["damietta"], areas: [] },
    contact_phone: "+20 100 000 0005",
    owner_email: `delta-dried-flowers${DEMO_EMAIL_DOMAIN}`,
    description:
      "A new application from a Damietta studio drying locally grown flowers and herbs for wreaths and arrangements. Awaiting platform review — no products listed yet.",
    products: [],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generatePassword() {
  return crypto.randomBytes(12).toString("base64url");
}

async function findUserByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
}

async function ensureOwner(email) {
  let userId = null;
  const existing = await findUserByEmail(email);
  if (existing) {
    userId = existing.id;
    console.log(`  owner exists: ${email}`);
  } else {
    const password = generatePassword();
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser(${email}): ${error.message}`);
    userId = created.user.id;
    console.log(`  owner created: ${email} (password not printed — use npm run demo:passwords)`);
  }
  return userId;
}

async function ensureCategoryIds() {
  const { data, error } = await db.from("categories").select("id, slug");
  if (error) throw new Error(`categories select: ${error.message}`);
  const bySlug = new Map(data.map((c) => [c.slug, c.id]));
  const missing = CATEGORIES.filter(([, slug]) => !bySlug.has(slug));
  if (missing.length) {
    const { error: insErr } = await db.from("categories").upsert(
      missing.map(([name, slug, description, position]) => ({ name, slug, description, position })),
      { onConflict: "slug", ignoreDuplicates: true },
    );
    if (insErr) throw new Error(`categories insert: ${insErr.message}`);
    const { data: refreshed, error: reErr } = await db.from("categories").select("id, slug");
    if (reErr) throw new Error(`categories re-select: ${reErr.message}`);
    for (const c of refreshed) bySlug.set(c.slug, c.id);
  }
  return bySlug;
}

// Inserts a vendor with its final status/commission (INSERT is unguarded);
// on re-run updates descriptive fields only — never status or commission_rate,
// which vendors_guard_finance_fields rejects outside a platform-admin session.
async function ensureVendor(v, ownerId) {
  const { data: found, error: findErr } = await db
    .from("vendors")
    .select("id, is_demo")
    .eq("slug", v.slug)
    .maybeSingle();
  if (findErr) throw new Error(`vendors select(${v.slug}): ${findErr.message}`);
  if (found && !found.is_demo) {
    throw new Error(
      `Refusing to touch vendor '${v.slug}': it exists but is not demo data.`,
    );
  }

  const safeFields = {
    name: v.name,
    description: v.description,
    city: v.city,
    governorate: v.governorate,
    delivery_coverage: v.delivery_coverage,
    contact_phone: v.contact_phone,
    contact_email: v.owner_email,
    is_demo: true,
  };

  let vendorId;
  if (found) {
    vendorId = found.id;
    const { error: updErr } = await db.from("vendors").update(safeFields).eq("id", vendorId);
    if (updErr) throw new Error(`vendors update(${v.slug}): ${updErr.message}`);
    console.log(`  vendor exists: ${v.slug}`);
  } else {
    const { data: inserted, error: insErr } = await db
      .from("vendors")
      .insert({
        ...safeFields,
        slug: v.slug,
        status: v.status,
        commission_rate: v.commission_rate,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(`vendors insert(${v.slug}): ${insErr.message}`);
    vendorId = inserted.id;
    console.log(`  vendor created: ${v.slug} (${v.status})`);
  }

  const { error: memberErr } = await db
    .from("vendor_members")
    .upsert({ vendor_id: vendorId, profile_id: ownerId, role: "owner" }, {
      onConflict: "vendor_id,profile_id",
      ignoreDuplicates: true,
    });
  if (memberErr) throw new Error(`vendor_members(${v.slug}): ${memberErr.message}`);
  return vendorId;
}

async function ensureProduct(vendorId, vendorSlug, p, categoryIds, hasBucket) {
  const { data: found, error: findErr } = await db
    .from("products")
    .select("id, is_demo")
    .eq("vendor_id", vendorId)
    .eq("slug", p.slug)
    .maybeSingle();
  if (findErr) throw new Error(`products select(${p.slug}): ${findErr.message}`);
  if (found && !found.is_demo) {
    throw new Error(
      `Refusing to touch product '${p.slug}' in '${vendorSlug}': it exists but is not demo data.`,
    );
  }

  const row = {
    name: p.name,
    description: p.description,
    price_minor: p.price_egp * 100,
    stock: p.stock,
    status: "active",
    category_id: categoryIds.get(p.category),
    is_demo: true,
  };

  let productId;
  if (found) {
    productId = found.id;
    const { error: updErr } = await db.from("products").update(row).eq("id", productId);
    if (updErr) throw new Error(`products update(${p.slug}): ${updErr.message}`);
  } else {
    const { data: inserted, error: insErr } = await db
      .from("products")
      .insert({ ...row, vendor_id: vendorId, slug: p.slug })
      .select("id")
      .single();
    if (insErr) throw new Error(`products insert(${p.slug}): ${insErr.message}`);
    productId = inserted.id;
  }

  if (!hasBucket) return;

  const palette = CATEGORY_COLORS[p.category] ?? CATEGORY_COLORS["gift-boxes"];
  const png = gradientPng(800, hex(palette[0]), hex(palette[1]));
  const path = `${vendorId}/${productId}/hero-1.png`;
  const { error: upErr } = await storage.upload(path, png, {
    contentType: "image/png",
    upsert: true,
  });
  if (upErr) throw new Error(`storage upload(${p.slug}): ${upErr.message}`);

  const { error: imgErr } = await db
    .from("product_images")
    .upsert(
      { product_id: productId, path, alt: row.name, position: 0 },
      { onConflict: "product_id,path", ignoreDuplicates: true },
    );
  if (imgErr) throw new Error(`product_images(${p.slug}): ${imgErr.message}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Preflight: migration 10 must be applied (is_demo columns).
  const { error: probeErr } = await db.from("vendors").select("is_demo").limit(1);
  if (probeErr) {
    console.error("Preflight failed — is_demo column not found on vendors.");
    console.error("Push migrations first:  npx supabase db push");
    console.error(`(${probeErr.message})`);
    process.exit(1);
  }

  const { error: bucketErr } = await db.storage.getBucket("product-images");
  const hasBucket = !bucketErr;
  if (!hasBucket) {
    console.warn("WARNING: product-images bucket missing (migration 9 not applied).");
    console.warn("Seeding catalog without images; re-run after pushing migrations.");
  }

  console.log("Seeding categories…");
  const categoryIds = await ensureCategoryIds();

  let productCount = 0;
  for (const v of VENDORS) {
    console.log(`Seeding vendor ${v.slug}…`);
    const ownerId = await ensureOwner(v.owner_email);
    const vendorId = await ensureVendor(v, ownerId);
    for (const p of v.products) {
      await ensureProduct(vendorId, v.slug, p, categoryIds, hasBucket);
      productCount++;
    }
  }

  const [{ count: vendorCount }, { count: rowCount }] = await Promise.all([
    db.from("vendors").select("id", { count: "exact", head: true }).eq("is_demo", true),
    db.from("products").select("id", { count: "exact", head: true }).eq("is_demo", true),
  ]);
  console.log(`\nDone. ${vendorCount} demo vendors, ${productCount} products (${rowCount} flagged is_demo).`);
  console.log("Storefront: /shops · Admin queue: /admin (Delta Dried Flowers is pending).");
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});
