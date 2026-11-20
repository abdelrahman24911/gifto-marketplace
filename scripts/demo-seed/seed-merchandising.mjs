#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  ROOT,
  assertApplyConfirmation,
  assertTarget,
  loadEnv,
  parseArgs,
  readCredentials,
  selectAll,
  serviceClient,
  signInAdmin,
} from "./shared.mjs";

const SCRIPT = "merchandising";
const BANNER_DIR = path.join(ROOT, "data/demo-seed/occasion-banners");
const OCCASION_BUCKET = "occasion-images";
const MAX_TAGS_PER_PRODUCT = 10;

const TAGS = [
  ["gift-ready", "Gift-ready", "Arrives wrapped and ready to hand over."],
  ["personalized", "Personalized", "Can be engraved, monogrammed or named."],
  ["handmade", "Handmade", "Made or finished by hand in small batches."],
  ["luxury", "Luxury", "Premium pieces for milestone gifts."],
  ["same-day", "Same-day", "Available for same-day delivery in the city."],
  ["romantic", "Romantic", "Flowers, chocolate and keepsakes for someone special."],
  ["gourmet", "Gourmet", "Chocolate, coffee, dates and baked treats."],
  ["corporate", "Corporate", "Gifting sets suited to clients and teams."],
  ["home-decor", "Home decor", "Pieces that warm up a home."],
  ["keepsake", "Keepsake", "Designed to be kept and remembered."],
  ["kids", "Kids", "Toys, games and creative kits for children."],
  ["eco-friendly", "Eco-friendly", "Natural materials and lower-waste packaging."],
  ["egyptian-made", "Egyptian-made", "Locally designed or produced in Egypt."],
  ["under-1000-egp", "Under 1,000 EGP", "Thoughtful gifting under 1,000 EGP."],
  ["under-500-egp", "Under 500 EGP", "Small gifts with a big impact under 500 EGP."],
].map(([slug, name, description]) => ({ slug, name, description }));

const TAG_PRIORITY = TAGS.map((tag) => tag.slug);

const OCCASIONS = [
  {
    slug: "graduation",
    name: "Graduation",
    sortOrder: 10,
    banner: "graduation.jpg",
    description:
      "Mark the milestone with engraved keepsakes, flowers and gifts that celebrate years of hard work. Curated for graduates and the people cheering them on.",
    imageAlt: "A graduation cap and rolled diploma beside a bouquet of flowers",
    categorySlugs: ["gift-boxes", "corporate-gifts"],
    tagSlugs: ["corporate", "luxury"],
    picks: [
      "graduation-flower-box",
      "engraved-brass-compass",
      "monogram-leather-journal",
      "corporate-pen-card-set",
      "demo-catalog-dj-brown-leather-belt-watch",
      "demo-catalog-dj-longines-master-collection-watch",
      "demo-catalog-dj-women-handbag-black",
      "demo-catalog-dj-family-tree-photo-frame",
      "demo-catalog-dj-black-sun-glasses",
      "luxury-chocolate-tower",
    ],
  },
  {
    slug: "ramdan-night",
    name: "Ramadan Nights",
    sortOrder: 20,
    banner: "ramdan-night.jpg",
    description:
      "Thoughtful gifts for Ramadan evenings: dates and chocolate to share, coffee for the table and warm pieces for the home during the holy month.",
    imageAlt: "Lanterns, dates and a coffee cup arranged for a Ramadan evening",
    categorySlugs: ["gift-boxes", "chocolates-sweets"],
    tagSlugs: ["gourmet", "home-decor"],
    picks: [
      "date-chocolate-gift-box",
      "assorted-bonbon-bag",
      "belgian-dark-truffle-box",
      "pistachio-baklava-tray",
      "luxury-chocolate-tower",
      "demo-catalog-dj-nescafe-clasico-coffee-jar",
      "demo-catalog-dj-organic-wildflower-honey-jar",
      "demo-catalog-dj-mug-tree-stand",
      "demo-catalog-dj-spice-rack",
      "demo-catalog-dj-tray",
    ],
  },
  {
    slug: "birthdays",
    name: "Birthdays",
    sortOrder: 30,
    banner: "birthdays.jpg",
    description:
      "Birthday gifts for every age and personality, from bright flowers and chocolate to plush friends, creative kits and a little luxury.",
    imageAlt: "Colourful balloons, a gift box and a birthday cake",
    categorySlugs: ["flowers", "chocolates-sweets", "toys-kids"],
    tagSlugs: ["romantic", "kids", "gourmet"],
    picks: [
      "classic-red-rose-bouquet",
      "pastel-peony-bouquet",
      "sunflower-bright-bunch",
      "luxury-chocolate-tower",
      "molten-cake-dessert-kit",
      "giant-teddy-bear-90cm",
      "plush-dinosaur-duo",
      "rc-off-road-buggy",
      "demo-catalog-dj-family-tree-photo-frame",
      "demo-catalog-dj-chanel-coco-noir-eau-de-parfum",
    ],
  },
  {
    slug: "weddings",
    name: "Weddings",
    sortOrder: 40,
    banner: "weddings.jpg",
    description:
      "Elegant gifts for engagements and weddings: fresh flowers, engraved keepsakes, jewellery and a few luxurious finishing touches.",
    imageAlt: "A wedding bouquet, rings and wrapped gifts in soft ivory tones",
    categorySlugs: ["flowers", "chocolates-sweets"],
    tagSlugs: ["luxury", "romantic", "home-decor"],
    picks: [
      "classic-red-rose-bouquet",
      "white-lily-arrangement",
      "dried-pampas-vase",
      "engraved-walnut-keepsake-box",
      "personalized-photo-frame",
      "demo-catalog-dj-rolex-datejust-two-tone-watch",
      "demo-catalog-dj-green-crystal-earring",
      "demo-catalog-dj-family-tree-photo-frame",
      "luxury-chocolate-tower",
      "demo-catalog-dj-palm-tree-table-lamp",
    ],
  },
  {
    slug: "mothers-day",
    name: "Mother's Day",
    sortOrder: 50,
    banner: "mothers-day.jpg",
    description:
      "Flowers, fragrance and small luxuries for the person who holds everything together. A warm edit for Mother's Day and everyday thank-yous.",
    imageAlt: "A soft bouquet of peonies beside a wrapped gift and a candle",
    categorySlugs: ["flowers", "chocolates-sweets"],
    tagSlugs: ["romantic", "handmade", "gourmet"],
    picks: [
      "pastel-peony-bouquet",
      "white-lily-arrangement",
      "classic-red-rose-bouquet",
      "belgian-dark-truffle-box",
      "pistachio-baklava-tray",
      "demo-catalog-dj-organic-wildflower-honey-jar",
      "demo-catalog-dj-dior-jadore-eau-de-parfum",
      "demo-catalog-dj-gucci-bloom-eau-de-parfum",
      "demo-catalog-dj-green-crystal-earring",
      "demo-catalog-dj-family-tree-photo-frame",
    ],
  },
  {
    slug: "housewarming",
    name: "Housewarming",
    sortOrder: 60,
    banner: "housewarming.jpg",
    description:
      "Useful, beautiful things for a new home: lamps, planters, serving pieces and a few edible treats to make the first week easier.",
    imageAlt: "A lamp, plant and serving tray arranged in a warm new home",
    categorySlugs: ["gift-boxes", "cakes-baked-goods"],
    tagSlugs: ["home-decor", "eco-friendly"],
    picks: [
      "demo-catalog-dj-palm-tree-table-lamp",
      "demo-catalog-dj-plant-pot",
      "demo-catalog-dj-house-showpiece-plant",
      "demo-catalog-dj-chopping-board",
      "demo-catalog-dj-spice-rack",
      "demo-catalog-dj-tray",
      "demo-catalog-dj-mug-tree-stand",
      "demo-catalog-dj-organic-wildflower-honey-jar",
      "demo-catalog-dj-nescafe-clasico-coffee-jar",
      "dried-pampas-vase",
    ],
  },
];

const SUGGESTIONS = [
  {
    vendorSlug: "nile-blossoms",
    name: "Gift sets",
    slug: "gift-sets",
    description: "Ready-made bundles combining flowers, chocolate and a card.",
  },
  {
    vendorSlug: "legacy-engraving",
    name: "Arabic calligraphy",
    slug: "arabic-calligraphy",
    description: "Engraved pieces featuring Arabic lettering or a family name.",
  },
  {
    vendorSlug: "cairo-cocoa",
    name: "Sugar-free",
    slug: "sugar-free",
    description: "Lower-sugar chocolate and date options for dietary needs.",
  },
];

function productTags(product) {
  const slug = product.slug;
  const name = product.name.toLowerCase();
  const category = product.category?.slug ?? "";
  const vendor = product.vendor?.slug ?? "";
  const legacy = !slug.startsWith("demo-catalog-dj-");
  const tags = new Set(["gift-ready"]);

  if (
    category === "personalized-gifts" ||
    /personalized|monogram|engraved|custom|initial|photo frame/.test(name)
  ) {
    tags.add("personalized");
  }
  if (
    ["flowers", "chocolates-sweets", "cakes-baked-goods", "toys-kids"].includes(category) ||
    /bouquet|wooden|handmade|engraved|teddy|plush/.test(name)
  ) {
    tags.add("handmade");
  }
  if (
    product.price_minor >= 500000 ||
    /rolex|prada|gucci|chanel|dior|longines|iwc|leather bag/.test(name)
  ) {
    tags.add("luxury");
  }
  if (category === "flowers") tags.add("same-day");
  if (
    ["flowers", "chocolates-sweets"].includes(category) ||
    /rose|peony|perfume|j'adore|bloom|earring|crystal/.test(name)
  ) {
    tags.add("romantic");
  }
  if (
    ["chocolates-sweets", "cakes-baked-goods"].includes(category) ||
    /honey|coffee|baklava|chocolate|bonbon|truffle|cake/.test(name)
  ) {
    tags.add("gourmet");
  }
  if (category === "corporate-gifts" || /corporate|pen|journal|notebook/.test(name)) {
    tags.add("corporate");
  }
  if (/lamp|vase|plant|pot|frame|tray|rack|board|mug|showpiece/.test(name)) {
    tags.add("home-decor");
  }
  if (
    category === "personalized-gifts" ||
    /engraved|keepsake|monogram|photo frame|compass|journal/.test(name)
  ) {
    tags.add("keepsake");
  }
  if (category === "toys-kids") tags.add("kids");
  if (
    /honey|flower|rose|peony|sunflower|lily|pampas|wooden|plant|organic/.test(name) ||
    category === "flowers"
  ) {
    tags.add("eco-friendly");
  }
  if (legacy || /egyptian|date|baklava|honey/.test(name) || vendor === "cairo-cocoa") {
    tags.add("egyptian-made");
  }
  if (product.price_minor < 100000) tags.add("under-1000-egp");
  if (product.price_minor < 50000) tags.add("under-500-egp");

  return [...tags]
    .sort((a, b) => TAG_PRIORITY.indexOf(a) - TAG_PRIORITY.indexOf(b))
    .slice(0, MAX_TAGS_PER_PRODUCT);
}

async function loadCatalog(admin, db) {
  const [categories, products, vendors, members] = await Promise.all([
    selectAll(() => admin.from("categories").select("id, slug, is_active")),
    selectAll(() =>
      admin
        .from("products")
        .select(
          "id, slug, name, price_minor, status, is_demo, category:categories(slug), vendor:vendors(slug)",
        ),
    ),
    selectAll(() => db.from("vendors").select("id, slug, name, is_demo, status")),
    selectAll(() => db.from("vendor_members").select("vendor_id, profile_id, role")),
  ]);

  const categoryBySlug = new Map(
    categories.filter((category) => category.is_active).map((category) => [category.slug, category]),
  );
  const productBySlug = new Map(products.map((product) => [product.slug, product]));
  const vendorBySlug = new Map(vendors.map((vendor) => [vendor.slug, vendor]));
  const ownerByVendor = new Map(
    members.filter((member) => member.role === "owner").map((member) => [member.vendor_id, member.profile_id]),
  );

  const activeDemoProducts = products.filter(
    (product) =>
      product.status === "active" &&
      product.is_demo &&
      product.vendor &&
      product.category,
  );

  const missingCategories = OCCASIONS.flatMap((occasion) => occasion.categorySlugs).filter(
    (slug) => !categoryBySlug.has(slug),
  );
  if (missingCategories.length) {
    throw new Error(`Missing active categories: ${[...new Set(missingCategories)].join(", ")}.`);
  }

  const missingPicks = OCCASIONS.flatMap((occasion) => occasion.picks).filter(
    (slug) => !productBySlug.has(slug),
  );
  if (missingPicks.length) {
    throw new Error(`Missing occasion products: ${[...new Set(missingPicks)].join(", ")}.`);
  }

  const inactivePicks = OCCASIONS.flatMap((occasion) => occasion.picks).filter((slug) => {
    const product = productBySlug.get(slug);
    return product && product.status !== "active";
  });
  if (inactivePicks.length) {
    throw new Error(`Inactive occasion products: ${[...new Set(inactivePicks)].join(", ")}.`);
  }

  for (const suggestion of SUGGESTIONS) {
    const vendor = vendorBySlug.get(suggestion.vendorSlug);
    if (!vendor || !vendor.is_demo || vendor.status !== "active") {
      throw new Error(`${suggestion.vendorSlug}: suggestion vendor is missing, inactive or not demo data.`);
    }
    if (!ownerByVendor.has(vendor.id)) {
      throw new Error(`${suggestion.vendorSlug}: no owner profile for the suggestion.`);
    }
  }

  return {
    categoryBySlug,
    productBySlug,
    activeDemoProducts,
    vendorBySlug,
    ownerByVendor,
  };
}

async function applyTags(admin, tagIds) {
  const expectedSlugs = TAGS.map((tag) => tag.slug);
  const { data: existing, error: lookupError } = await admin
    .from("tags")
    .select("id, slug")
    .in("slug", expectedSlugs);
  if (lookupError) throw new Error(`tag lookup failed: ${lookupError.message}`);
  const existingBySlug = new Map((existing ?? []).map((tag) => [tag.slug, tag]));

  for (const tag of TAGS) {
    const row = existingBySlug.get(tag.slug);
    const payload = {
      name: tag.name,
      description: tag.description,
      is_active: true,
    };
    const { error } = row
      ? await admin.from("tags").update(payload).eq("id", row.id)
      : await admin.from("tags").insert({ ...payload, slug: tag.slug });
    if (error) throw new Error(`${tag.slug}: tag write failed: ${error.message}`);
  }

  const { data: allTags, error: allTagsError } = await admin
    .from("tags")
    .select("id, slug, name");
  if (allTagsError) throw new Error(`tag cleanup lookup failed: ${allTagsError.message}`);
  const names = new Set(TAGS.map((tag) => tag.name));
  const canonicalSlugs = new Set(expectedSlugs);
  const duplicates = (allTags ?? []).filter(
    (tag) => names.has(tag.name) && !canonicalSlugs.has(tag.slug),
  );
  for (const duplicate of duplicates) {
    const [productUse, occasionUse] = await Promise.all([
      admin
        .from("product_tags")
        .select("product_id", { count: "exact", head: true })
        .eq("tag_id", duplicate.id),
      admin
        .from("occasion_tags")
        .select("occasion_id", { count: "exact", head: true })
        .eq("tag_id", duplicate.id),
    ]);
    if (productUse.error || occasionUse.error) {
      throw new Error(`tag cleanup check failed for ${duplicate.slug}.`);
    }
    if ((productUse.count ?? 0) > 0 || (occasionUse.count ?? 0) > 0) {
      console.warn(`${duplicate.slug}: duplicate tag still in use; leaving it in place.`);
      continue;
    }
    const { error } = await admin.from("tags").delete().eq("id", duplicate.id);
    if (error) throw new Error(`${duplicate.slug}: duplicate tag delete failed: ${error.message}`);
    console.log(`${duplicate.slug}: removed unused duplicate tag.`);
  }

  const { data, error } = await admin
    .from("tags")
    .select("id, slug")
    .in("slug", expectedSlugs);
  if (error) throw new Error(`tag reload failed: ${error.message}`);
  const bySlug = new Map((data ?? []).map((tag) => [tag.slug, tag.id]));
  const missing = TAGS.filter((tag) => !bySlug.has(tag.slug));
  if (missing.length) throw new Error(`tags missing after upsert: ${missing.map((tag) => tag.slug).join(", ")}`);
  for (const [slug, id] of bySlug) tagIds.set(slug, id);
}

async function assignProductTags(admin, catalog, tagIds) {
  const assignments = catalog.activeDemoProducts.map((product) => ({
    productId: product.id,
    tagIds: productTags(product).map((slug) => tagIds.get(slug)),
  }));

  let index = 0;
  const workers = Array.from({ length: 5 }, async () => {
    while (index < assignments.length) {
      const assignment = assignments[index];
      index += 1;
      const { error } = await admin.rpc("replace_product_tags", {
        p_product_id: assignment.productId,
        p_tag_ids: assignment.tagIds,
      });
      if (error) {
        throw new Error(`tag assignment failed for ${assignment.productId}: ${error.message}`);
      }
    }
  });
  await Promise.all(workers);
  return assignments.length;
}

async function upsertOccasions(admin, db, catalog, tagIdsBySlug) {
  const uploaded = [];
  for (const occasion of OCCASIONS) {
    const { data: existing, error: lookupError } = await admin
      .from("occasions")
      .select("id, slug")
      .eq("slug", occasion.slug)
      .maybeSingle();
    if (lookupError) throw new Error(`${occasion.slug}: occasion lookup failed: ${lookupError.message}`);

    const payload = {
      name: occasion.name,
      description: occasion.description,
      image_alt: occasion.imageAlt,
      is_active: true,
      sort_order: occasion.sortOrder,
      match_mode: "hybrid",
    };
    const { data: row, error } = existing
      ? await admin
          .from("occasions")
          .update(payload)
          .eq("id", existing.id)
          .select("id, slug")
          .maybeSingle()
      : await admin
          .from("occasions")
          .insert({ ...payload, slug: occasion.slug })
          .select("id, slug")
          .maybeSingle();
    if (error) throw new Error(`${occasion.slug}: occasion upsert failed: ${error.message}`);
    if (!row) throw new Error(`${occasion.slug}: occasion upsert returned no row.`);
    if (row.slug !== occasion.slug) {
      throw new Error(`${occasion.slug}: unexpected slug ${row.slug} after upsert.`);
    }

    const buffer = await readFile(path.join(BANNER_DIR, occasion.banner));
    const objectPath = `${row.id}/demo-banner.jpg`;
    const { error: uploadError } = await db.storage
      .from(OCCASION_BUCKET)
      .upload(objectPath, buffer, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: true,
      });
    if (uploadError) throw new Error(`${occasion.slug}: banner upload failed: ${uploadError.message}`);

    const { error: imageError } = await admin
      .from("occasions")
      .update({ image_path: objectPath })
      .eq("id", row.id);
    if (imageError) throw new Error(`${occasion.slug}: image path update failed: ${imageError.message}`);

    const productIds = occasion.picks.map((slug) => catalog.productBySlug.get(slug).id);
    const categoryIds = occasion.categorySlugs.map((slug) => catalog.categoryBySlug.get(slug).id);
    const tagIds = occasion.tagSlugs.map((slug) => {
      const id = tagIdsBySlug.get(slug);
      if (!id) throw new Error(`${occasion.slug}: missing tag ${slug}.`);
      return id;
    });

    const { error: pickError } = await admin.rpc("replace_occasion_products", {
      p_occasion_id: row.id,
      p_product_ids: productIds,
    });
    if (pickError) throw new Error(`${occasion.slug}: product picks failed: ${pickError.message}`);

    const { error: ruleError } = await admin.rpc("replace_occasion_matching_rules", {
      p_occasion_id: row.id,
      p_category_ids: categoryIds,
      p_tag_ids: tagIds,
    });
    if (ruleError) throw new Error(`${occasion.slug}: matching rules failed: ${ruleError.message}`);

    uploaded.push({ slug: occasion.slug, id: row.id, objectPath });
    console.log(
      `${occasion.slug}: updated with ${productIds.length} picks, ${categoryIds.length} categories and ${tagIds.length} tags.`,
    );
  }
  return uploaded;
}

async function seedSuggestions(db, catalog) {
  let created = 0;
  for (const suggestion of SUGGESTIONS) {
    const vendor = catalog.vendorBySlug.get(suggestion.vendorSlug);
    const { data: existing, error: existingError } = await db
      .from("tag_suggestions")
      .select("id, status")
      .eq("vendor_id", vendor.id)
      .eq("normalized_slug", suggestion.slug)
      .maybeSingle();
    if (existingError) throw new Error(`${suggestion.slug}: suggestion lookup failed: ${existingError.message}`);
    if (existing) {
      console.log(`${suggestion.slug}: suggestion already exists (${existing.status}).`);
      continue;
    }
    const { error } = await db.from("tag_suggestions").insert({
      name: suggestion.name,
      normalized_slug: suggestion.slug,
      description: suggestion.description,
      suggested_by: catalog.ownerByVendor.get(vendor.id),
      vendor_id: vendor.id,
      status: "pending",
    });
    if (error) throw new Error(`${suggestion.slug}: suggestion insert failed: ${error.message}`);
    created += 1;
  }
  return created;
}

async function verify(admin, db, catalog) {
  let failures = 0;

  const { data: tags, error: tagError } = await admin
    .from("tags")
    .select("id, slug, is_active")
    .in(
      "slug",
      TAGS.map((tag) => tag.slug),
    );
  if (tagError) throw new Error(`tag verification failed: ${tagError.message}`);
  const activeTags = (tags ?? []).filter((tag) => tag.is_active);
  if (activeTags.length !== TAGS.length) {
    failures += 1;
    console.error(`expected ${TAGS.length} active tags, found ${activeTags.length}.`);
  }

  const { data: allTags, error: allTagsError } = await admin
    .from("tags")
    .select("id, slug, name");
  if (allTagsError) throw new Error(`tag name verification failed: ${allTagsError.message}`);
  const tagNames = new Set(TAGS.map((tag) => tag.name));
  const duplicateTags = (allTags ?? []).filter((tag) => tagNames.has(tag.name));
  if (duplicateTags.length !== TAGS.length) {
    failures += 1;
    console.error(
      `expected ${TAGS.length} tags by name, found ${duplicateTags.length}: ${duplicateTags.map((tag) => tag.slug).join(", ")}`,
    );
  }

  const { data: productTagRows, error: productTagError } = await admin
    .from("product_tags")
    .select("product_id, tag_id")
    .in(
      "product_id",
      catalog.activeDemoProducts.map((product) => product.id),
    );
  if (productTagError) throw new Error(`product tag verification failed: ${productTagError.message}`);
  const countByProduct = new Map();
  for (const row of productTagRows ?? []) {
    countByProduct.set(row.product_id, (countByProduct.get(row.product_id) ?? 0) + 1);
  }
  const untagged = catalog.activeDemoProducts.filter((product) => !countByProduct.has(product.id));
  const overTagged = catalog.activeDemoProducts.filter(
    (product) => (countByProduct.get(product.id) ?? 0) > MAX_TAGS_PER_PRODUCT,
  );
  if (untagged.length) {
    failures += 1;
    console.error(`untagged products: ${untagged.map((product) => product.slug).join(", ")}`);
  }
  if (overTagged.length) {
    failures += 1;
    console.error(
      `over-tagged products: ${overTagged
        .map((product) => `${product.slug} (${countByProduct.get(product.id)})`)
        .join(", ")}`,
    );
  }

  const { data: occasions, error: occasionError } = await admin
    .from("occasions")
    .select("id, slug, name, is_active, image_path, match_mode")
    .in(
      "slug",
      OCCASIONS.map((occasion) => occasion.slug),
    );
  if (occasionError) throw new Error(`occasion verification failed: ${occasionError.message}`);
  const occasionBySlug = new Map((occasions ?? []).map((occasion) => [occasion.slug, occasion]));

  const { data: allOccasions, error: allOccasionsError } = await admin
    .from("occasions")
    .select("id, slug, name");
  if (allOccasionsError) throw new Error(`occasion name verification failed: ${allOccasionsError.message}`);
  const occasionNames = new Set(OCCASIONS.map((occasion) => occasion.name));
  const duplicateOccasions = (allOccasions ?? []).filter((occasion) =>
    occasionNames.has(occasion.name),
  );
  if (duplicateOccasions.length !== OCCASIONS.length) {
    failures += 1;
    console.error(
      `expected ${OCCASIONS.length} occasions by name, found ${duplicateOccasions.length}: ${duplicateOccasions.map((occasion) => occasion.slug).join(", ")}`,
    );
  }

  for (const expected of OCCASIONS) {
    const occasionFailures = failures;
    const occasion = occasionBySlug.get(expected.slug);
    if (!occasion) {
      failures += 1;
      console.error(`${expected.slug}: missing.`);
      continue;
    }
    if (!occasion.is_active) {
      failures += 1;
      console.error(`${expected.slug}: not active.`);
    }
    if (occasion.match_mode !== "hybrid") {
      failures += 1;
      console.error(`${expected.slug}: match mode is ${occasion.match_mode}.`);
    }
    if (!occasion.image_path) {
      failures += 1;
      console.error(`${expected.slug}: missing banner path.`);
    } else {
      const download = await db.storage.from(OCCASION_BUCKET).download(occasion.image_path);
      if (download.error) {
        failures += 1;
        console.error(`${expected.slug}: banner object missing (${download.error.message}).`);
      }
    }

    const [picks, categories, rules, productsResult] = await Promise.all([
      admin
        .from("occasion_products")
        .select("product_id", { count: "exact", head: true })
        .eq("occasion_id", occasion.id),
      admin
        .from("occasion_categories")
        .select("category_id", { count: "exact", head: true })
        .eq("occasion_id", occasion.id),
      admin
        .from("occasion_tags")
        .select("tag_id", { count: "exact", head: true })
        .eq("occasion_id", occasion.id),
      admin.rpc("get_occasion_products", {
        p_occasion_id: occasion.id,
        p_limit: 100,
        p_offset: 0,
      }),
    ]);
    for (const [label, result] of [
      ["picks", picks],
      ["categories", categories],
      ["tags", rules],
    ]) {
      if (result.error) throw new Error(`${expected.slug}: ${label} verification failed: ${result.error.message}`);
    }
    if ((picks.count ?? 0) < 8) {
      failures += 1;
      console.error(`${expected.slug}: only ${picks.count ?? 0} manual picks.`);
    }
    if ((categories.count ?? 0) < 2) {
      failures += 1;
      console.error(`${expected.slug}: only ${categories.count ?? 0} category rules.`);
    }
    if ((rules.count ?? 0) < 2) {
      failures += 1;
      console.error(`${expected.slug}: only ${rules.count ?? 0} tag rules.`);
    }
    if (productsResult.error) {
      failures += 1;
      console.error(`${expected.slug}: matching RPC failed (${productsResult.error.message}).`);
    } else if ((productsResult.data ?? []).length < 8) {
      failures += 1;
      console.error(`${expected.slug}: matching RPC returned only ${(productsResult.data ?? []).length} products.`);
    }
    if (failures === occasionFailures) {
      console.log(
        `${expected.slug}: active, banner ok, ${picks.count} picks, ${categories.count} categories, ${rules.count} tags, ${(productsResult.data ?? []).length} matched products.`,
      );
    }
  }

  const demoVendorIds = SUGGESTIONS.map(
    (suggestion) => catalog.vendorBySlug.get(suggestion.vendorSlug).id,
  );
  const { data: suggestions, error: suggestionError } = await db
    .from("tag_suggestions")
    .select("normalized_slug, status, vendor_id")
    .in("vendor_id", demoVendorIds)
    .eq("status", "pending");
  if (suggestionError) throw new Error(`suggestion verification failed: ${suggestionError.message}`);
  const pending = new Set((suggestions ?? []).map((suggestion) => suggestion.normalized_slug));
  for (const expected of SUGGESTIONS) {
    if (!pending.has(expected.slug)) {
      failures += 1;
      console.error(`${expected.slug}: pending suggestion missing.`);
    }
  }
  if (pending.size >= SUGGESTIONS.length) {
    console.log(`tag suggestions: ${pending.size} pending across ${demoVendorIds.length} vendors.`);
  }

  if (failures > 0) throw new Error(`${failures} merchandising check(s) failed.`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log("Usage: node scripts/demo-seed/seed-merchandising.mjs [--verify|--apply]");
    return;
  }
  if (!args.verify && !args.apply) {
    throw new Error("Choose --verify or --apply.");
  }

  loadEnv();
  const target = assertTarget();
  if (args.apply) assertApplyConfirmation(SCRIPT);

  const db = serviceClient(target);
  const credentials = await readCredentials();
  const { client: admin, user } = await signInAdmin(target, credentials);
  const catalog = await loadCatalog(admin, db);

  if (args.verify) {
    await verify(admin, db, catalog);
    await admin.auth.signOut();
    return;
  }

  const tagIds = new Map();
  await applyTags(admin, tagIds);
  const assigned = await assignProductTags(admin, catalog, tagIds);
  const uploaded = await upsertOccasions(admin, db, catalog, tagIds);
  const suggestions = await seedSuggestions(db, catalog);

  console.log(
    `Seeded ${TAGS.length} tags on ${assigned} products, ${uploaded.length} occasions and ${suggestions} suggestions.`,
  );
  await verify(admin, db, catalog);
  await admin.auth.signOut();
  console.log(`Admin session verified for ${user.email}.`);
}

main().catch((error) => {
  console.error(`Merchandising seed failed: ${error.message}`);
  process.exit(1);
});
