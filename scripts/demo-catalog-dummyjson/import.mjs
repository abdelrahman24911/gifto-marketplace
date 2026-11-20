#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  DATA_DIR,
  HERO_CONTENT_TYPE,
  IMPORT_CONFIRM,
  PRODUCT_IMAGES_BUCKET,
  VENDOR_SLUGS,
  assertConfirmation,
  assertTarget,
  credentialsPath,
  expectedImageObjectName,
  imageObjectPath,
  loadEnv,
  parseArgs,
  readCredentials,
  validateLocalDataset,
} from "./shared.mjs";

function usage() {
  console.log(`Usage:
  node scripts/demo-catalog-dummyjson/import.mjs            Local plan only; no network requests.
  node scripts/demo-catalog-dummyjson/import.mjs --verify  Sign in and verify target rows; no writes.
  node scripts/demo-catalog-dummyjson/import.mjs --apply   Import or refresh the catalogue; requires confirmation.

Required for --verify/--apply:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  DEMO_CATALOG_ENV=local|preview
  DEMO_CATALOG_CONFIRM="${IMPORT_CONFIRM}" (only for --apply)

For hosted previews, also set DEMO_CATALOG_ALLOWED_PROJECT_REFS.
Credentials are read from ${credentialsPath()} or DEMO_CATALOG_CREDENTIALS_FILE.
The service-role key is never read by this script.`);
}

function makeClient(target) {
  return createClient(target.url, target.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function requireCredential(credentials, vendorSlug) {
  const credential = credentials?.[vendorSlug];
  if (!credential?.email || !credential?.password) {
    throw new Error(`Missing credentials for vendor ${vendorSlug}.`);
  }
  return credential;
}

async function signIn(client, credential, vendorSlug) {
  const { data, error } = await client.auth.signInWithPassword({
    email: credential.email,
    password: credential.password,
  });
  if (error) throw new Error(`${vendorSlug}: sign-in failed: ${error.message}`);
  if (!data.user) throw new Error(`${vendorSlug}: sign-in returned no user.`);
  return data.user;
}

async function loadVendorSession(target, credentials, products, vendorSlug) {
  const credential = requireCredential(credentials, vendorSlug);
  const client = makeClient(target);
  const user = await signIn(client, credential, vendorSlug);

  const { data: vendor, error: vendorError } = await client
    .from("vendors")
    .select("id, slug, name, status, is_demo")
    .eq("slug", vendorSlug)
    .maybeSingle();
  if (vendorError) throw new Error(`${vendorSlug}: vendor lookup failed: ${vendorError.message}`);
  if (!vendor) throw new Error(`${vendorSlug}: vendor not found for this signed-in owner.`);
  if (!vendor.is_demo) throw new Error(`${vendorSlug}: refusing to import into a non-demo vendor.`);
  if (vendor.status !== "active") throw new Error(`${vendorSlug}: vendor is not active (${vendor.status}).`);

  const { data: membership, error: membershipError } = await client
    .from("vendor_members")
    .select("role")
    .eq("vendor_id", vendor.id)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (membershipError) throw new Error(`${vendorSlug}: membership lookup failed: ${membershipError.message}`);
  if (!membership || !["owner", "manager"].includes(membership.role)) {
    throw new Error(`${vendorSlug}: signed-in user is not an owner or manager of the demo vendor.`);
  }

  const vendorProducts = products.filter((product) => product.vendorSlug === vendorSlug);
  const slugs = vendorProducts.map((product) => product.slug);
  const { data: existing, error: productError } = await client
    .from("products")
    .select("id, slug, vendor_id, name, description, price_minor, stock, category_id, status, is_demo")
    .eq("vendor_id", vendor.id)
    .in("slug", slugs);
  if (productError) throw new Error(`${vendorSlug}: product lookup failed: ${productError.message}`);

  const existingBySlug = new Map((existing ?? []).map((product) => [product.slug, product]));
  for (const product of vendorProducts) {
    const row = existingBySlug.get(product.slug);
    if (row && !row.is_demo) {
      throw new Error(`${vendorSlug}/${product.slug}: slug belongs to a non-demo product; refusing to overwrite it.`);
    }
  }

  return {
    vendorSlug,
    client,
    user,
    vendor,
    products: vendorProducts,
    existingBySlug,
  };
}

async function loadCategoryIds(client, products) {
  const slugs = [
    ...new Set(products.map((product) => product.categorySlug).filter(Boolean)),
  ];
  const { data, error } = await client
    .from("categories")
    .select("id, slug")
    .in("slug", slugs)
    .eq("is_active", true);
  if (error) throw new Error(`Category lookup failed: ${error.message}`);

  const categoryIds = new Map((data ?? []).map((category) => [category.slug, category.id]));
  const missing = slugs.filter((slug) => !categoryIds.has(slug));
  if (missing.length) {
    throw new Error(`Missing active categories: ${missing.join(", ")}.`);
  }
  return categoryIds;
}

async function loadSessions(target, credentials, products) {
  const sessions = [];
  for (const vendorSlug of VENDOR_SLUGS) {
    sessions.push(await loadVendorSession(target, credentials, products, vendorSlug));
  }
  const categoryIds = await loadCategoryIds(sessions[0].client, products);
  for (const session of sessions) {
    session.categoryIds = categoryIds;
  }
  return sessions;
}

function printPlan(result) {
  console.log(
    `Local plan for ${result.products.length} products (${result.dataset.datasetId}@${result.dataset.version}):`,
  );
  console.log("Curation groups:", result.groupCounts);
  console.log("Vendors:", result.vendorCounts);
  console.log("Category mapping:", result.categoryCounts);
  console.log("Existing Gifto categories are referenced, not created or edited; the v1 catalogue and the 24 pre-existing demo products are not touched.");
  console.log("No network request was made. Use --verify to check a target, or --apply to write.");
}

function printSessionSummary(session) {
  const existing = session.existingBySlug.size;
  const missing = session.products.length - existing;
  const stockDifferences = session.products.filter((product) => {
    const row = session.existingBySlug.get(product.slug);
    return row && row.stock !== product.stock;
  }).length;
  const existingProducts = session.products.filter((product) =>
    session.existingBySlug.has(product.slug),
  );
  const categoryMatches = existingProducts.filter((product) => {
    const row = session.existingBySlug.get(product.slug);
    return row?.category_id === session.categoryIds.get(product.categorySlug);
  }).length;
  console.log(
    `${session.vendorSlug}: vendor=${session.vendor.id} existing=${existing} missing=${missing} stock-differences-preserved=${stockDifferences} category-matches=${categoryMatches}/${existingProducts.length}`,
  );
}

async function verifySessions(sessions) {
  for (const session of sessions) {
    printSessionSummary(session);
    const ids = [...session.existingBySlug.values()].map((product) => product.id);
    if (ids.length === 0) continue;
    const { data: images, error } = await session.client
      .from("product_images")
      .select("product_id, path")
      .in("product_id", ids);
    if (error) throw new Error(`${session.vendorSlug}: image lookup failed: ${error.message}`);
    const heroCount = (images ?? []).filter((image) =>
      image.path.endsWith(`/${expectedImageObjectName()}`),
    ).length;
    console.log(`${session.vendorSlug}: hero-image-rows=${heroCount}/${ids.length}`);
    const mismatched = session.products
      .filter((product) => {
        const row = session.existingBySlug.get(product.slug);
        return row && row.category_id !== session.categoryIds.get(product.categorySlug);
      })
      .map((product) => product.slug);
    console.log(
      `${session.vendorSlug}: category-mismatches=${mismatched.length}/${ids.length}`,
    );
    if (mismatched.length) {
      console.log(`${session.vendorSlug}: unexpected categories: ${mismatched.join(", ")}`);
    }
    const missing = session.products
      .filter((product) => !session.existingBySlug.has(product.slug))
      .map((product) => product.slug);
    if (missing.length) console.log(`${session.vendorSlug}: missing slugs: ${missing.join(", ")}`);
  }
}

async function uploadImageIfMissing(session, product, productId) {
  const objectName = expectedImageObjectName();
  const objectPath = imageObjectPath(session.vendor.id, productId);
  const { data: objects, error: listError } = await session.client.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .list(`${session.vendor.id}/${productId}`, { limit: 100 });
  if (listError) throw new Error(`${product.demoId}: storage list failed: ${listError.message}`);
  const exists = (objects ?? []).some((object) => object.name === objectName);
  if (!exists) {
    const buffer = await readFile(path.join(DATA_DIR, product.image.path));
    const { error: uploadError } = await session.client.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(objectPath, buffer, {
        contentType: HERO_CONTENT_TYPE,
        cacheControl: "31536000",
        upsert: false,
      });
    if (uploadError) throw new Error(`${product.demoId}: image upload failed: ${uploadError.message}`);
  }
  return { objectPath, uploaded: !exists };
}

async function importProduct(session, product) {
  const row = session.existingBySlug.get(product.slug);
  const categoryId = session.categoryIds.get(product.categorySlug);
  if (!categoryId) {
    throw new Error(`${product.demoId}: no active category for ${product.categorySlug}.`);
  }
  const payload = {
    name: product.name,
    description: product.description,
    price_minor: product.priceEgp * 100,
    category_id: categoryId,
    status: product.status,
  };

  let productId;
  let created = false;
  if (row) {
    const { data, error } = await session.client
      .from("products")
      .update(payload)
      .eq("id", row.id)
      .eq("vendor_id", session.vendor.id)
      .eq("is_demo", true)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`${product.demoId}: product update failed: ${error.message}`);
    if (!data) throw new Error(`${product.demoId}: product update was blocked by RLS.`);
    productId = data.id;
  } else {
    const { data, error } = await session.client
      .from("products")
      .insert({
        ...payload,
        vendor_id: session.vendor.id,
        slug: product.slug,
        stock: product.stock,
        currency: "EGP",
        is_demo: true,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`${product.demoId}: product insert failed: ${error.message}`);
    if (!data) throw new Error(`${product.demoId}: product insert returned no row.`);
    productId = data.id;
    created = true;
  }

  const { objectPath, uploaded } = await uploadImageIfMissing(session, product, productId);
  const { error: imageRowError } = await session.client.from("product_images").upsert(
    {
      product_id: productId,
      path: objectPath,
      alt: product.image.alt,
      position: 0,
    },
    { onConflict: "product_id,path" },
  );
  if (imageRowError) throw new Error(`${product.demoId}: image row upsert failed: ${imageRowError.message}`);

  return { productId, created, uploaded };
}

async function applySessions(sessions) {
  let created = 0;
  let updated = 0;
  let uploaded = 0;

  for (const session of sessions) {
    console.log(`Importing ${session.products.length} products for ${session.vendorSlug}...`);
    for (const product of session.products) {
      const result = await importProduct(session, product);
      if (result.created) created += 1;
      else updated += 1;
      if (result.uploaded) uploaded += 1;
    }
  }

  return { created, updated, uploaded };
}

async function verifyImported(sessions) {
  let failures = 0;
  for (const session of sessions) {
    const slugs = session.products.map((product) => product.slug);
    const { data: rows, error } = await session.client
      .from("products")
      .select("id, slug, status, is_demo, category_id")
      .eq("vendor_id", session.vendor.id)
      .in("slug", slugs)
      .eq("is_demo", true)
      .eq("status", "active");
    if (error) throw new Error(`${session.vendorSlug}: final verification failed: ${error.message}`);
    const rowsBySlug = new Map((rows ?? []).map((row) => [row.slug, row]));
    const missing = slugs.filter((slug) => !rowsBySlug.has(slug));
    if (missing.length) {
      failures += missing.length;
      console.error(`${session.vendorSlug}: missing or misconfigured after import: ${missing.join(", ")}`);
    }
    const mismatched = session.products
      .filter((product) => {
        const row = rowsBySlug.get(product.slug);
        return row && row.category_id !== session.categoryIds.get(product.categorySlug);
      })
      .map((product) => product.slug);
    if (mismatched.length) {
      failures += mismatched.length;
      console.error(`${session.vendorSlug}: wrong category after import: ${mismatched.join(", ")}`);
    }
    if (missing.length === 0 && mismatched.length === 0) {
      console.log(
        `${session.vendorSlug}: verified ${slugs.length}/${slugs.length} active, categorised demo products.`,
      );
    }
  }
  if (failures > 0) throw new Error(`${failures} product(s) failed final verification.`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    usage();
    return;
  }

  const local = await validateLocalDataset();
  if (local.errors.length > 0) {
    for (const error of local.errors) console.error(`- ${error}`);
    throw new Error(`Local dataset has ${local.errors.length} issue(s).`);
  }

  if (!args.verify && !args.apply) {
    printPlan(local);
    return;
  }

  loadEnv();
  const target = assertTarget();
  if (args.apply) assertConfirmation(IMPORT_CONFIRM);

  const credentials = await readCredentials();
  const sessions = await loadSessions(target, credentials, local.products);

  try {
    if (args.verify) {
      console.log(`Verified target ${target.hostname} (${target.environment}); no writes performed.`);
      await verifySessions(sessions);
      return;
    }

    const counts = await applySessions(sessions);
    await verifyImported(sessions);
    console.log(
      `Import complete: ${counts.created} created, ${counts.updated} updated, ${counts.uploaded} images uploaded.`,
    );
    console.log("Existing stock values were preserved on refreshed products; new products received their initial stock.");
    console.log("Products were mapped to existing categories:", local.categoryCounts);
  } finally {
    await Promise.allSettled(sessions.map((session) => session.client.auth.signOut()));
  }
}

main().catch((error) => {
  console.error(`DummyJSON demo catalogue import failed: ${error.message}`);
  process.exit(1);
});
